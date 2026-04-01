import {
  ActiveSelection,
  Canvas,
  type FabricObject,
  type ModifiedEvent,
} from "fabric";
import {
  DEFAULT_TEXT_FONT_FAMILY,
  type CoursewareNode,
  EditorController,
  type EditorSnapshot,
  type ImageNode,
  type RectNode,
  type SelectionState,
  type Slide,
} from "@canvas-courseware/core";
import {
  createFabricNodeObject,
  type FabricRenderableObject,
} from "./object-factory";

const NODE_META_KEY = "__coursewareNodeMeta";

interface FabricNodeMeta {
  nodeId: string;
  slideId: string;
  nodeType: CoursewareNode["type"];
}

type FabricNodeObject = FabricRenderableObject & {
  [NODE_META_KEY]?: FabricNodeMeta;
  getScaledWidth?: () => number;
  getScaledHeight?: () => number;
};

export interface FabricEditorAdapterMountOptions {
  canvasElement: HTMLCanvasElement;
  slideId?: string;
}

export interface FabricEditorAdapterOptions {
  controller?: EditorController;
  slideId?: string;
}

export class FabricEditorAdapter {
  private canvas: Canvas | null = null;
  private controller: EditorController | null = null;
  private unsubscribeSnapshot: (() => void) | null = null;
  private currentSlideId: string | null = null;
  private readonly objectMap = new Map<string, FabricNodeObject>();
  private isSyncing = false;
  private syncVersion = 0;
  private lastDocumentRef: EditorSnapshot["document"] | null = null;
  private lastRenderedSlideId: string | null = null;

  constructor(options: FabricEditorAdapterOptions = {}) {
    this.currentSlideId = options.slideId ?? null;

    if (options.controller) {
      this.bindController(options.controller);
    }
  }

  bindController(controller: EditorController): void {
    this.unsubscribeSnapshot?.();
    this.controller = controller;
    this.unsubscribeSnapshot = controller.subscribe((snapshot) => {
      void this.syncFromSnapshot(snapshot);
    });

    if (this.canvas) {
      void this.syncFromSnapshot(controller.getSnapshot());
    }
  }

  getCanvas(): Canvas | null {
    return this.canvas;
  }

  getSlideId(): string | null {
    return this.currentSlideId;
  }

  async mount(options: FabricEditorAdapterMountOptions): Promise<void> {
    await this.disposeCanvas();

    this.currentSlideId =
      options.slideId ??
      this.currentSlideId ??
      this.controller?.getSnapshot().activeSlideId ??
      null;

    this.canvas = new Canvas(options.canvasElement, {
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: "#FFFFFF",
    });

    this.registerCanvasEvents(this.canvas);

    if (this.controller) {
      const snapshot = this.controller.getSnapshot();
      await this.syncFromSnapshot(snapshot);

      const readySlideId = this.currentSlideId ?? snapshot.activeSlideId;
      if (readySlideId) {
        this.controller.handleAdapterEvent({
          type: "adapter.ready",
          slideId: readySlideId,
        });
      }
    }
  }

  async setSlideId(slideId: string | null): Promise<void> {
    this.currentSlideId = slideId;
    await this.sync();
  }

  async sync(): Promise<void> {
    if (!this.controller) {
      return;
    }

    await this.syncFromSnapshot(this.controller.getSnapshot());
  }

  async dispose(): Promise<void> {
    this.unsubscribeSnapshot?.();
    this.unsubscribeSnapshot = null;
    this.controller = null;
    await this.disposeCanvas();
  }

  private async disposeCanvas(): Promise<void> {
    this.syncVersion += 1;
    this.objectMap.clear();
    this.lastDocumentRef = null;
    this.lastRenderedSlideId = null;

    if (!this.canvas) {
      return;
    }

    const currentCanvas = this.canvas;
    this.canvas = null;
    await currentCanvas.dispose();
  }

  private async syncFromSnapshot(snapshot: EditorSnapshot): Promise<void> {
    const canvas = this.canvas;

    if (!canvas) {
      return;
    }

    const slide = this.resolveSlide(snapshot);

    if (!slide) {
      this.currentSlideId = this.currentSlideId ?? snapshot.activeSlideId;
      this.lastDocumentRef = snapshot.document;
      this.renderEmptyCanvas(canvas);
      return;
    }

    this.currentSlideId = slide.id;

    if (
      this.lastDocumentRef !== snapshot.document ||
      this.lastRenderedSlideId !== slide.id ||
      this.objectMap.size !== slide.nodes.length
    ) {
      await this.renderSlide(canvas, slide);
      this.lastDocumentRef = snapshot.document;
    } else {
      this.syncCanvasFrame(canvas, slide);
    }

    this.applySelection(canvas, snapshot.selection, slide.id);
  }

