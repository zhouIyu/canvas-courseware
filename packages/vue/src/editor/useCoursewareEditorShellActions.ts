import type {
  EditorSnapshot,
  NodeAnimation,
  NodePatch,
  ReorderPosition,
  Slide,
  TimelineStep,
} from "@canvas-courseware/core";
import { cloneTimelineStep } from "@canvas-courseware/core";
import { computed, type ComputedRef, type ShallowRef } from "vue";
import type {
  LayerAlignMode,
  LayerDistributeMode,
} from "./useEditorBatchLayout";

/** 页面栏重命名事件的载荷。 */
interface SlideRailRenamePayload {
  /** 被重命名的 slide id。 */
  slideId: string;
  /** 更新后的页面名称。 */
  name: string;
}

/** 页面栏拖拽排序事件的载荷。 */
interface SlideRailReorderPayload {
  /** 被拖拽的 slide id。 */
  slideId: string;
  /** 放下后的最终索引。 */
  index: number;
}

/** 时间轴步骤排序事件的载荷。 */
interface TimelineStepReorderPayload {
  /** 需要移动的步骤 id。 */
  stepId: string;
  /** 排序后的目标索引。 */
  index: number;
}

/** 时间轴步骤复制事件的载荷。 */
interface TimelineStepDuplicatePayload {
  /** 需要复制的源步骤。 */
  step: TimelineStep;
  /** 源步骤当前所处的索引。 */
  index: number;
}

/** 浮层图层拖拽排序事件的载荷。 */
interface LayerReorderToIndexPayload {
  /** 被拖拽的节点 id。 */
  nodeId: string;
  /** 放下后的目标索引。 */
  index: number;
}

/** 对外暴露的 slide 缩略图截图结果。 */
interface SlideThumbnailCapturedPayload {
  /** 已完成截图的 slide id。 */
  slideId: string;
  /** 当前 slide 对应的缩略图 data URL。 */
  thumbnail: string;
}

/** 编辑器壳层动作 helper 的输入参数。 */
export interface UseCoursewareEditorShellActionsOptions {
  /** 当前激活的 slide。 */
  activeSlide: ComputedRef<Slide | undefined>;
  /** 当前标准快照。 */
  snapshot: ShallowRef<EditorSnapshot>;
  /** 导出当前激活页缩略图的底层实现。 */
  captureActiveSlideThumbnailDataUrl: () => Promise<string | null>;
  /** 向外抛出页面缩略图更新。 */
  emitSlideThumbnailCaptured: (payload: SlideThumbnailCapturedPayload) => void;
  /** 向外抛出时间轴预览请求。 */
  emitTimelinePreviewRequest: (payload: { slideId: string; stepIndex: number }) => void;
  /** 更新 slide。 */
  updateSlide: (
    slideId: string,
    patch: Partial<Pick<Slide, "name" | "size" | "background">>,
  ) => void;
  /** 激活某一页。 */
  activateSlide: (slideId: string) => void;
  /** 在末尾新增页面。 */
  addSlide: () => void;
  /** 在指定页面后新增页面。 */
  addSlideAfter: (slideId: string) => void;
  /** 复制指定页面。 */
  duplicateSlideById: (slideId: string) => void;
  /** 删除指定页面。 */
  removeSlide: (slideId: string) => void;
  /** 重排页面顺序。 */
  reorderSlide: (slideId: string, index: number) => void;
  /** 更新节点。 */
  updateNode: (slideId: string, nodeId: string, patch: NodePatch) => void;
  /** 设置选中节点。 */
  selectNodes: (slideId: string, nodeIds: string[]) => void;
  /** 调整节点层级。 */
  reorderNode: (
    slideId: string,
    nodeId: string,
    position: ReorderPosition,
    index?: number,
    targetNodeId?: string,
  ) => void;
  /** 执行批量对齐。 */
  alignSelectedNodes: (mode: LayerAlignMode) => void;
  /** 执行批量分布。 */
  distributeSelectedNodes: (mode: LayerDistributeMode) => void;
  /** 新增或更新时间轴步骤。 */
  upsertTimelineStep: (slideId: string, step: TimelineStep, index?: number) => void;
  /** 删除时间轴步骤。 */
  removeTimelineStep: (slideId: string, stepId: string) => void;
  /** 调整时间轴步骤顺序。 */
  reorderTimelineStep: (slideId: string, stepId: string, index: number) => void;
  /** 新增或更新时间轴动画。 */
  upsertTimelineAnimation: (slideId: string, animation: NodeAnimation) => void;
  /** 删除时间轴动画。 */
  removeTimelineAnimation: (slideId: string, animationId: string) => void;
}

