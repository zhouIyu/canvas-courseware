import type { CoursewareNode, SelectionState, Slide, TimelineStep } from "../schema";

/** 节点删除后对当前 slide 的收敛结果。 */
export interface SlideNodeRemovalResult {
  /** 清理掉目标节点后的最新节点列表。 */
  nodes: CoursewareNode[];
  /** 同步剔除失效引用后的最新时间轴。 */
  timeline: Slide["timeline"];
  /** 本次在当前 slide 内真正被移除的节点 id。 */
  removedNodeIds: string[];
}

/**
 * 读取可被转换为背景图的图片节点，过滤空图片框等无效场景。
 * 只有真正带资源地址的图片节点，才允许进入“设为背景”链路。
 */
export function findConvertibleImageNode(
  slide: Slide,
  nodeId: string,
): Extract<CoursewareNode, { type: "image" }> | null {
  const node = slide.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.type !== "image" || node.props.src.trim().length === 0) {
    return null;
  }

  return node;
}

/**
 * 从 slide 中移除一组节点，并同步清理 timeline 里的触发对象、动作目标和动画目标。
 * 这样所有“节点被移除”的入口都能复用同一套引用收敛规则。
 */
export function removeNodesFromSlide(
  slide: Slide,
  nodeIds: Iterable<string>,
): SlideNodeRemovalResult {
  const requestedNodeIdSet = normalizeNodeIdSet(nodeIds);
  if (requestedNodeIdSet.size === 0) {
    return {
      nodes: slide.nodes,
      timeline: slide.timeline,
      removedNodeIds: [],
    };
  }

  const removedNodeIds = slide.nodes
    .filter((node) => requestedNodeIdSet.has(node.id))
    .map((node) => node.id);
  if (removedNodeIds.length === 0) {
    return {
      nodes: slide.nodes,
      timeline: slide.timeline,
      removedNodeIds: [],
    };
  }

  const removedNodeIdSet = new Set(removedNodeIds);
  const removedAnimationIds = new Set(
    slide.timeline.animations
      .filter((animation) => removedNodeIdSet.has(animation.targetId))
      .map((animation) => animation.id),
  );

  return {
    nodes: slide.nodes.filter((node) => !removedNodeIdSet.has(node.id)),
    timeline: {
      animations: slide.timeline.animations.filter(
        (animation) => !removedNodeIdSet.has(animation.targetId),
      ),
      steps: slide.timeline.steps.flatMap((step) => {
        const nextStep = stripInvalidTimelineStep(step, removedNodeIdSet, removedAnimationIds);
        return nextStep ? [nextStep] : [];
      }),
    },
    removedNodeIds,
  };
}

/**
 * 从当前选择态中剔除一组已被移除的节点 id。
 * 仅当删除发生在当前 selection 所属页面时，才需要同步更新选择态。
 */
export function removeNodeIdsFromSelection(
  selection: SelectionState,
  slideId: string,
  nodeIds: Iterable<string>,
): SelectionState {
  if (selection.slideId !== slideId) {
    return selection;
  }

  const removedNodeIdSet = normalizeNodeIdSet(nodeIds);
  if (removedNodeIdSet.size === 0) {
    return selection;
  }

  const nextSelectionIds = selection.nodeIds.filter((nodeId) => !removedNodeIdSet.has(nodeId));
  if (nextSelectionIds.length === selection.nodeIds.length) {
    return selection;
  }

  return {
    slideId,
    nodeIds: nextSelectionIds,
  };
}

/** 把任意输入规整为去重后的节点 id 集合，避免重复删除或空值污染收敛逻辑。 */
function normalizeNodeIdSet(nodeIds: Iterable<string>): Set<string> {
  const normalizedNodeIdSet = new Set<string>();

  for (const nodeId of nodeIds) {
    if (typeof nodeId === "string" && nodeId.trim().length > 0) {
      normalizedNodeIdSet.add(nodeId);
    }
  }

  return normalizedNodeIdSet;
}

/** 清理单个步骤中的失效引用；若步骤已失去触发闭环或动作集合，则直接移除整个步骤。 */
function stripInvalidTimelineStep(
  step: TimelineStep,
  removedNodeIds: ReadonlySet<string>,
  removedAnimationIds: ReadonlySet<string>,
): TimelineStep | null {
  if (step.trigger.type === "node-click" && removedNodeIds.has(step.trigger.targetId)) {
    return null;
  }

  const nextActions = step.actions.filter((action) =>
    shouldKeepTimelineAction(action, removedNodeIds, removedAnimationIds),
  );
  if (nextActions.length === 0) {
    return null;
  }

  return nextActions.length === step.actions.length
    ? step
    : {
        ...step,
        actions: nextActions,
      };
}

/** 判断某条时间轴动作是否仍然保留有效目标。 */
function shouldKeepTimelineAction(
  action: TimelineStep["actions"][number],
  removedNodeIds: ReadonlySet<string>,
  removedAnimationIds: ReadonlySet<string>,
): boolean {
  if ("targetId" in action && removedNodeIds.has(action.targetId)) {
    return false;
  }

  if (action.type === "play-animation" && removedAnimationIds.has(action.animationId)) {
    return false;
  }

  if (
    action.type === "show-node" &&
    action.animationId &&
    removedAnimationIds.has(action.animationId)
  ) {
    return false;
  }

  return true;
}