  private resolveSlide(snapshot: EditorSnapshot): Slide | undefined {
    const slideId = this.currentSlideId ?? snapshot.activeSlideId;
    return slideId
      ? snapshot.document.slides.find((slide) => slide.id === slideId)
      : undefined;
  }

  private async renderSlide(canvas: Canvas, slide: Slide): Promise<void> {
    const syncVersion = ++this.syncVersion;
    this.isSyncing = true;

    try {
      this.objectMap.clear();
      canvas.clear();
      this.syncCanvasFrame(canvas, slide);

      const objects: FabricNodeObject[] = [];

      for (const node of slide.nodes) {
        const object = await this.createObjectForNode(node, slide.id);

        if (syncVersion !== this.syncVersion || !this.canvas) {
          return;
        }

        if (object) {
          objects.push(object);
          this.objectMap.set(node.id, object);
        }
      }

      if (objects.length > 0) {
        canvas.add(...objects);
      }

      this.lastRenderedSlideId = slide.id;
      canvas.renderAll();
    } finally {
      this.isSyncing = false;
    }
  }

  private renderEmptyCanvas(canvas: Canvas): void {
    this.isSyncing = true;

    try {
      this.objectMap.clear();
      this.lastRenderedSlideId = null;
      canvas.clear();
      canvas.backgroundColor = "#FFFFFF";
      canvas.renderAll();
    } finally {
      this.isSyncing = false;
    }
  }

  private syncCanvasFrame(canvas: Canvas, slide: Slide): void {
    canvas.setDimensions({
      width: slide.size.width,
      height: slide.size.height,
    });
    canvas.backgroundColor = slide.background.fill;
  }

  private registerCanvasEvents(canvas: Canvas): void {
    canvas.on("selection:created", () => {
      this.emitSelectionChange();
    });

    canvas.on("selection:updated", () => {
      this.emitSelectionChange();
    });

    canvas.on("selection:cleared", () => {
      this.emitSelectionChange();
    });

    canvas.on("object:modified", (event) => {
      this.handleObjectModified(event);
    });

    canvas.on("text:changed", (event) => {
      this.handleTextChanged(event.target as FabricNodeObject | undefined);
    });
  }

  private emitSelectionChange(): void {
    if (this.isSyncing || !this.canvas || !this.controller || !this.currentSlideId) {
      return;
    }

    const nodeIds = this.canvas
      .getActiveObjects()
      .map((object) => readNodeMeta(object as FabricNodeObject)?.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId));