/** 收敛编辑器父壳层里的页面、图层和时间轴动作派发。 */
export function useCoursewareEditorShellActions(
  options: UseCoursewareEditorShellActionsOptions,
) {
  /** 当前激活页在文档中的 1-based 页序。 */
  const activeSlideIndex = computed(() => {
    if (!options.activeSlide.value) {
      return null;
    }

    const slideIndex = options.snapshot.value.document.slides.findIndex(
      (slide) => slide.id === options.activeSlide.value?.id,
    );
    return slideIndex >= 0 ? slideIndex + 1 : null;
  });

  /** 当前文档的页面总数，供页面设置摘要直接消费。 */
  const slideCount = computed(() => options.snapshot.value.document.slides.length);

  /** 导出当前激活页缩略图，并在成功后同步抛给应用层。 */
  const captureAndEmitActiveSlideThumbnail = async (): Promise<SlideThumbnailCapturedPayload | null> => {
    if (!options.activeSlide.value) {
      return null;
    }

    const thumbnail = await options.captureActiveSlideThumbnailDataUrl();
    if (!thumbnail) {
      return null;
    }

    const payload = {
      slideId: options.activeSlide.value.id,
      thumbnail,
    };
    options.emitSlideThumbnailCaptured(payload);
    return payload;
  };

  /** 对外暴露当前激活页的截图接口，供工作台在保存前主动同步缩略图。 */
  const captureActiveSlideThumbnail = async (): Promise<SlideThumbnailCapturedPayload | null> => {
    if (!options.activeSlide.value) {
      return null;
    }

    const thumbnail = await options.captureActiveSlideThumbnailDataUrl();
    if (!thumbnail) {
      return null;
    }

    return {
      slideId: options.activeSlide.value.id,
      thumbnail,
    };
  };

  /** 当前 slide 的更新入口。 */
  const handleSlideUpdate = (patch: Partial<Pick<Slide, "name" | "size" | "background">>) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.updateSlide(options.activeSlide.value.id, patch);
  };

  /** 页面栏内快速重命名 slide。 */
  const handleSlideRename = (payload: SlideRailRenamePayload) => {
    options.updateSlide(payload.slideId, {
      name: payload.name,
    });
  };

  /** 切页前先截取当前页封面，再切到目标页面。 */
  const handleSlideActivate = async (slideId: string) => {
    if (slideId === options.activeSlide.value?.id) {
      return;
    }

    await captureAndEmitActiveSlideThumbnail();
    options.activateSlide(slideId);
  };

  /** 从左侧页面栏新增一页前，先同步当前页面封面。 */
  const handleSlideCreate = async () => {
    await captureAndEmitActiveSlideThumbnail();
    options.addSlide();
  };

  /** 从指定页面后快速新增下一页。 */
  const handleSlideCreateAfter = async (slideId: string) => {
    await captureAndEmitActiveSlideThumbnail();
    options.addSlideAfter(slideId);
  };

  /** 复制指定页面。 */
  const handleSlideDuplicate = async (slideId: string) => {
    await captureAndEmitActiveSlideThumbnail();
    options.duplicateSlideById(slideId);
  };

  /** 删除指定页面。 */
  const handleSlideRemove = (slideId: string) => {
    options.removeSlide(slideId);
  };

  /** 更新页面列表中的拖拽排序结果。 */
  const handleSlideReorder = (payload: SlideRailReorderPayload) => {
    options.reorderSlide(payload.slideId, payload.index);
  };

  /** 当前单选节点的更新入口。 */
  const handleNodeUpdate = (nodeId: string, patch: NodePatch) => {
    const slideId = options.snapshot.value.selection.slideId ?? options.activeSlide.value?.id;
    if (!slideId) {
      return;
    }

    options.updateNode(slideId, nodeId, patch);
  };

  /** 图层面板选中节点时，把选择同步回标准 snapshot。 */
  const handleLayerSelect = (nodeId: string) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.selectNodes(options.activeSlide.value.id, [nodeId]);
  };

  /** 图层面板层级按钮的派发入口。 */
  const handleLayerReorder = (nodeId: string, position: ReorderPosition) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.reorderNode(options.activeSlide.value.id, nodeId, position);
  };

  /** 独立浮层拖拽排序后的统一写回入口。 */
  const handleLayerReorderToIndex = (payload: LayerReorderToIndexPayload) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.reorderNode(options.activeSlide.value.id, payload.nodeId, "index", payload.index);
  };

  /** 图层面板批量对齐按钮的派发入口。 */
  const handleLayerAlign = (mode: LayerAlignMode) => {
    options.alignSelectedNodes(mode);
  };

  /** 图层面板批量分布按钮的派发入口。 */
  const handleLayerDistribute = (mode: LayerDistributeMode) => {
    options.distributeSelectedNodes(mode);
  };

  /** 时间轴步骤的新增与更新统一从这里进入标准命令层。 */
  const handleTimelineStepUpsert = (step: TimelineStep) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.upsertTimelineStep(options.activeSlide.value.id, step);
  };

  /** 删除当前页面中的某个时间轴步骤。 */
  const handleTimelineStepRemove = (stepId: string) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.removeTimelineStep(options.activeSlide.value.id, stepId);
  };

  /** 调整当前页面中某个时间轴步骤的顺序。 */
  const handleTimelineStepReorder = (payload: TimelineStepReorderPayload) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.reorderTimelineStep(options.activeSlide.value.id, payload.stepId, payload.index);
  };

  /** 复制一个时间轴步骤，并把副本插入到原步骤后面。 */
  const handleTimelineStepDuplicate = (payload: TimelineStepDuplicatePayload) => {
    if (!options.activeSlide.value) {
      return;
    }

    const duplicatedStep = cloneTimelineStep(payload.step);
    options.upsertTimelineStep(options.activeSlide.value.id, duplicatedStep, payload.index + 1);
  };

  /** 请求外层切换到预览模式，并从当前步骤开始播放。 */
  const handleTimelinePreviewRequest = (stepIndex: number) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.emitTimelinePreviewRequest({
      slideId: options.activeSlide.value.id,
      stepIndex,
    });
  };

  /** 时间轴动画资源的新增与更新统一从这里进入标准命令层。 */
  const handleTimelineAnimationUpsert = (animation: NodeAnimation) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.upsertTimelineAnimation(options.activeSlide.value.id, animation);
  };

  /** 删除当前页面中的某个动画资源。 */
  const handleTimelineAnimationRemove = (animationId: string) => {
    if (!options.activeSlide.value) {
      return;
    }

    options.removeTimelineAnimation(options.activeSlide.value.id, animationId);
  };

  return {
    activeSlideIndex,
    captureActiveSlideThumbnail,
    handleLayerAlign,
    handleLayerDistribute,
    handleLayerReorder,
    handleLayerReorderToIndex,
    handleLayerSelect,
    handleNodeUpdate,
    handleSlideActivate,
    handleSlideCreate,
    handleSlideCreateAfter,
    handleSlideDuplicate,
    handleSlideRemove,
    handleSlideRename,
    handleSlideReorder,
    handleSlideUpdate,
    handleTimelineAnimationRemove,
    handleTimelineAnimationUpsert,
    handleTimelinePreviewRequest,
    handleTimelineStepDuplicate,
    handleTimelineStepRemove,
    handleTimelineStepReorder,
    handleTimelineStepUpsert,
    slideCount,
  };
}
