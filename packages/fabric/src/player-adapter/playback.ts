import type { FabricObject } from "fabric";
import type { Slide, TimelineAction, TimelineStep } from "@canvas-courseware/core";
import { resetCanvasBackground } from "../background";
import type { FabricPlayerAdapterState } from "../player-adapter-types";
import type { FabricPlayerAdapterContext } from "./context";
import { applyPlayerNodeState, playPlayerAnimation } from "./animation";
import { renderPlayerSlide, resolveNodeIdForTarget, syncTriggerAffordance } from "./rendering";
import {
  clearPlayerAutoTimer,
  getCurrentPlayerSlide,
  getNextPlayerStep,
  setPlayerState,
  updatePlayerWaitingState,
} from "./state";

/** 把预览定位到指定步骤之前的状态。 */
export async function seekPlayerToStep(
  context: FabricPlayerAdapterContext,
  stepIndex: number,
  slideId?: string | null,
): Promise<FabricPlayerAdapterState> {
  if (slideId !== undefined) {
    context.currentSlideId = slideId;
  }

  await resetPlayerAdapter(context);
  clearPlayerAutoTimer(context);
  syncTriggerAffordance(context, null);

  const slide = getCurrentPlayerSlide(context);
  if (!slide) {
    return context.state;
  }

  const targetStepIndex = clampStepIndex(stepIndex, slide.timeline.steps.length);
  if (targetStepIndex === 0) {
    return context.state;
  }

  const version = context.syncVersion;

  for (let index = 0; index < targetStepIndex; index += 1) {
    const targetStep = slide.timeline.steps[index];
    if (!targetStep) {
      break;
    }

    await executePlayerStep(context, slide, targetStep, version, {
      instant: true,
    });

    if (version !== context.syncVersion) {
      return context.state;
    }
  }

  setPlayerState(context, {
    ...context.state,
    slideId: slide.id,
    stepIndex: targetStepIndex,
    status: "idle",
    nextTrigger: null,
  });

  updatePlayerWaitingState(context, version, () => {
    void playNextPlayerStep(context, true);
  });
  return context.state;
}

/** 重置当前预览页面到初始播放状态。 */
export async function resetPlayerAdapter(
  context: FabricPlayerAdapterContext,
): Promise<FabricPlayerAdapterState> {
  clearPlayerAutoTimer(context);

  const canvas = context.canvas;
  const slide = getCurrentPlayerSlide(context);
  const version = ++context.syncVersion;

  if (!canvas || !slide) {
    context.objectMap.clear();
    syncTriggerAffordance(context, null);
    setPlayerState(context, {
      document: context.document,
      slideId: context.currentSlideId,
      stepIndex: 0,
      status: slide ? "idle" : "completed",
      nextTrigger: null,
    });

    if (canvas) {
      canvas.clear();
      resetCanvasBackground(canvas);
      canvas.backgroundColor = "#FFFFFF";
      canvas.requestRenderAll();
    }

    return context.state;
  }

  await renderPlayerSlide(context, slide, version);
  if (version !== context.syncVersion) {
    return context.state;
  }

  setPlayerState(context, {
    document: context.document,
    slideId: slide.id,
    stepIndex: 0,
    status: "idle",
    nextTrigger: null,
  });

  updatePlayerWaitingState(context, version, () => {
    void playNextPlayerStep(context, true);
  });
  return context.state;
}

/** 处理预览画布上的点击事件。 */
export async function handlePlayerPointerDown(
  context: FabricPlayerAdapterContext,
  target: FabricObject | null,
): Promise<boolean> {
  const nextStep = getNextPlayerStep(context);
  if (!nextStep) {
    return false;
  }

  if (nextStep.trigger.type === "page-click") {
    return playNextPlayerStep(context, true);
  }

  if (nextStep.trigger.type === "node-click") {
    const targetNodeId = resolveNodeIdForTarget(context, target);
    if (!targetNodeId || targetNodeId !== nextStep.trigger.targetId) {
      return false;
    }

    return playNextPlayerStep(context, true);
  }

  return false;
}

/** 推进并执行当前等待中的下一步。 */
export async function playNextPlayerStep(
  context: FabricPlayerAdapterContext,
  force = false,
): Promise<boolean> {
  const slide = getCurrentPlayerSlide(context);
  const nextStep = getNextPlayerStep(context);
  const version = context.syncVersion;

  if (!slide || !nextStep) {
    syncTriggerAffordance(context, null);
    setPlayerState(context, {
      ...context.state,
      status: "completed",
      nextTrigger: null,
    });
    return false;
  }

  if (!force && nextStep.trigger.type === "auto") {
    return false;
  }

  clearPlayerAutoTimer(context);
  syncTriggerAffordance(context, null);
  setPlayerState(context, {
    ...context.state,
    status: "playing",
    nextTrigger: null,
  });

  await executePlayerStep(context, slide, nextStep, version);
  if (version !== context.syncVersion) {
    return false;
  }

  setPlayerState(context, {
    ...context.state,
    stepIndex: context.state.stepIndex + 1,
    status: "idle",
    nextTrigger: null,
  });

  updatePlayerWaitingState(context, version, () => {
    void playNextPlayerStep(context, true);
  });
  return true;
}

/** 顺序执行步骤中的全部动作。 */
async function executePlayerStep(
  context: FabricPlayerAdapterContext,
  slide: Slide,
  step: TimelineStep,
  version: number,
  options: {
    instant: boolean;
  } = {
    instant: false,
  },
): Promise<void> {
  for (const action of step.actions) {
    if (version !== context.syncVersion) {
      return;
    }

    await executePlayerAction(context, slide, action, version, options);
  }
}

/** 执行单个时间轴动作。 */
async function executePlayerAction(
  context: FabricPlayerAdapterContext,
  slide: Slide,
  action: TimelineAction,
  version: number,
  options: {
    instant: boolean;
  },
): Promise<void> {
  switch (action.type) {
    case "show-node": {
      const object = context.objectMap.get(action.targetId);
      const node = slide.nodes.find((item) => item.id === action.targetId);

      if (!object || !node) {
        return;
      }

      if (action.animationId) {
        await playPlayerAnimation(context, slide, action.animationId, {
          reveal: true,
          version,
          instant: options.instant,
        });
      } else {
        applyPlayerNodeState(object, node);
        object.visible = true;
        context.canvas?.requestRenderAll();
      }
      return;
    }

    case "hide-node": {
      const object = context.objectMap.get(action.targetId);
      if (!object) {
        return;
      }

      object.visible = false;
      context.canvas?.discardActiveObject();
      context.canvas?.requestRenderAll();
      return;
    }

    case "play-animation":
      await playPlayerAnimation(context, slide, action.animationId, {
        reveal: false,
        version,
        instant: options.instant,
      });
      return;

    default:
      return;
  }
}

/** 把任意输入的步骤索引夹在合法范围内。 */
function clampStepIndex(stepIndex: number, stepCount: number): number {
  return Math.min(Math.max(stepIndex, 0), stepCount);
}
