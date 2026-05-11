import type { CoursewareDocument, Slide, TimelineStep } from "@canvas-courseware/core";
import type { FabricPlayerAdapterState } from "@canvas-courseware/fabric";

/** 单页播放进度历史在预览层中的本地快照。 */
export interface PreviewSlidePlaybackHistoryEntry {
  /** 当前页面是否已经被用户实际浏览过。 */
  visited: boolean;
  /** 最近一次停留时，该页已经完成的步骤数。 */
  completedStepCount: number;
}

/** 预览左侧页面栏需要消费的单页进度结构。 */
export interface PreviewSlidePlaybackProgress {
  /** 当前页面对应的唯一 id。 */
  slideId: string;
  /** 当前页面总步骤数。 */
  stepCount: number;
  /** 当前页面已完成的步骤数。 */
  completedStepCount: number;
  /** 当前页面是否已被浏览过。 */
  isVisited: boolean;
  /** 当前页面是否就是预览焦点页。 */
  isCurrent: boolean;
  /** 当前页面是否已经播放完成。 */
  isCompleted: boolean;
  /** 页面卡片上展示的状态文案。 */
  statusLabel: string;
  /** 页面卡片上展示的进度文案。 */
  progressLabel: string;
}

/** 根据播放状态解析统一的标签色值。 */
export function resolvePlaybackStatusTagColor(
  status: FabricPlayerAdapterState["status"],
): string {
  switch (status) {
    case "playing":
      return "#165dff";
    case "paused":
      return "#ff7d00";
    case "completed":
      return "#00b42a";
    case "idle":
    default:
      return "#64748b";
  }
}

/** 读取当前激活页在文档中的稳定索引。 */
export function findSlideIndex(
  document: CoursewareDocument | null,
  slideId: string | null,
): number {
  if (!document || !slideId) {
    return -1;
  }

  return document.slides.findIndex((slide) => slide.id === slideId);
}

/** 把步骤完成数限制在合法范围内，避免异常状态污染 UI。 */
export function clampCompletedStepCount(stepIndex: number, stepCount: number): number {
  return Math.min(Math.max(stepIndex, 0), stepCount);
}

/** 读取当前页最近一次已经完成的步骤。 */
export function resolveLastCompletedStep(
  slide: Slide | undefined,
  completedStepCount: number,
): TimelineStep | null {
  if (!slide || completedStepCount === 0) {
    return null;
  }

  return slide.timeline.steps[completedStepCount - 1] ?? null;
}

/** 生成下一轮可复用的页面级播放历史，并顺手清理无效页面。 */
export function resolveNextSlidePlaybackHistory(
  history: Record<string, PreviewSlidePlaybackHistoryEntry>,
  document: CoursewareDocument | null,
  state: FabricPlayerAdapterState,
  activeStepCount: number,
): Record<string, PreviewSlidePlaybackHistoryEntry> {
  const sanitizedHistory = sanitizeSlidePlaybackHistory(history, document);
  if (!document || !state.slideId) {
    return sanitizedHistory;
  }

  return {
    ...sanitizedHistory,
    [state.slideId]: {
      visited: true,
      completedStepCount: clampCompletedStepCount(state.stepIndex, activeStepCount),
    },
  };
}

/** 移除历史里已经不存在的 slide 记录，避免导入 / 删页后状态脏读。 */
export function sanitizeSlidePlaybackHistory(
  history: Record<string, PreviewSlidePlaybackHistoryEntry>,
  document: CoursewareDocument | null,
): Record<string, PreviewSlidePlaybackHistoryEntry> {
  const validSlideIdSet = new Set((document?.slides ?? []).map((slide) => slide.id));

  return Object.fromEntries(
    Object.entries(history).filter(([slideId]) => validSlideIdSet.has(slideId)),
  );
}

