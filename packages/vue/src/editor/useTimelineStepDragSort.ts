import { ref, type ComputedRef } from "vue";
import type { TimelineStep } from "@canvas-courseware/core";

/** 时间轴步骤排序载荷。 */
export interface TimelineStepReorderPayload {
  /** 需要移动的步骤 id。 */
  stepId: string;
  /** 调整后的目标索引。 */
  index: number;
}

/** 拖拽命中的目标位置。 */
type TimelineStepDropPlacement = "before" | "after";

/** 当前拖放高亮状态。 */
interface TimelineStepDropState {
  /** 当前命中的目标步骤 id。 */
  stepId: string;
  /** 当前命中的前插 / 后插位置。 */
  placement: TimelineStepDropPlacement;
}

/** 时间轴步骤拖拽排序组合式函数的输入参数。 */
export interface UseTimelineStepDragSortOptions {
  /** 当前页面步骤列表。 */
  steps: ComputedRef<TimelineStep[]>;
  /** 当排序成功时向外层派发标准化重排请求。 */
  onReorderStep: (payload: TimelineStepReorderPayload) => void;
}

/** 收敛时间轴步骤拖拽排序所需的本地交互状态。 */
export function useTimelineStepDragSort(
  options: UseTimelineStepDragSortOptions,
) {
  /** 当前被拖拽的步骤 id。 */
  const draggedStepId = ref<string | null>(null);

  /** 当前拖放命中的目标状态。 */
  const dropState = ref<TimelineStepDropState | null>(null);

  /** 开始拖拽某个步骤。 */
  const handleDragStart = (stepId: string, event: DragEvent) => {
    draggedStepId.value = stepId;
    dropState.value = null;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", stepId);
    }
  };

  /** 在拖拽经过某个步骤时，计算当前是前插还是后插。 */
  const handleDragOver = (stepId: string, event: DragEvent) => {
    if (!draggedStepId.value) {
      return;
    }

    event.preventDefault();

    if (draggedStepId.value === stepId) {
      dropState.value = null;
      return;
    }

    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) {
      return;
    }

    const bounds = currentTarget.getBoundingClientRect();
    const placement: TimelineStepDropPlacement =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";

    dropState.value = {
      stepId,
      placement,
    };

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  };

  /** 拖拽结束后清理高亮状态。 */
  const resetDragState = () => {
    draggedStepId.value = null;
    dropState.value = null;
  };

  /** 计算拖拽放下后对应的最终索引。 */
  const resolveDropIndex = (
    draggedId: string,
    targetId: string,
    placement: TimelineStepDropPlacement,
  ): number | null => {
    const sourceIndex = options.steps.value.findIndex(
      (step) => step.id === draggedId,
    );
    const targetIndex = options.steps.value.findIndex(
      (step) => step.id === targetId,
    );

    if (sourceIndex === -1 || targetIndex === -1) {
      return null;
    }

    const rawIndex = placement === "before" ? targetIndex : targetIndex + 1;
    const nextIndex = sourceIndex < rawIndex ? rawIndex - 1 : rawIndex;

    return nextIndex === sourceIndex ? null : nextIndex;
  };

  /** 在步骤卡片上完成拖放并派发新的排序索引。 */
  const handleDrop = (stepId: string, event: DragEvent) => {
    event.preventDefault();

    if (!draggedStepId.value || !dropState.value || draggedStepId.value === stepId) {
      resetDragState();
      return;
    }

    const nextIndex = resolveDropIndex(
      draggedStepId.value,
      stepId,
      dropState.value.placement,
    );

    if (nextIndex !== null) {
      options.onReorderStep({
        stepId: draggedStepId.value,
        index: nextIndex,
      });
    }

    resetDragState();
  };

  return {
    draggedStepId,
    dropState,
    handleDragOver,
    handleDragStart,
    handleDrop,
    resetDragState,
  };
}