    this.controller.handleAdapterEvent({
      type: "adapter.selection.changed",
      slideId: this.currentSlideId,
      nodeIds,
    });
  }

  private handleObjectModified(event: ModifiedEvent): void {
    if (this.isSyncing || !this.controller || !this.currentSlideId) {
      return;
    }

    const target = event.target as FabricNodeObject | undefined;
    const meta = target ? readNodeMeta(target) : null;

    if (!target || !meta || target instanceof ActiveSelection) {
      return;
    }

    const action = (event.action ?? event.transform?.action ?? "").toLowerCase();
    const nextGeometry = readObjectGeometry(target);
    const previousNode = findNode(this.controller.getSnapshot(), this.currentSlideId, meta.nodeId);

    if (action.includes("scale") || action.includes("resize") || action.includes("skew")) {
      if (
        !previousNode ||
        previousNode.x !== nextGeometry.x ||
        previousNode.y !== nextGeometry.y ||
        previousNode.width !== nextGeometry.width ||
        previousNode.height !== nextGeometry.height
      ) {
        this.controller.handleAdapterEvent({
          type: "adapter.node.resized",
          slideId: this.currentSlideId,
          nodeId: meta.nodeId,
          patch: nextGeometry,
        });
      }
      return;
    }

    if (action.includes("rotate")) {
      if (!previousNode || previousNode.rotation !== nextGeometry.rotation) {
        this.controller.handleAdapterEvent({
          type: "adapter.node.rotated",
          slideId: this.currentSlideId,
          nodeId: meta.nodeId,
          rotation: nextGeometry.rotation,
        });
      }
      return;
    }

    if (!previousNode || previousNode.x !== nextGeometry.x || previousNode.y !== nextGeometry.y) {
      this.controller.handleAdapterEvent({
        type: "adapter.node.translated",
        slideId: this.currentSlideId,
        nodeId: meta.nodeId,
        x: nextGeometry.x,
        y: nextGeometry.y,
      });
    }
  }

  private handleTextChanged(target: FabricNodeObject | undefined): void {
    if (this.isSyncing || !this.controller || !this.currentSlideId || !target) {
      return;
    }

    const meta = readNodeMeta(target);

    if (!meta || typeof target.text !== "string") {
      return;
    }

    const previousNode = findNode(this.controller.getSnapshot(), this.currentSlideId, meta.nodeId);
    if (previousNode?.type !== "text" || previousNode.props.text === target.text) {
      return;
    }

    this.controller.handleAdapterEvent({
      type: "adapter.text.changed",
      slideId: this.currentSlideId,
      nodeId: meta.nodeId,
      text: target.text,
    });
  }

  private applySelection(canvas: Canvas, selection: SelectionState, slideId: string): void {
    this.isSyncing = true;

    try {
      const selectedObjects =
        selection.slideId === slideId
          ? selection.nodeIds
              .map((nodeId) => this.objectMap.get(nodeId))
              .filter((object): object is FabricNodeObject => Boolean(object))
          : [];

      canvas.discardActiveObject();

      if (selectedObjects.length === 1) {
        canvas.setActiveObject(selectedObjects[0]);
      } else if (selectedObjects.length > 1) {
        canvas.setActiveObject(
          new ActiveSelection(selectedObjects, {
            canvas,
          }),
        );
      }

      canvas.renderAll();
    } finally {
      this.isSyncing = false;
    }
  }

  private async createObjectForNode(
    node: CoursewareNode,
    slideId: string,
  ): Promise<FabricNodeObject | null> {
    return (await createFabricNodeObject(node, {
      interactive: true,
      finalizeObject: (object, currentNode) => {
        /**
         * 编辑态必须默认全显当前 slide 的所有对象。
         * 即使节点在预览态为了后续步骤而以 `visible=false` 起始，
         * 进入编辑画布后也要强制显示，避免排版和时间轴配置时看不到对象。
         */
        applyEditorVisibilityStrategy(object as FabricNodeObject);
        attachNodeMeta(object as FabricNodeObject, currentNode, slideId);
      },
    })) as FabricNodeObject | null;
  }
}

/**
 * 编辑态统一采用“默认全显”的展示策略。
 * 这里不改动文档中的 `visible` 字段，只覆盖编辑画布中的实际显示状态，
 * 从而保持编辑态与播放态解耦。
 */
function applyEditorVisibilityStrategy(object: FabricNodeObject): void {
  object.visible = true;
}

function attachNodeMeta(object: FabricNodeObject, node: CoursewareNode, slideId: string): void {
  object[NODE_META_KEY] = {
    nodeId: node.id,
    slideId,
    nodeType: node.type,
  };
}

function readNodeMeta(object: FabricNodeObject | null | undefined): FabricNodeMeta | null {
  if (!object) {
    return null;
  }

  return object[NODE_META_KEY] ?? null;
}

function readObjectGeometry(object: FabricNodeObject) {
  return {
    x: round(object.left ?? 0),
    y: round(object.top ?? 0),
    width: round(resolveScaledSize(object, "width", "scaleX")),
    height: round(resolveScaledSize(object, "height", "scaleY")),
    rotation: round(object.angle ?? 0),
  };
}

function resolveScaledSize(
  object: FabricNodeObject,
  dimensionKey: "width" | "height",
  scaleKey: "scaleX" | "scaleY",
): number {
  const methodName = dimensionKey === "width" ? "getScaledWidth" : "getScaledHeight";
  const method = object[methodName];

  if (typeof method === "function") {
    return method.call(object);
  }

  return Number(object[dimensionKey] ?? 0) * Number(object[scaleKey] ?? 1);
}

function findNode(
  snapshot: EditorSnapshot,
  slideId: string,
  nodeId: string,
): CoursewareNode | undefined {
  return snapshot.document.slides
    .find((slide) => slide.id === slideId)
    ?.nodes.find((node) => node.id === nodeId);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
