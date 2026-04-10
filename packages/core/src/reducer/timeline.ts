import type { NodeAnimation, TimelineStep } from "../schema";
import { clamp, insertAt, updateDocumentSlide, upsertById } from "./shared";

/** 新增或更新某个 timeline 步骤。 */
export function upsertTimelineStep(
  snapshot: import("../schema").EditorSnapshot,
  slideId: string,
  step: TimelineStep,
  index?: number,
): import("../schema").EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => {
    const stepExists = slide.timeline.steps.some((item) => item.id === step.id);
    return {
      ...slide,
      timeline: {
        ...slide.timeline,
        steps: stepExists
          ? upsertById(slide.timeline.steps, step)
          : insertAt(slide.timeline.steps, step, index),
      },
    };
  });
}

/** 删除指定的 timeline 步骤。 */
export function removeTimelineStep(
  snapshot: import("../schema").EditorSnapshot,
  slideId: string,
  stepId: string,
): import("../schema").EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => {
    const nextSteps = slide.timeline.steps.filter((step) => step.id !== stepId);
    if (nextSteps.length === slide.timeline.steps.length) {
      return slide;
    }

    return {
      ...slide,
      timeline: {
        ...slide.timeline,
        steps: nextSteps,
      },
    };
  });
}

/** 调整指定 timeline 步骤在当前 slide 中的位置。 */
export function reorderTimelineStep(
  snapshot: import("../schema").EditorSnapshot,
  slideId: string,
  stepId: string,
  index: number,
): import("../schema").EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => {
    const currentIndex = slide.timeline.steps.findIndex((step) => step.id === stepId);
    if (currentIndex === -1) {
      return slide;
    }

    const nextSteps = [...slide.timeline.steps];
    const [targetStep] = nextSteps.splice(currentIndex, 1);
    const nextIndex = clamp(index, 0, nextSteps.length);
    nextSteps.splice(nextIndex, 0, targetStep);

    if (nextSteps.every((step, stepIndex) => step.id === slide.timeline.steps[stepIndex]?.id)) {
      return slide;
    }

    return {
      ...slide,
      timeline: {
        ...slide.timeline,
        steps: nextSteps,
      },
    };
  });
}

/** 新增或更新某个节点动画资源。 */
export function upsertAnimation(
  snapshot: import("../schema").EditorSnapshot,
  slideId: string,
  animation: NodeAnimation,
): import("../schema").EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => ({
    ...slide,
    timeline: {
      ...slide.timeline,
      animations: upsertById(slide.timeline.animations, animation),
    },
  }));
}

/** 删除指定的节点动画资源。 */
export function removeAnimation(
  snapshot: import("../schema").EditorSnapshot,
  slideId: string,
  animationId: string,
): import("../schema").EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => {
    const nextAnimations = slide.timeline.animations.filter(
      (animation) => animation.id !== animationId,
    );

    if (nextAnimations.length === slide.timeline.animations.length) {
      return slide;
    }

    return {
      ...slide,
      timeline: {
        ...slide.timeline,
        animations: nextAnimations,
      },
    };
  });
}
