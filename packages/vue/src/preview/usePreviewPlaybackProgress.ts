import type { CoursewareDocument, Slide, TimelineStep } from "@canvas-courseware/core";
import type { FabricPlayerAdapterState } from "@canvas-courseware/fabric";
import { computed, ref, watch, type ComputedRef, type ShallowRef } from "vue";
import {
  formatPlaybackStatus,
  formatPlaybackSummary,
  formatStepIndexLabel,
  formatTriggerLabel,
} from "../shared";
import {
  buildSlidePlaybackProgressMap,
  calculateProgressPercent,
  clampCompletedStepCount,
  countCompletedSlides,
  findSlideIndex,
  resolveCoursewareCompletionCopy,
  resolveLastCompletedStep,
  resolveNextSlidePlaybackHistory,
  resolvePlaybackStatusTagColor,
} from "./preview-playback-progress-shared";
import type {
  PreviewSlidePlaybackHistoryEntry,
  PreviewSlidePlaybackProgress,
} from "./preview-playback-progress-shared";

/** 预览播放进度组合能力的输入参数。 */
export interface UsePreviewPlaybackProgressOptions {
  /** 当前播放器正在消费的课件文档。 */
  document: ComputedRef<CoursewareDocument | null>;
  /** 当前正在预览的 slide。 */
  activeSlide: ComputedRef<Slide | undefined>;
  /** 当前播放器状态快照。 */
  state: Readonly<ShallowRef<FabricPlayerAdapterState>>;
  /** 当前激活页的总步骤数。 */
  stepCount: ComputedRef<number>;
}

