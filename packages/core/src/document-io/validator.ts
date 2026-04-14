import type { CoursewareDocument, Slide, TimelineStep } from "../schema";

/**
 * 对解析完成的课件文档执行运行时闭环校验。
 * 目前重点覆盖节点、步骤、动画和触发对象之间的引用关系。
 */
export function validateCoursewareDocument(document: CoursewareDocument): CoursewareDocument {
  document.slides.forEach((slide, index) => {
    validateSlideTimelineReferences(slide, `document.slides[${index}]`);
  });

  return document;
}

/**
 * 校验单页 slide 的 timeline 引用是否闭环。
 * 这里会覆盖节点目标、动画引用以及 `show-node` 与动画目标是否一致。
 */
function validateSlideTimelineReferences(slide: Slide, path: string): void {
  const nodeIds = new Set(slide.nodes.map((node) => node.id));
  const animationMap = new Map(
    slide.timeline.animations.map((animation) => [animation.id, animation]),
  );

  validateAnimationTargets(path, slide.timeline.animations, nodeIds);
  validateStepReferences(path, slide.timeline.steps, nodeIds, animationMap);
}

/**
 * 校验动画目标节点是否真实存在。
 * 这样预览器执行动画前就不会收到明显失效的目标引用。
 */
function validateAnimationTargets(
  path: string,
  animations: Slide["timeline"]["animations"],
  nodeIds: Set<string>,
): void {
  for (const animation of animations) {
    if (!nodeIds.has(animation.targetId)) {
      throw new Error(
        `${path}.timeline.animations 中的动画 ${animation.id} 指向了不存在的节点 ${animation.targetId}。`,
      );
    }
  }
}

/**
 * 校验步骤触发器与动作引用是否全部合法。
 * 这里会同时覆盖对象点击触发、节点动作以及动画动作三类引用。
 */
function validateStepReferences(
  path: string,
  steps: TimelineStep[],
  nodeIds: Set<string>,
  animationMap: Map<string, Slide["timeline"]["animations"][number]>,
): void {
  for (const step of steps) {
    validateStepActions(path, step, nodeIds, animationMap);
    validateStepTrigger(path, step, nodeIds);
  }
}

/**
 * 校验单个步骤内的动作目标。
 * 其中 `show-node` 动作会额外校验挂载的动画目标与节点目标是否一致。
 */
function validateStepActions(
  path: string,
  step: TimelineStep,
  nodeIds: Set<string>,
  animationMap: Map<string, Slide["timeline"]["animations"][number]>,
): void {
  for (const action of step.actions) {
    if (action.type === "show-node" || action.type === "hide-node") {
      validateNodeActionTarget(path, action.id, action.targetId, nodeIds);
    }

    if (action.type === "show-node" && action.animationId) {
      validateShowNodeAnimation(path, action.id, action.targetId, action.animationId, animationMap);
    }

    if (action.type === "play-animation" && !animationMap.has(action.animationId)) {
      throw new Error(
        `${path}.timeline.steps 中的动作 ${action.id} 引用了不存在的动画 ${action.animationId}。`,
      );
    }
  }
}

/**
 * 校验节点显隐动作引用的目标节点是否存在。
 */
function validateNodeActionTarget(
  path: string,
  actionId: string,
  targetId: string,
  nodeIds: Set<string>,
): void {
  if (!nodeIds.has(targetId)) {
    throw new Error(`${path}.timeline.steps 中的动作 ${actionId} 指向了不存在的节点 ${targetId}。`);
  }
}

/**
 * 校验 `show-node` 绑定的动画是否存在，并且目标节点与动作目标保持一致。
 */
function validateShowNodeAnimation(
  path: string,
  actionId: string,
  targetId: string,
  animationId: string,
  animationMap: Map<string, Slide["timeline"]["animations"][number]>,
): void {
  const matchedAnimation = animationMap.get(animationId);

  if (!matchedAnimation) {
    throw new Error(`${path}.timeline.steps 中的动作 ${actionId} 引用了不存在的动画 ${animationId}。`);
  }

  if (matchedAnimation.targetId !== targetId) {
    throw new Error(`${path}.timeline.steps 中的动作 ${actionId} 与动画 ${animationId} 的目标节点不一致。`);
  }
}

/**
 * 校验对象点击触发的目标节点是否存在。
 * 页面点击和自动触发不需要额外节点引用校验。
 */
function validateStepTrigger(path: string, step: TimelineStep, nodeIds: Set<string>): void {
  if (step.trigger.type === "node-click" && !nodeIds.has(step.trigger.targetId)) {
    throw new Error(
      `${path}.timeline.steps 中的步骤 ${step.id} 配置了不存在的触发对象 ${step.trigger.targetId}。`,
    );
  }
}
