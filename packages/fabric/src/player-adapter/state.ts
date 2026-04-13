import type { CoursewareDocument, Slide, TimelineStep } from "@canvas-courseware/core";
import type { FabricPlayerAdapterState } from "../player-adapter-types";
import type { FabricPlayerAdapterContext } from "./context";
import { syncTriggerAffordance } from "./rendering";

/** 从当前上下文解析正在预览的页面。 */
export function getCurrentPlayerSlide(
  context: FabricPlayerAdapterContext,
): Slide | undefined {
  if (!context.document) {
    return undefined;
  }

  const slideId = context.currentSlideId ?? context.document.slides[0]?.id;
  return slideId
    ? context.document.slides.find((slide) => slide.id === slideId)
    : undefined;
}

/** 读取当前还未执行的下一步。 */
export function getNextPlayerStep(
  context: FabricPlayerAdapterContext,
): TimelineStep | undefined {
  const slide = getCurrentPlayerSlide(context);
  return slide?.timeline.steps[context.state.stepIndex];
}

/** 解析文档切换后应该保留的页面 id。 */
export function resolveNextPlayerSlideId(
  document: CoursewareDocument,
  preferredSlideId: string | null,
): string | null {
  if (preferredSlideId && document.slides.some((slide) => slide.id === preferredSlideId)) {
    return preferredSlideId;
  }

  return document.slides[0]?.id ?? null;
}

/** 向外广播最新播放器状态。 */
export function setPlayerState(
  context: FabricPlayerAdapterContext,
  state: FabricPlayerAdapterState,
): void {
  context.state = state;

  for (const listener of context.listeners) {
    listener(context.state);
  }
}

/** 清理当前尚未执行的自动播放定时器。 */
export function clearPlayerAutoTimer(context: FabricPlayerAdapterContext): void {
  if (!context.autoTimer) {
    return;
  }

  clearTimeout(context.autoTimer);
  context.autoTimer = null;
}

/** 为自动触发步骤安排下一次播放。 */
export function schedulePlayerAutoStep(
  context: FabricPlayerAdapterContext,
  delayMs: number,
  version: number,
  onAutoStep: () => void,
): void {
  if (!context.enableAutoTrigger) {
    return;
  }

  clearPlayerAutoTimer(context);
  context.autoTimer = setTimeout(() => {
    if (version !== context.syncVersion) {
      return;
    }

    onAutoStep();
  }, delayMs);
}

/** 按下一步的 trigger 类型，把播放器切换到等待点击或自动播放状态。 */
export function updatePlayerWaitingState(
  context: FabricPlayerAdapterContext,
  version: number,
  onAutoStep: () => void,
): void {
  if (version !== context.syncVersion) {
    return;
  }

  const nextStep = getNextPlayerStep(context);
  if (!nextStep) {
    syncTriggerAffordance(context, null);
    setPlayerState(context, {
      ...context.state,
      status: "completed",
      nextTrigger: null,
    });
    return;
  }

  if (nextStep.trigger.type === "page-click" || nextStep.trigger.type === "node-click") {
    syncTriggerAffordance(context, nextStep);
    setPlayerState(context, {
      ...context.state,
      status: "paused",
      nextTrigger: nextStep.trigger.type,
    });
    return;
  }

  syncTriggerAffordance(context, null);
  setPlayerState(context, {
    ...context.state,
    status: "playing",
    nextTrigger: "auto",
  });
  schedulePlayerAutoStep(context, nextStep.trigger.delayMs, version, onAutoStep);
}
