import { ActiveSelection, Canvas, type ModifiedEvent } from "fabric";
import { type CoursewareNode, EditorController, type EditorSnapshot, type Slide } from "@canvas-courseware/core";
import { registerEditorCanvasEvents } from "./editor-canvas-events";
import {
  applyCanvasBackgroundImage,
  applySelectionToCanvas,
  createEditorNodeObject,
  type FabricNodeObject,
  findNode,
  loadCanvasBackgroundImage,
  readObjectGeometry,
  readNodeMeta,
  renderEmptyCanvas,
  resetCanvasBackground,
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

/** 编辑器右键菜单请求的标准化载荷。 */
export interface FabricEditorContextMenuRequest {
  /** 右键时的视口 X 坐标。 */
  clientX: number;
  /** 右键时的视口 Y 坐标。 */
  clientY: number;
  /** 当前命中的 slide id。 */
  slideId: string | null;
  /** 当前命中的节点 id；空值表示点在空白区域。 */
  nodeId: string | null;
  /** 当前右键菜单对应的标准选中节点集合。 */
  selectionNodeIds: string[];
}

export interface FabricEditorAdapterMountOptions {
  canvasElement: HTMLCanvasElement;
  slideId?: string;
}

export interface FabricEditorAdapterOptions {
  controller?: EditorController;
  slideId?: string;
  /** 当编辑器请求展示右键菜单时，向 UI 层抛出的标准化菜单事件。 */
  onContextMenuRequest?: (payload: FabricEditorContextMenuRequest) => void;
}

/** 编辑态文本对象需要额外使用的 Fabric 能力。 */
type EditableFabricTextObject = FabricNodeObject & {
  /** 当前对象是否允许进入文本编辑。 */
  editable: boolean;
  /** 当前是否处于文本编辑中。 */
  isEditing?: boolean;
  /** 进入 Fabric 文本编辑态。 */
  enterEditing?: (event?: Event) => void;
  /** 退出 Fabric 文本编辑态。 */
  exitEditing?: () => void;
  /** Fabric 用于接收真实输入的隐藏 textarea。 */
  hiddenTextarea?: HTMLTextAreaElement | null;
};

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
  /** 适配层向 UI 层抛出的右键菜单回调。 */
  private readonly onContextMenuRequest?: (payload: FabricEditorContextMenuRequest) => void;

  constructor(options: FabricEditorAdapterOptions = {}) {
    this.currentSlideId = options.slideId ?? null;
    this.onContextMenuRequest = options.onContextMenuRequest;

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

  /** 当用户点击非画布区域时，主动结束当前文本对象的内联编辑态。 */
  exitActiveTextEditing(): void {
    const activeObject = this.canvas?.getActiveObject() as EditableFabricTextObject | undefined;
    if (!activeObject?.isEditing || typeof activeObject.exitEditing !== "function") {
      return;
    }

    activeObject.exitEditing();
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
      fireRightClick: true,
      stopContextMenu: true,
    });

    registerEditorCanvasEvents(this.canvas, {
      emitSelectionChange: this.emitSelectionChange.bind(this),
      captureSelectionTarget: this.captureSelectionTarget.bind(this),
      handleObjectModified: this.handleObjectModified.bind(this),
      handleTextChanged: this.handleTextChanged.bind(this),
      handleTextDoubleClick: this.handleTextDoubleClick.bind(this),
      handleTextEditingEntered: this.handleTextEditingEntered.bind(this),
      handleTextEditingExited: this.handleTextEditingExited.bind(this),
      handleContextMenu: this.handleContextMenu.bind(this),
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
    } else if (this.shouldSyncCanvasFrame(canvas, slide)) {
      /**
       * 纯选中态变化也会走到 `syncFromSnapshot`。
       * 如果这里每次都重新 `setDimensions`，在部分浏览器与显示缩放环境下，
       * 点击对象会触发整个 Fabric 画布的瞬时重排，表现成“画布整体收缩 / 抖动”。
       * 因此这里只在画布逻辑尺寸或背景色真的漂移时才补做 frame 同步。
       */
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
      resetCanvasBackground(canvas);

      const backgroundImage = await loadCanvasBackgroundImage(slide);

      if (syncVersion !== this.syncVersion || !this.canvas) {
        return;
      }

      applyCanvasBackgroundImage(canvas, backgroundImage);

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

  /** 仅当 Fabric 画布逻辑尺寸或背景色与当前 slide 不一致时，才需要重同步 frame。 */
  private shouldSyncCanvasFrame(canvas: Canvas, slide: Slide): boolean {
    const hasSizeDrift =
      canvas.getWidth() !== slide.size.width || canvas.getHeight() !== slide.size.height;
    const hasBackgroundDrift =
      typeof canvas.backgroundColor === "string"
        ? canvas.backgroundColor !== slide.background.fill
        : true;

    return hasSizeDrift || hasBackgroundDrift;
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
      this.handleActiveSelectionModified(event, target);
      return;
    }

    this.handleSingleObjectModified(event, target);
  }

  /** 处理多选整体变换结束后的文档回写，确保批量拖拽只生成一次历史记录。 */
  private handleActiveSelectionModified(
    event: ModifiedEvent,
    target: ActiveSelection,
  ): void {
    if (!this.controller || !this.currentSlideId) {
      return;
    }

    const action = (event.action ?? event.transform?.action ?? "").toLowerCase();
    if (isSelectionTransformAction(action)) {
      return;
    }

    this.clearRetainedSelection();
    const translatedNodes = resolveActiveSelectionNodeTranslations(
      this.controller.getSnapshot(),
      this.currentSlideId,
      target,
    );
    if (translatedNodes.length === 0) {
      return;
    }

    this.controller.handleAdapterEvent({
      type: "adapter.nodes.translated",
      slideId: this.currentSlideId,
      updates: translatedNodes,
    });
  }

  /** 处理单个对象的拖拽、缩放和旋转落盘。 */
  private handleSingleObjectModified(
    event: ModifiedEvent,
    target: FabricNodeObject,
  ): void {
    if (!this.controller || !this.currentSlideId) {
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
    const didTranslate =
      !previousNode ||
      previousNode.x !== nextGeometry.x ||
      previousNode.y !== nextGeometry.y;
    this.retainSelection(meta.nodeId);

    if (this.handleResizeModification(action, didResize, meta.nodeId, nextGeometry)) {
      return;
    }

    if (this.handleRotationModification(action, didRotate, meta.nodeId, nextGeometry.rotation)) {
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

  /** 在缩放命中路径不稳定时，仍然根据几何变化准确回写尺寸。 */
  private handleResizeModification(
    action: string,
    didResize: boolean,
    nodeId: string,
    nextGeometry: ReturnType<typeof readObjectGeometry>,
  ): boolean {
    if (!this.controller || !this.currentSlideId) {
      return false;
    }

    if (!didResize || !isResizeAction(action)) {
      return false;
    }

    this.controller.handleAdapterEvent({
      type: "adapter.node.resized",
      slideId: this.currentSlideId,
      nodeId,
      patch: nextGeometry,
    });
    this.syncRetainedSelection();
    this.scheduleSelectionRestore(nodeId);
    return true;
  }

  /** 单独收口旋转回写和后续选中态恢复，避免主流程继续膨胀。 */
  private handleRotationModification(
    action: string,
    didRotate: boolean,
    nodeId: string,
    rotation: number,
  ): boolean {
    if (!this.controller || !this.currentSlideId || !action.includes("rotate")) {
      return false;
    }

    if (didRotate) {
      this.controller.handleAdapterEvent({
        type: "adapter.node.rotated",
        slideId: this.currentSlideId,
        nodeId,
        rotation,
      });
    }

    this.syncRetainedSelection();
    this.scheduleSelectionRestore(nodeId);
    return true;
  }
  private handleTextChanged(target: FabricNodeObject | undefined): void {
    if (this.isSyncing || !target) {
      return;
    }

    /**
     * 画布内文本编辑采用“退出编辑后一次提交”策略。
     * 如果在输入过程中实时回写文档，会触发适配器重渲染并打断当前编辑态。
     */
    const editableTarget = target as EditableFabricTextObject;
    if (editableTarget.isEditing) {
      return;
    }
  }

  /** 双击文本对象后，直接进入 Fabric 自带的文本编辑态。 */
  private handleTextDoubleClick(
    target: FabricNodeObject | undefined,
    nativeEvent?: Event,
  ): void {
    if (
      this.isSyncing ||
      !this.canvas ||
      !this.controller ||
      !this.currentSlideId ||
      !target
    ) {
      return;
    }

    const meta = readNodeMeta(target);
    if (!meta || meta.nodeType !== "text") {
      return;
    }

    const editableTarget = target as EditableFabricTextObject;
    if (editableTarget.isEditing || typeof editableTarget.enterEditing !== "function") {
      return;
    }

    this.retainSelection(meta.nodeId);
    this.controller.handleAdapterEvent({
      type: "adapter.selection.changed",
      slideId: this.currentSlideId,
      nodeIds: [meta.nodeId],
    });

    this.isSyncing = true;
    try {
      this.canvas.setActiveObject(target);
      this.canvas.renderAll();
    } finally {
      this.isSyncing = false;
    }

    editableTarget.editable = true;
    queueMicrotask(() => {
      if (!this.canvas || this.currentSlideId !== meta.slideId || editableTarget.isEditing) {
        return;
      }

      editableTarget.enterEditing?.(nativeEvent);
      editableTarget.hiddenTextarea?.focus();
    });
  }

  /** 标记当前文本对象已经进入编辑态。 */
  private handleTextEditingEntered(target: FabricNodeObject | undefined): void {
    const editableTarget = target as EditableFabricTextObject | undefined;
    if (!editableTarget) {
      return;
    }

    editableTarget.editable = true;
  }

  /** 文本编辑完成后，统一回写最终内容并恢复到普通选中态。 */
  private handleTextEditingExited(target: FabricNodeObject | undefined): void {
    if (!target) {
      return;
    }

    const editableTarget = target as EditableFabricTextObject;
    editableTarget.editable = false;

    if (!this.controller) {
      return;
    }

    const meta = readNodeMeta(target);
    const slideId = meta?.slideId ?? this.currentSlideId;
    if (!slideId) {
      return;
    }

    /**
     * 文本编辑退出时，Fabric 可能会先抛出一次选中态变化，
     * 进而触发控制器把当前快照同步回画布。
     * 这里如果继续用 `isSyncing` 拦截，就会把真正的最终文本提交漏掉。
     */
    const textChange = resolveTextNodeChange(
      this.controller.getSnapshot(),
      slideId,
      target,
    );
    if (!textChange) {
      return;
    }

    this.retainSelection(textChange.nodeId);
    queueMicrotask(() => {
      if (!this.controller) {
        return;
      }

      this.controller.handleAdapterEvent({
        type: "adapter.text.changed",
        slideId,
        nodeId: textChange.nodeId,
        text: textChange.text,
      });
      this.scheduleSelectionRestore(textChange.nodeId);
    });
  }

  /** 统一处理右键菜单请求，并把命中目标同步回标准选中态。 */
  private handleContextMenu(
    target: FabricNodeObject | ActiveSelection | undefined,
    nativeEvent?: Event,
  ): void {
    const mouseEvent = nativeEvent instanceof MouseEvent ? nativeEvent : null;
    if (!mouseEvent) {
      return;
    }

    mouseEvent.preventDefault();

    const selectionNodeIds = this.resolveContextMenuSelectionNodeIds(target);
    const meta =
      target instanceof ActiveSelection
        ? null
        : target
          ? readNodeMeta(target)
          : null;
    this.syncContextMenuSelection(selectionNodeIds);

    this.onContextMenuRequest?.({
      clientX: mouseEvent.clientX,
      clientY: mouseEvent.clientY,
      slideId: this.currentSlideId,
      nodeId: meta?.nodeId ?? null,
      selectionNodeIds,
    });
  }

  /** 解析右键请求真正对应的菜单上下文选中态。 */
  private resolveContextMenuSelectionNodeIds(
    target: FabricNodeObject | ActiveSelection | undefined,
  ): string[] {
    if (!this.canvas) {
      return [];
    }

    const currentSelectionNodeIds = resolveCanvasSelectionNodeIds(this.canvas, null);
    if (target instanceof ActiveSelection) {
      return currentSelectionNodeIds;
    }

    const meta = target ? readNodeMeta(target) : null;
    if (!meta) {
      return [];
    }

    if (
      currentSelectionNodeIds.length > 1 &&
      currentSelectionNodeIds.includes(meta.nodeId)
    ) {
      return currentSelectionNodeIds;
    }

    return [meta.nodeId];
  }

  /** 把右键菜单对应的选中态同步回控制器，并维护单选保留窗口。 */
  private syncContextMenuSelection(selectionNodeIds: string[]): void {
    if (!this.controller || !this.currentSlideId) {
      return;
    }

    this.controller.handleAdapterEvent({
      type: "adapter.selection.changed",
      slideId: this.currentSlideId,
      nodeIds: selectionNodeIds,
    });

    if (selectionNodeIds.length === 1) {
      this.retainSelection(selectionNodeIds[0]);
      return;
    }

    this.clearRetainedSelection();
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

/** 判断多选整体变换是否属于不应回写平移结果的缩放/旋转类动作。 */
function isSelectionTransformAction(action: string): boolean {
  return (
    action.includes("scale") ||
    action.includes("resiz") ||
    action.includes("skew") ||
    action.includes("rotate")
  );
}

/** 缩放动作的命中标识并不稳定，这里统一收口判断逻辑。 */
function isResizeAction(action: string): boolean {
  return (
    action.includes("scale") ||
    action.includes("resiz") ||
    action.includes("skew") ||
    !action
  );
}
