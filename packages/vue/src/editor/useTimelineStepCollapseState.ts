import { computed, watch, type Ref } from "vue";

/** 时间轴折叠态组合式函数的输入参数。 */
export interface UseTimelineStepCollapseStateOptions {
  /** 当前页面全部步骤 id。 */
  stepIdList: Ref<string[]>;
  /** 当前页面外部托管的折叠步骤 id 列表。 */
  collapsedStepIds: Ref<string[]>;
}

/** 收敛时间轴步骤折叠、全收起与失效状态清理逻辑。 */
export function useTimelineStepCollapseState(
  options: UseTimelineStepCollapseStateOptions,
) {
  /** 当前页面步骤数量，供头部批量操作显示使用。 */
  const stepCount = computed(() => options.stepIdList.value.length);

  /** 是否需要展示“全部收起 / 展开”入口。 */
  const showCollapseAllAction = computed(() => stepCount.value > 1);

  /** 当前页面是否已经全部折叠。 */
  const isEveryStepCollapsed = computed(
    () =>
      options.stepIdList.value.length > 0 &&
      options.stepIdList.value.every((stepId) =>
        options.collapsedStepIds.value.includes(stepId),
      ),
  );

  /** 判断某个步骤当前是否处于折叠态。 */
  const isStepCollapsed = (stepId: string): boolean =>
    options.collapsedStepIds.value.includes(stepId);

  /** 切换单个步骤的折叠 / 展开状态。 */
  const handleToggleStepCollapsed = (stepId: string) => {
    if (isStepCollapsed(stepId)) {
      options.collapsedStepIds.value = options.collapsedStepIds.value.filter(
        (currentStepId) => currentStepId !== stepId,
      );
      return;
    }

    options.collapsedStepIds.value = [
      ...options.collapsedStepIds.value,
      stepId,
    ];
  };

  /** 在头部统一切换全部步骤的折叠状态。 */
  const handleToggleAllStepsCollapsed = () => {
    options.collapsedStepIds.value = isEveryStepCollapsed.value
      ? []
      : [...options.stepIdList.value];
  };

  /** 步骤列表变化时清理已失效的折叠记录，保持状态集合只引用当前页面。 */
  watch(options.stepIdList, (nextStepIds) => {
    const validStepIdSet = new Set(nextStepIds);
    const nextCollapsedStepIds = options.collapsedStepIds.value.filter(
      (stepId) => validStepIdSet.has(stepId),
    );

    if (
      nextCollapsedStepIds.length === options.collapsedStepIds.value.length &&
      nextCollapsedStepIds.every(
        (stepId, stepIndex) =>
          stepId === options.collapsedStepIds.value[stepIndex],
      )
    ) {
      return;
    }

    options.collapsedStepIds.value = nextCollapsedStepIds;
  });

  return {
    handleToggleAllStepsCollapsed,
    handleToggleStepCollapsed,
    isEveryStepCollapsed,
    isStepCollapsed,
    showCollapseAllAction,
    stepCount,
  };
}
