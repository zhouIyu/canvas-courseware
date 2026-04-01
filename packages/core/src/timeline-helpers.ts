import type { Slide, StepTrigger, TimelineAction } from "./schema";

/** 单个节点在某个步骤中的归属引用。 */
export interface NodeTimelineStepReference {
  /** 当前步骤的唯一 id。 */
  stepId: string;
  /** 当前步骤在 slide 时间轴中的顺序，从 0 开始。 */
  stepIndex: number;
  /** 当前步骤的名称。 */
  stepName: string;
  /** 当前步骤的触发方式。 */
  triggerType: StepTrigger["type"];
  /** 当前步骤里与该节点相关的动作 id 列表。 */
  actionIds: string[];
  /** 当前步骤里与该节点相关的动作类型列表。 */
  actionTypes: TimelineAction["type"][];
}

/** 单个节点在整条时间轴中的归属摘要。 */
export interface NodeTimelineSummary {
  /** 当前节点的唯一 id。 */
  nodeId: string;
  /** 当前节点在编辑态文档中的默认可见状态。 */
  isInitiallyVisible: boolean;
  /** 当前节点关联到的步骤列表，按步骤顺序升序排列。 */
  stepReferences: NodeTimelineStepReference[];
  /** 当前节点首次关联到的步骤索引；若未进入时间轴则为 `null`。 */
  firstStepIndex: number | null;
}

/**
 * 为一页 slide 中的全部节点建立时间轴归属摘要。
 * 这样 UI 层可以直接消费稳定结构，而不需要在组件里重复解析 timeline 关系。
 */
export function createSlideNodeTimelineSummaryMap(
  slide: Slide,
): Record<string, NodeTimelineSummary> {
  /** 先为全部节点建立默认摘要，保证未进时间轴的对象也能被 UI 识别。 */
  const summaryMap = Object.fromEntries(
    slide.nodes.map((node) => [
      node.id,
      {
        nodeId: node.id,
        isInitiallyVisible: node.visible,
        stepReferences: [],
        firstStepIndex: null,
      } satisfies NodeTimelineSummary,
    ]),
  ) as Record<string, NodeTimelineSummary>;

  /** 动画资源先转成按 id 索引，便于解析 `play-animation` 归属。 */
  const animationTargetMap = new Map(
    slide.timeline.animations.map((animation) => [animation.id, animation.targetId]),
  );

  slide.timeline.steps.forEach((step, stepIndex) => {
    /** 同一个步骤里，一个节点可能被多个动作引用，这里先聚合再落盘。 */
    const stepNodeActionMap = new Map<
      string,
      {
        actionIds: string[];
        actionTypes: TimelineAction["type"][];
      }
    >();

    step.actions.forEach((action) => {
      const relatedNodeId = resolveActionTargetNodeId(action, animationTargetMap);

      if (!relatedNodeId || !summaryMap[relatedNodeId]) {
        return;
      }

      const currentStepActions = stepNodeActionMap.get(relatedNodeId) ?? {
        actionIds: [],
        actionTypes: [],
      };

      currentStepActions.actionIds.push(action.id);
      currentStepActions.actionTypes.push(action.type);
      stepNodeActionMap.set(relatedNodeId, currentStepActions);
    });

    stepNodeActionMap.forEach((stepActions, nodeId) => {
      const targetSummary = summaryMap[nodeId];

      if (!targetSummary) {
        return;
      }

      targetSummary.stepReferences.push({
        stepId: step.id,
        stepIndex,
        stepName: step.name,
        triggerType: step.trigger.type,
        actionIds: [...new Set(stepActions.actionIds)],
        actionTypes: [...new Set(stepActions.actionTypes)],
      });

      if (targetSummary.firstStepIndex === null) {
        targetSummary.firstStepIndex = stepIndex;
      }
    });
  });

  return summaryMap;
}

/**
 * 读取单个节点的时间轴归属摘要。
 * 当节点不存在时返回 `null`，方便调用方显式处理空态。
 */
export function resolveNodeTimelineSummary(
  slide: Slide,
  nodeId: string,
): NodeTimelineSummary | null {
  return createSlideNodeTimelineSummaryMap(slide)[nodeId] ?? null;
}

/**
 * 从单条动作里解析它实际关联到的节点。
 * `play-animation` 需要先追到动画资源，再映射回目标节点。
 */
function resolveActionTargetNodeId(
  action: TimelineAction,
  animationTargetMap: Map<string, string>,
): string | null {
  switch (action.type) {
    case "show-node":
    case "hide-node":
      return action.targetId;
    case "play-animation":
      return animationTargetMap.get(action.animationId) ?? null;
    default:
      return null;
  }
}
