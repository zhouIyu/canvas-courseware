import type { Slide } from "@canvas-courseware/core";
import { computed, type ComputedRef } from "vue";

/** 编辑器向应用壳层同步时间轴折叠态时的标准载荷。 */
export interface TimelineCollapsedStepIdsChangePayload {
  /** 当前被更新的 slide id。 */
  slideId: string;
  /** 该 slide 下最新的折叠步骤 id 列表。 */
  stepIds: string[];
}

/** 组合编辑器时间轴工作区状态所需的输入参数。 */
export interface UseCoursewareEditorTimelineWorkspaceStateOptions {
  /** 当前激活的 slide。 */
  activeSlide: ComputedRef<Slide | null | undefined>;
  /** 外部托管的时间轴折叠态映射。 */
  timelineCollapsedStepIdsBySlideId: ComputedRef<Record<string, string[]>>;
  /** 向应用壳层同步折叠态变更。 */
  emitTimelineCollapsedStepIdsChange: (
    payload: TimelineCollapsedStepIdsChangePayload,
  ) => void;
}

/** 把应用层托管的时间轴折叠态映射收口成当前激活页可直接双向绑定的模型。 */
export function useCoursewareEditorTimelineWorkspaceState(
  options: UseCoursewareEditorTimelineWorkspaceStateOptions,
) {
  /** 当前激活页可直接绑定给时间轴面板的折叠步骤 id 列表。 */
  const activeTimelineCollapsedStepIds = computed<string[]>({
    get() {
      const activeSlideId = options.activeSlide.value?.id;
      return activeSlideId
        ? options.timelineCollapsedStepIdsBySlideId.value[activeSlideId] ?? []
        : [];
    },
    set(stepIds) {
      const activeSlideId = options.activeSlide.value?.id;
      if (!activeSlideId) {
        return;
      }

      options.emitTimelineCollapsedStepIdsChange({
        slideId: activeSlideId,
        stepIds,
      });
    },
  });

  return {
    activeTimelineCollapsedStepIds,
  };
}