/** 封装预览态的页面级 / 课件级播放进度与结束态文案。 */
export function usePreviewPlaybackProgress(
  options: UsePreviewPlaybackProgressOptions,
) {
  /** 记录每一页最近一次离开时的进度，用于多页课件的总体进度提示。 */
  const slidePlaybackHistory = ref<Record<string, PreviewSlidePlaybackHistoryEntry>>({});

  /** 随播放器状态变化同步本地进度历史，避免切页后丢失上一页进度。 */
  const syncSlidePlaybackHistory = () => {
    slidePlaybackHistory.value = resolveNextSlidePlaybackHistory(
      slidePlaybackHistory.value,
      options.document.value,
      options.state.value,
      options.stepCount.value,
    );
  };

  watch(
    [
      options.document,
      () => options.state.value.slideId,
      () => options.state.value.stepIndex,
      options.stepCount,
    ],
    syncSlidePlaybackHistory,
    {
      immediate: true,
    },
  );

  /** 播放摘要，供顶部标题区直接消费。 */
  const playbackSummary = computed(() =>
    formatPlaybackSummary(
      options.state.value.stepIndex,
      options.stepCount.value,
      options.state.value.status,
    ),
  );

  /** 当前状态的中文标签。 */
  const playbackStatusLabel = computed(() =>
    formatPlaybackStatus(options.state.value.status),
  );

  /** 播放状态对应的标签色值。 */
  const playbackStatusTagColor = computed(() =>
    resolvePlaybackStatusTagColor(options.state.value.status),
  );

  /** 下一步触发方式摘要。 */
  const nextTriggerLabel = computed(() =>
    formatTriggerLabel(options.state.value.nextTrigger),
  );

  /** 当前激活页在整份文档中的序号。 */
  const activeSlideIndex = computed(() =>
    findSlideIndex(options.document.value, options.state.value.slideId),
  );

  /** 当前预览文档中的总页数。 */
  const slideCount = computed(() => options.document.value?.slides.length ?? 0);

  /** 当前已经执行完成的步骤数量。 */
  const completedStepCount = computed(() =>
    clampCompletedStepCount(options.state.value.stepIndex, options.stepCount.value),
  );

  /** 当前是否存在可播放页面。 */
  const hasActiveSlide = computed(() => Boolean(options.activeSlide.value));

  /** 当前是否还能回退到上一步。 */
  const canStepBackward = computed(
    () => hasActiveSlide.value && options.state.value.stepIndex > 0,
  );

  /** 当前尚未执行的下一步。 */
  const nextStep = computed<TimelineStep | null>(() =>
    options.activeSlide.value?.timeline.steps[options.state.value.stepIndex] ?? null,
  );

  /** 最近一次已经完成的步骤，用于完成态补充说明。 */
  const lastCompletedStep = computed<TimelineStep | null>(() =>
    resolveLastCompletedStep(
      options.activeSlide.value,
      completedStepCount.value,
    ),
  );

  /** 当前页面的尺寸摘要。 */
  const stageSizeLabel = computed(() => {
    if (!options.activeSlide.value) {
      return "未加载页面";
    }

    return `${options.activeSlide.value.size.width} × ${options.activeSlide.value.size.height}`;
  });

  /** 当前页码在整份文档中的位置摘要。 */
  const slidePositionLabel = computed(() => {
    if (slideCount.value === 0 || activeSlideIndex.value < 0) {
      return "未选择页面";
    }

    return `第 ${activeSlideIndex.value + 1} / ${slideCount.value} 页`;
  });

  /** 当前步骤序号摘要。 */
  const stepPositionLabel = computed(() => {
    if (options.stepCount.value === 0) {
      return "当前页无步骤";
    }

    if (
      options.state.value.status === "completed" ||
      options.state.value.stepIndex >= options.stepCount.value
    ) {
      return `当前页已完成 ${options.stepCount.value} 步`;
    }

    const currentStep = Math.min(
      options.state.value.stepIndex + 1,
      options.stepCount.value,
    );
    return `当前焦点：第 ${currentStep} / ${options.stepCount.value} 步`;
  });

  /** 当前页步骤完成进度摘要。 */
  const stepProgressLabel = computed(() => {
    if (options.stepCount.value === 0) {
      return "当前页无步骤";
    }

    return `已完成 ${completedStepCount.value} / ${options.stepCount.value} 步`;
  });

  /** 当前页步骤完成进度百分比，供进度条直接消费。 */
  const stepProgressPercent = computed(() =>
    calculateProgressPercent(completedStepCount.value, options.stepCount.value),
  );

  /** 按页面维度聚合的播放进度，供左侧页面栏与整体进度提示复用。 */
  const slidePlaybackProgressMap = computed<Record<string, PreviewSlidePlaybackProgress>>(() =>
    buildSlidePlaybackProgressMap(
      options.document.value,
      options.state.value,
      slidePlaybackHistory.value,
    ),
  );

  /** 当前课件的总步骤数，供整体进度摘要展示。 */
  const totalStepCount = computed(() =>
    (options.document.value?.slides ?? []).reduce(
      (sum, slide) => sum + slide.timeline.steps.length,
      0,
    ),
  );

  /** 当前整份课件里已经播放完成的页面数量。 */
  const completedSlideCount = computed(() =>
    countCompletedSlides(
      options.document.value,
      slidePlaybackProgressMap.value,
    ),
  );

  /** 当前整份课件的页面级进度摘要。 */
  const coursewareProgressLabel = computed(() => {
    if (slideCount.value === 0) {
      return "暂无课件页面";
    }

    return `已完成 ${completedSlideCount.value} / ${slideCount.value} 页`;
  });

  /** 当前整份课件的页面级进度百分比。 */
  const coursewareProgressPercent = computed(() =>
    calculateProgressPercent(completedSlideCount.value, slideCount.value),
  );

  /** 当前整份课件是否已经完整播放完成。 */
  const isCoursewareCompleted = computed(
    () => slideCount.value > 0 && completedSlideCount.value === slideCount.value,
  );

  /** 当前课件进度卡片的补充说明。 */
  const coursewareProgressCopy = computed(() => {
    if (!options.activeSlide.value) {
      return "切换页面后，这里会同步展示整份课件的播放进度。";
    }

    const currentSlideProgress =
      slidePlaybackProgressMap.value[options.activeSlide.value.id];
    const currentSlideProgressLabel =
      currentSlideProgress?.progressLabel ?? "0/0 步";

    return `${slidePositionLabel.value} · ${options.activeSlide.value.name} · ${currentSlideProgressLabel}`;
  });

  /** 当前页的重点播放提示标题。 */
  const playbackHintTitle = computed(() => {
    if (!options.activeSlide.value) {
      return "未加载预览页面";
    }

    if (isCoursewareCompleted.value) {
      return "整份课件已播放完成";
    }

    if (options.stepCount.value === 0) {
      return "当前页没有播放步骤";
    }

    if (
      options.state.value.status === "completed" ||
      completedStepCount.value >= options.stepCount.value ||
      !nextStep.value
    ) {
      return "当前页已播放完成";
    }

    return `下一步：${formatStepIndexLabel(options.state.value.stepIndex)} · ${nextStep.value.name}`;
  });

  /** 当前页的重点播放提示补充说明。 */
  const playbackHintCopy = computed(() => {
    if (!options.activeSlide.value) {
      return "切换页面后，这里会自动同步同一份课件文档与预览状态。";
    }

    if (isCoursewareCompleted.value) {
      return resolveCoursewareCompletionCopy(
        options.activeSlide.value.name,
        totalStepCount.value,
        lastCompletedStep.value,
      );
    }

    if (options.stepCount.value === 0) {
      return "可以先回到编辑态补齐 timeline，再回来验证页面播放顺序。";
    }

    if (
      options.state.value.status === "completed" ||
      completedStepCount.value >= options.stepCount.value ||
      !nextStep.value
    ) {
      return lastCompletedStep.value
        ? `最后完成：${lastCompletedStep.value.name} · 共 ${options.stepCount.value} 步`
        : `当前页共 ${options.stepCount.value} 步，现已全部播放完成`;
    }

    return `${stepProgressLabel.value} · ${formatTriggerLabel(nextStep.value.trigger.type)}`;
  });

  /** 当前是否还能切到上一页。 */
  const canActivatePreviousSlide = computed(() => activeSlideIndex.value > 0);

  /** 当前是否还能切到下一页。 */
  const canActivateNextSlide = computed(
    () =>
      activeSlideIndex.value >= 0 &&
      activeSlideIndex.value < slideCount.value - 1,
  );

  /** 是否还能继续执行当前页的下一步。 */
  const canPlayNextStep = computed(() => Boolean(nextStep.value));

  /** 清空整个课件的页面级进度历史，供“重新开始课件”复用。 */
  const clearSlidePlaybackHistory = () => {
    slidePlaybackHistory.value = {};
  };

  return {
    activeSlideIndex,
    canActivateNextSlide,
    canActivatePreviousSlide,
    canPlayNextStep,
    canStepBackward,
    clearSlidePlaybackHistory,
    completedSlideCount,
    completedStepCount,
    coursewareProgressCopy,
    coursewareProgressLabel,
    coursewareProgressPercent,
    hasActiveSlide,
    isCoursewareCompleted,
    lastCompletedStep,
    nextStep,
    nextTriggerLabel,
    playbackHintCopy,
    playbackHintTitle,
    playbackStatusLabel,
    playbackStatusTagColor,
    playbackSummary,
    slideCount,
    slidePlaybackProgressMap,
    slidePositionLabel,
    stageSizeLabel,
    stepPositionLabel,
    stepProgressLabel,
    stepProgressPercent,
    totalStepCount,
  };
}
