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
/**
 * 对象拖拽、缩放、旋转结束后，Fabric 可能会短暂抛出一次空选中。
 * 这里保留一个很短的兜底窗口，避免编辑侧面板被误清空。
 */
const SELECTION_RETENTION_WINDOW_MS = 180;
/**
 * 略微放大画布的目标命中容差，帮助缩放控制点在自动化和真实鼠标操作里更容易命中。
 * 这里保持一个很小的数值，避免把普通点击误识别成对象操作。
 */
const EDITOR_TARGET_FIND_TOLERANCE = 6;

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
  /** 当前挂载的 Fabric 画布实例。 */
  private canvas: Canvas | null = null;
  /** 当前绑定的编辑控制器。 */
  private controller: EditorController | null = null;
  /** 当前快照订阅的释放函数。 */
  private unsubscribeSnapshot: (() => void) | null = null;
  /** 当前激活的 slide id。 */
  private currentSlideId: string | null = null;
  /** 节点 id 到 Fabric 对象的映射。 */
  private readonly objectMap = new Map<string, FabricNodeObject>();
  /** 当前是否处于内部同步阶段。 */
  private isSyncing = false;
  /** 用于避免异步渲染串扰的同步版本号。 */
  private syncVersion = 0;
  /** 上一次参与渲染的文档引用。 */
  private lastDocumentRef: EditorSnapshot["document"] | null = null;
  /** 上一次完成渲染的 slide id。 */
  private lastRenderedSlideId: string | null = null;
  /** 最近一次需要保留的单选节点 id。 */
  private retainedSelectionNodeId: string | null = null;
  /** 最近一次保留选中态的截止时间戳。 */
  private retainedSelectionExpiresAt = 0;
  /** 对象变换后的延迟重选计时器。 */
  private selectionRestoreTimer: ReturnType<typeof setTimeout> | null = null;

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
      targetFindTolerance: EDITOR_TARGET_FIND_TOLERANCE,
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
    this.clearSelectionRestoreTimer();

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

    /**
     * 变换过程先记录当前目标节点。
     * 这样即使 Fabric 中途抛出空选中，也能在短窗口内保住单选态。
     */
    canvas.on("object:moving", (event) => {
      this.captureSelectionTarget(event.target as FabricNodeObject | undefined);
    });

    canvas.on("object:scaling", (event) => {
      this.captureSelectionTarget(event.target as FabricNodeObject | undefined);
    });

    canvas.on("object:rotating", (event) => {
      this.captureSelectionTarget(event.target as FabricNodeObject | undefined);
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

    const canvasNodeIds = this.canvas
      .getActiveObjects()
      .map((object) => readNodeMeta(object as FabricNodeObject)?.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    const retainedNodeId = this.getRetainedSelectionNodeId();
    const nodeIds =
      canvasNodeIds.length === 0 && retainedNodeId ? [retainedNodeId] : canvasNodeIds;

    if (nodeIds.length === 1) {
      this.retainSelection(nodeIds[0]);
    } else {
      this.clearRetainedSelection();
    }

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
    const didResize =
      !previousNode ||
      previousNode.width !== nextGeometry.width ||
      previousNode.height !== nextGeometry.height;
    const didRotate = !previousNode || previousNode.rotation !== nextGeometry.rotation;
    const didTranslate = !previousNode || previousNode.x !== nextGeometry.x || previousNode.y !== nextGeometry.y;
    this.retainSelection(meta.nodeId);

    /**
     * 缩放结束后的事件 action 在不同对象和命中路径下并不总是稳定带上 `scale/resize`。
     * 这里优先根据几何尺寸是否真的变化来判断“是否发生了缩放”，
     * 避免对象已经被拉伸，但因为 action 为空而错过尺寸落盘。
     */
    if (
      didResize &&
      (
        action.includes("scale") ||
        action.includes("resize") ||
        action.includes("skew") ||
        !action
      )
    ) {
      this.controller.handleAdapterEvent({
        type: "adapter.node.resized",
        slideId: this.currentSlideId,
        nodeId: meta.nodeId,
        patch: nextGeometry,
      });
      this.syncRetainedSelection();
      this.scheduleSelectionRestore(meta.nodeId);
      return;
    }

    if (action.includes("rotate")) {
      if (didRotate) {
        this.controller.handleAdapterEvent({
          type: "adapter.node.rotated",
          slideId: this.currentSlideId,
          nodeId: meta.nodeId,
          rotation: nextGeometry.rotation,
        });
      }
      this.syncRetainedSelection();
      this.scheduleSelectionRestore(meta.nodeId);
      return;
    }

    if (didTranslate) {
      this.controller.handleAdapterEvent({
        type: "adapter.node.translated",
        slideId: this.currentSlideId,
        nodeId: meta.nodeId,
        x: nextGeometry.x,
        y: nextGeometry.y,
      });
    }

    this.syncRetainedSelection();
    this.scheduleSelectionRestore(meta.nodeId);
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

  /** 从当前 Fabric 目标对象中提取要保留的单选节点。 */
  private captureSelectionTarget(target: FabricNodeObject | undefined): void {
    const meta = target ? readNodeMeta(target) : null;
    if (!meta) {
      return;
    }

    this.retainSelection(meta.nodeId);
  }

  /** 为单个节点开启一个很短的选中保留窗口。 */
  private retainSelection(nodeId: string): void {
    this.retainedSelectionNodeId = nodeId;
    this.retainedSelectionExpiresAt = Date.now() + SELECTION_RETENTION_WINDOW_MS;
  }

  /** 清空当前保留的选中节点。 */
  private clearRetainedSelection(): void {
    this.retainedSelectionNodeId = null;
    this.retainedSelectionExpiresAt = 0;
  }

  /** 清理尚未执行的延迟重选任务。 */
  private clearSelectionRestoreTimer(): void {
    if (!this.selectionRestoreTimer) {
      return;
    }

    clearTimeout(this.selectionRestoreTimer);
    this.selectionRestoreTimer = null;
  }

  /** 读取当前仍然有效的保留节点 id。 */
  private getRetainedSelectionNodeId(): string | null {
    if (
      !this.retainedSelectionNodeId ||
      Date.now() > this.retainedSelectionExpiresAt
    ) {
      this.clearRetainedSelection();
      return null;
    }

    return this.retainedSelectionNodeId;
  }

  /** 在对象变换落盘后，显式把单选态同步回标准控制器。 */
  private syncRetainedSelection(): void {
    if (!this.controller || !this.currentSlideId) {
      return;
    }

    const nodeId = this.getRetainedSelectionNodeId();
    if (!nodeId) {
      return;
    }

    this.controller.handleAdapterEvent({
      type: "adapter.selection.changed",
      slideId: this.currentSlideId,
      nodeIds: [nodeId],
    });
  }

  /** 在对象变换落盘后的下一拍重建 Fabric 和控制器两边的单选态。 */
  private scheduleSelectionRestore(nodeId: string): void {
    if (!this.currentSlideId) {
      return;
    }

    const slideId = this.currentSlideId;
    this.clearSelectionRestoreTimer();
    this.selectionRestoreTimer = setTimeout(() => {
      this.selectionRestoreTimer = null;

      if (!this.canvas || !this.controller || this.currentSlideId !== slideId) {
        return;
      }

      const targetObject = this.objectMap.get(nodeId);
      if (!targetObject) {
        return;
      }

      this.isSyncing = true;
      try {
        this.canvas.setActiveObject(targetObject);
        this.canvas.renderAll();
      } finally {
        this.isSyncing = false;
      }

      this.controller.handleAdapterEvent({
        type: "adapter.selection.changed",
        slideId,
        nodeIds: [nodeId],
      });
    }, 0);
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
