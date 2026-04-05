import { ActiveSelection, Canvas, type ModifiedEvent } from "fabric";
import { type CoursewareNode, EditorController, type EditorSnapshot, type Slide } from "@canvas-courseware/core";
import { registerEditorCanvasEvents } from "./editor-canvas-events";
import {
  applySelectionToCanvas,
  createEditorNodeObject,
  type FabricNodeObject,
  findNode,
  readObjectGeometry,
  readNodeMeta,
  renderEmptyCanvas,
  resolveCanvasSelectionNodeIds,
  resolveActiveSelectionNodeTranslations,
  resolveSlide,
  resolveTextNodeChange,
  syncCanvasFrame,
} from "./editor-adapter-support";
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

    registerEditorCanvasEvents(this.canvas, {
      emitSelectionChange: this.emitSelectionChange.bind(this),
      captureSelectionTarget: this.captureSelectionTarget.bind(this),
      handleObjectModified: this.handleObjectModified.bind(this),
      handleTextChanged: this.handleTextChanged.bind(this),
    });

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

    const slide = resolveSlide(snapshot, this.currentSlideId);

    if (!slide) {
      this.currentSlideId = this.currentSlideId ?? snapshot.activeSlideId;
      this.lastDocumentRef = snapshot.document;
      this.lastRenderedSlideId = null;
      this.isSyncing = true;
      try {
        renderEmptyCanvas(canvas, this.objectMap);
      } finally {
        this.isSyncing = false;
      }
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
      syncCanvasFrame(canvas, slide);
    }

    this.isSyncing = true;
    try {
      applySelectionToCanvas(canvas, snapshot.selection, slide.id, this.objectMap);
    } finally {
      this.isSyncing = false;
    }
  }

  private async renderSlide(canvas: Canvas, slide: Slide): Promise<void> {
    const syncVersion = ++this.syncVersion;
    this.isSyncing = true;

    try {
      this.objectMap.clear();
      canvas.clear();
      syncCanvasFrame(canvas, slide);

      const objects: FabricNodeObject[] = [];

      for (const node of slide.nodes) {
        const object = await createEditorNodeObject(node, slide.id);

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

  private emitSelectionChange(): void {
    if (this.isSyncing || !this.canvas || !this.controller || !this.currentSlideId) {
      return;
    }

    const retainedNodeId = this.getRetainedSelectionNodeId();
    const nodeIds = resolveCanvasSelectionNodeIds(this.canvas, retainedNodeId);

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
    if (!target) {
      return;
    }

    if (target instanceof ActiveSelection) {
      const action = (event.action ?? event.transform?.action ?? "").toLowerCase();
      if (
        action.includes("scale") ||
        action.includes("resize") ||
        action.includes("skew") ||
        action.includes("rotate")
      ) {
        return;
      }

      this.clearRetainedSelection();
      const translatedNodes = resolveActiveSelectionNodeTranslations(
        this.controller.getSnapshot(),
        this.currentSlideId,
        target,
      );

      for (const node of translatedNodes) {
        this.controller.handleAdapterEvent({
          type: "adapter.node.translated",
          slideId: this.currentSlideId,
          nodeId: node.nodeId,
          x: node.x,
          y: node.y,
        });
      }
      return;
    }

    const meta = readNodeMeta(target);
    if (!meta) {
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

    const textChange = resolveTextNodeChange(
      this.controller.getSnapshot(),
      this.currentSlideId,
      target,
    );
    if (!textChange) {
      return;
    }

    this.controller.handleAdapterEvent({
      type: "adapter.text.changed",
      slideId: this.currentSlideId,
      nodeId: textChange.nodeId,
      text: textChange.text,
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
}
