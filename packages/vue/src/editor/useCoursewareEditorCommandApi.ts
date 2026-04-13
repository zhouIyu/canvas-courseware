import {
  COMMAND_TYPES,
  createRectNode,
  createTextNode,
  type CoursewareDocument,
  type EditorSnapshot,
  type NodeAnimation,
  type NodePatch,
  type ReorderPosition,
  type Slide,
  type TimelineStep,
  EditorController,
} from "@canvas-courseware/core";
import type { ComputedRef, ShallowRef } from "vue";

/**
 * 编辑器命令 API 的输入参数。
 * 这一层只负责把 UI 意图转换成标准命令，不直接持有适配器细节。
 */
export interface UseCoursewareEditorCommandApiOptions {
  /** 编辑器控制器，统一收口标准命令。 */
  controller: EditorController;
  /** 当前最新的标准快照。 */
  snapshot: ShallowRef<EditorSnapshot>;
  /** 当前激活的 slide。 */
  activeSlide: ComputedRef<Slide | undefined>;
  /** 标记当前是否正在应用外部文档，避免形成循环。 */
  applyingExternalDocument: ShallowRef<boolean>;
}

/** 组合编辑器壳层会频繁复用的标准命令派发入口。 */
export function useCoursewareEditorCommandApi(
  options: UseCoursewareEditorCommandApiOptions,
) {
  /** 在当前 slide 中新增文本节点。 */
  const addText = () => {
    const slideId = options.snapshot.value.activeSlideId;
    if (!slideId) {
      return;
    }

    const node = createTextNode({
      x: 110,
      y: 110,
      width: 420,
      text: "新建文本",
    });

    options.controller.execute({
      type: COMMAND_TYPES.NODE_CREATE,
      slideId,
      node,
      index: options.activeSlide.value?.nodes.length,
    });
    options.controller.execute({
      type: COMMAND_TYPES.SELECTION_SET,
      slideId,
      nodeIds: [node.id],
    });
  };

  /** 在当前 slide 中新增矩形节点。 */
  const addRect = () => {
    const slideId = options.snapshot.value.activeSlideId;
    if (!slideId) {
      return;
    }

    const node = createRectNode({
      x: 160,
      y: 180,
      width: 280,
      height: 180,
      fill: "#99F6E4",
    });

    options.controller.execute({
      type: COMMAND_TYPES.NODE_CREATE,
      slideId,
      node,
      index: options.activeSlide.value?.nodes.length,
    });
    options.controller.execute({
      type: COMMAND_TYPES.SELECTION_SET,
      slideId,
      nodeIds: [node.id],
    });
  };

  /** 删除当前选中的所有节点。 */
  const removeSelected = () => {
    const slideId = options.snapshot.value.selection.slideId ?? options.snapshot.value.activeSlideId;
    if (!slideId || options.snapshot.value.selection.nodeIds.length === 0) {
      return;
    }

    options.controller.execute({
      type: COMMAND_TYPES.NODE_BATCH_DELETE,
      slideId,
      nodeIds: options.snapshot.value.selection.nodeIds,
    });
  };

  /** 切换当前激活的 slide。 */
  const activateSlide = (slideId: string) => {
    options.controller.execute({
      type: COMMAND_TYPES.SLIDE_ACTIVATE,
      slideId,
    });
  };

  /** 通过标准命令显式设置当前选中节点。 */
  const selectNodes = (slideId: string, nodeIds: string[]) => {
    options.controller.execute({
      type: COMMAND_TYPES.SELECTION_SET,
      slideId,
      nodeIds,
    });
  };

  /** 清空当前页面的选中状态。 */
  const clearSelection = () => {
    options.controller.execute({
      type: COMMAND_TYPES.SELECTION_CLEAR,
      slideId: options.snapshot.value.activeSlideId ?? undefined,
    });
  };

  /** 执行一次撤销。 */
  const undo = () => {
    options.controller.undo();
  };

  /** 执行一次重做。 */
  const redo = () => {
    options.controller.redo();
  };

  /** 更新当前页面元信息，例如名称、尺寸和完整背景配置。 */
  const updateSlide = (
    slideId: string,
    patch: Partial<Pick<Slide, "name" | "size" | "background">>,
  ) => {
    options.controller.execute({
      type: COMMAND_TYPES.SLIDE_UPDATE,
      slideId,
      patch,
    });
  };

  /** 更新某个节点的标准属性。 */
  const updateNode = (slideId: string, nodeId: string, patch: NodePatch) => {
    options.controller.execute({
      type: COMMAND_TYPES.NODE_UPDATE,
      slideId,
      nodeId,
      patch,
    });
  };

  /** 调整节点层级顺序，图层面板只需要传入位置语义。 */
  const reorderNode = (
    slideId: string,
    nodeId: string,
    position: ReorderPosition,
    index?: number,
    targetNodeId?: string,
  ) => {
    options.controller.execute({
      type: COMMAND_TYPES.NODE_REORDER,
      slideId,
      nodeId,
      position,
      index,
      targetNodeId,
    });
  };

  /** 新增或更新某个时间轴步骤。 */
  const upsertTimelineStep = (slideId: string, step: TimelineStep, index?: number) => {
    options.controller.execute({
      type: COMMAND_TYPES.TIMELINE_STEP_UPSERT,
      slideId,
      step,
      index,
    });
  };

  /** 删除某个时间轴步骤。 */
  const removeTimelineStep = (slideId: string, stepId: string) => {
    options.controller.execute({
      type: COMMAND_TYPES.TIMELINE_STEP_REMOVE,
      slideId,
      stepId,
    });
  };

  /** 调整某个时间轴步骤在当前页面中的顺序。 */
  const reorderTimelineStep = (slideId: string, stepId: string, index: number) => {
    options.controller.execute({
      type: COMMAND_TYPES.TIMELINE_STEP_REORDER,
      slideId,
      stepId,
      index,
    });
  };

  /** 新增或更新某个动画资源。 */
  const upsertTimelineAnimation = (slideId: string, animation: NodeAnimation) => {
    options.controller.execute({
      type: COMMAND_TYPES.TIMELINE_ANIMATION_UPSERT,
      slideId,
      animation,
    });
  };

  /** 删除某个动画资源。 */
  const removeTimelineAnimation = (slideId: string, animationId: string) => {
    options.controller.execute({
      type: COMMAND_TYPES.TIMELINE_ANIMATION_REMOVE,
      slideId,
      animationId,
    });
  };

  /**
   * 用一份新的文档替换当前编辑状态。
   * 这个方法主要给外层 `v-model` 或导入流程使用。
   */
  const replaceDocument = (document: CoursewareDocument) => {
    options.applyingExternalDocument.value = true;
    options.controller.replaceDocument(document);
    queueMicrotask(() => {
      options.applyingExternalDocument.value = false;
    });
  };

  return {
    activateSlide,
    addRect,
    addText,
    clearSelection,
    redo,
    removeSelected,
    removeTimelineAnimation,
    removeTimelineStep,
    reorderNode,
    reorderTimelineStep,
    replaceDocument,
    selectNodes,
    undo,
    updateNode,
    updateSlide,
    upsertTimelineAnimation,
    upsertTimelineStep,
  };
}