/** 为整份课件生成页面维度的播放进度映射。 */
export function buildSlidePlaybackProgressMap(
  document: CoursewareDocument | null,
  state: FabricPlayerAdapterState,
  history: Record<string, PreviewSlidePlaybackHistoryEntry>,
): Record<string, PreviewSlidePlaybackProgress> {
  const slideProgressEntries = (document?.slides ?? []).map((slide) => {
    const progress = resolveSlidePlaybackProgress(slide, state.slideId, history);
    return [slide.id, progress] as const;
  });

  return Object.fromEntries(slideProgressEntries);
}

/** 解析单页在当前预览态下对应的播放进度。 */
export function resolveSlidePlaybackProgress(
  slide: Slide,
  activeSlideId: string | null,
  history: Record<string, PreviewSlidePlaybackHistoryEntry>,
): PreviewSlidePlaybackProgress {
  const historyEntry = history[slide.id];
  const stepCount = slide.timeline.steps.length;
  const isCurrent = slide.id === activeSlideId;
  const isVisited = historyEntry?.visited ?? false;
  const completedStepCount = clampCompletedStepCount(
    historyEntry?.completedStepCount ?? 0,
    stepCount,
  );
  const isCompleted =
    isVisited && (stepCount === 0 || completedStepCount >= stepCount);

  return {
    slideId: slide.id,
    stepCount,
    completedStepCount,
    isVisited,
    isCurrent,
    isCompleted,
    statusLabel: resolveSlidePlaybackStatusLabel(
      stepCount,
      completedStepCount,
      isVisited,
      isCurrent,
      isCompleted,
    ),
    progressLabel: resolveSlidePlaybackProgressLabel(stepCount, completedStepCount, isVisited),
  };
}

/** 把单页播放状态映射成更轻量的卡片文案。 */
export function resolveSlidePlaybackStatusLabel(
  stepCount: number,
  completedStepCount: number,
  isVisited: boolean,
  isCurrent: boolean,
  isCompleted: boolean,
): string {
  if (!isVisited) {
    return "未播放";
  }

  if (stepCount === 0) {
    return isCurrent ? "当前页" : "已查看";
  }

  if (isCompleted) {
    return "已完成";
  }

  if (isCurrent) {
    return completedStepCount > 0 ? "进行中" : "当前页";
  }

  return "待继续";
}

/** 把单页步骤完成情况转成更适合页面卡片的简要摘要。 */
export function resolveSlidePlaybackProgressLabel(
  stepCount: number,
  completedStepCount: number,
  isVisited: boolean,
): string {
  if (stepCount === 0) {
    return isVisited ? "无步骤" : "待查看";
  }

  return `${completedStepCount}/${stepCount} 步`;
}

/** 统计整份课件里已经完成的页面数量。 */
export function countCompletedSlides(
  document: CoursewareDocument | null,
  slidePlaybackProgressMap: Record<string, PreviewSlidePlaybackProgress>,
): number {
  return (document?.slides ?? []).reduce((sum, slide) => {
    return sum + (slidePlaybackProgressMap[slide.id]?.isCompleted ? 1 : 0);
  }, 0);
}

/** 统一把分子 / 分母转换成百分比，供所有进度条直接复用。 */
export function calculateProgressPercent(
  completedCount: number,
  totalCount: number,
): number {
  if (totalCount <= 0) {
    return 0;
  }

  return Math.round((completedCount / totalCount) * 100);
}

/** 生成整份课件播放完成后的补充说明。 */
export function resolveCoursewareCompletionCopy(
  activeSlideName: string,
  totalStepCount: number,
  lastCompletedStep: TimelineStep | null,
): string {
  if (lastCompletedStep) {
    return `最后停留在“${activeSlideName}”的 ${lastCompletedStep.name}，整份课件共 ${totalStepCount} 步；可点击“重新开始课件”再次从第一页演示。`;
  }

  return "当前课件已全部浏览完成；可点击“重新开始课件”再次从第一页演示。";
}
