import type { NodeBatchUpdateEntry, ReorderPosition } from "./commands";
import type {
  CoursewareNode,
  EditorSnapshot,
  NodeAnimation,
  NodePatch,
  SelectionState,
  Slide,
  TimelineStep,
} from "./schema";
import { activateSlide, createSnapshotForDocument, deleteSlide, insertSlide, reorderSlide, updateSlide } from "./reducer/slide";
import {
  applyNodePatch,
  clamp,
  createNodePatchMap,
  findSlide,
  insertAt,
  isSelectionEqual,
  resolveReorderIndex,
  unique,
  updateDocumentSlide,
  upsertById,
} from "./reducer/shared";

/** 按命令类型收敛 editor snapshot 的所有状态变更。 */
export function reduceSnapshot(
  snapshot: EditorSnapshot,
  command: import("./commands").EditorCommand,
): EditorSnapshot {
  switch (command.type) {
    case "document.replace":
      return createSnapshotForDocument(command.document);
    case "slide.create":
      return insertSlide(snapshot, command.slide, command.index);
    case "slide.update":
      return updateSlide(snapshot, command.slideId, command.patch);
    case "slide.delete":
      return deleteSlide(snapshot, command.slideId);
    case "slide.reorder":
      return reorderSlide(snapshot, command.slideId, command.index);
    case "slide.activate":
      return activateSlide(snapshot, command.slideId);
    case "node.create":
      return createNode(snapshot, command.slideId, command.node, command.index);
    case "node.batch.update":
      return updateNodes(snapshot, command.slideId, command.updates);
    case "node.update":
      return updateNode(snapshot, command.slideId, command.nodeId, command.patch);
    case "node.delete":
      return deleteNode(snapshot, command.slideId, command.nodeId);
    case "selection.set":
      return setSelection(snapshot, command.slideId, command.nodeIds);
    case "selection.clear":
      return clearSelection(snapshot, command.slideId);
    case "node.reorder":
      return reorderNode(
        snapshot,
        command.slideId,
        command.nodeId,
        command.position,
        command.index,
        command.targetNodeId,
      );
    case "timeline.step.upsert":
      return upsertTimelineStep(snapshot, command.slideId, command.step, command.index);
    case "timeline.step.remove":
      return removeTimelineStep(snapshot, command.slideId, command.stepId);
    case "timeline.step.reorder":
      return reorderTimelineStep(snapshot, command.slideId, command.stepId, command.index);
    case "timeline.animation.upsert":
      return upsertAnimation(snapshot, command.slideId, command.animation);
    case "timeline.animation.remove":
      return removeAnimation(snapshot, command.slideId, command.animationId);
    case "playback.slide.set":
      return setPlaybackSlide(snapshot, command.slideId);
    case "playback.step.advance":
      return advancePlaybackStep(snapshot);
    case "playback.reset":
      return resetPlayback(snapshot, command.slideId);
    default:
      return snapshot;
  }
}

/** 在指定 slide 中新增一个节点。 */
function createNode(
  snapshot: EditorSnapshot,
  slideId: string,
  node: CoursewareNode,
  index?: number,
): EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => ({
    ...slide,
    nodes: insertNodeAt(slide.nodes, node, index),
  }));
}

/** 更新单个节点的标准属性。 */
function updateNode(
  snapshot: EditorSnapshot,
  slideId: string,
  nodeId: string,
  patch: NodePatch,
): EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => {
    let changed = false;
    const nextNodes = slide.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      changed = true;
      return applyNodePatch(node, patch);
    });

    return changed ? { ...slide, nodes: nextNodes } : slide;
  });
}

/** 把同一页面上的多个节点补丁合并为一次文档更新，供多选排版和批量拖拽复用。 */
function updateNodes(
  snapshot: EditorSnapshot,
  slideId: string,
  updates: NodeBatchUpdateEntry[],
): EditorSnapshot {
  const patchMap = createNodePatchMap(updates);
  if (patchMap.size === 0) {
    return snapshot;
  }

  return updateDocumentSlide(snapshot, slideId, (slide) => {
    let changed = false;
    const nextNodes = slide.nodes.map((node) => {
      const patch = patchMap.get(node.id);
      if (!patch) {
        return node;
      }

      changed = true;
      return applyNodePatch(node, patch);
    });

    return changed ? { ...slide, nodes: nextNodes } : slide;
  });
}

/** 删除单个节点，并同步清理当前选择态。 */
function deleteNode(snapshot: EditorSnapshot, slideId: string, nodeId: string): EditorSnapshot {
  const nextSnapshot = updateDocumentSlide(snapshot, slideId, (slide) => {
    const nextNodes = slide.nodes.filter((node) => node.id !== nodeId);
    return nextNodes.length === slide.nodes.length ? slide : { ...slide, nodes: nextNodes };
  });

  if (nextSnapshot === snapshot) {
    return snapshot;
  }

  if (snapshot.selection.slideId !== slideId) {
    return nextSnapshot;
  }

  const nextSelectionIds = snapshot.selection.nodeIds.filter((id) => id !== nodeId);
  if (nextSelectionIds.length === snapshot.selection.nodeIds.length) {
    return nextSnapshot;
  }

  return {
    ...nextSnapshot,
    selection: {
      slideId,
      nodeIds: nextSelectionIds,
    },
  };
}

/** 设置当前 slide 的选中节点列表。 */
function setSelection(
  snapshot: EditorSnapshot,
  slideId: string,
  nodeIds: string[],
): EditorSnapshot {
  const slide = findSlide(snapshot.document, slideId);
  if (!slide) {
    return snapshot;
  }

  const nodeIdSet = new Set(slide.nodes.map((node) => node.id));
  const filteredIds = unique(nodeIds).filter((nodeId) => nodeIdSet.has(nodeId));
  const nextSelection: SelectionState = {
    slideId,
    nodeIds: filteredIds,
  };

  return isSelectionEqual(snapshot.selection, nextSelection)
    ? snapshot
    : {
        ...snapshot,
        selection: nextSelection,
      };
}

/** 清空当前页面的节点选择。 */
function clearSelection(snapshot: EditorSnapshot, slideId?: string): EditorSnapshot {
  const nextSelection: SelectionState = {
    slideId: slideId ?? snapshot.activeSlideId,
    nodeIds: [],
  };

  return isSelectionEqual(snapshot.selection, nextSelection)
    ? snapshot
    : {
        ...snapshot,
        selection: nextSelection,
      };
}

/** 调整节点层级顺序。 */
function reorderNode(
  snapshot: EditorSnapshot,
  slideId: string,
  nodeId: string,
  position: ReorderPosition,
  index?: number,
  targetNodeId?: string,
): EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => {
    const currentIndex = slide.nodes.findIndex((node) => node.id === nodeId);
    if (currentIndex === -1) {
      return slide;
    }

    const nextNodes = [...slide.nodes];
    const [node] = nextNodes.splice(currentIndex, 1);
    const targetIndex = resolveReorderIndex(
      nextNodes,
      currentIndex,
      position,
      index,
      targetNodeId,
    );

    nextNodes.splice(targetIndex, 0, node);

    if (nextNodes.every((item, itemIndex) => item.id === slide.nodes[itemIndex]?.id)) {
      return slide;
    }

    return {
      ...slide,
      nodes: nextNodes,
    };
  });
}

/** 新增或更新某个 timeline 步骤。 */
function upsertTimelineStep(
  snapshot: EditorSnapshot,
  slideId: string,
  step: TimelineStep,
  index?: number,
): EditorSnapshot {
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
function removeTimelineStep(
  snapshot: EditorSnapshot,
  slideId: string,
  stepId: string,
): EditorSnapshot {
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
function reorderTimelineStep(
  snapshot: EditorSnapshot,
  slideId: string,
  stepId: string,
  index: number,
): EditorSnapshot {
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
function upsertAnimation(
  snapshot: EditorSnapshot,
  slideId: string,
  animation: NodeAnimation,
): EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => ({
    ...slide,
    timeline: {
      ...slide.timeline,
      animations: upsertById(slide.timeline.animations, animation),
    },
  }));
}

/** 删除指定的节点动画资源。 */
function removeAnimation(
  snapshot: EditorSnapshot,
  slideId: string,
  animationId: string,
): EditorSnapshot {
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

/** 切换播放态所在的 slide，并重置播放进度。 */
function setPlaybackSlide(snapshot: EditorSnapshot, slideId: string): EditorSnapshot {
  if (!findSlide(snapshot.document, slideId)) {
    return snapshot;
  }

  if (
    snapshot.playback.slideId === slideId &&
    snapshot.playback.stepIndex === 0 &&
    snapshot.playback.status === "idle"
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    playback: {
      slideId,
      stepIndex: 0,
      status: "idle",
    },
  };
}

/** 推进当前 slide 的播放步骤。 */
function advancePlaybackStep(snapshot: EditorSnapshot): EditorSnapshot {
  const slideId = snapshot.playback.slideId ?? snapshot.activeSlideId;
  const slide = slideId ? findSlide(snapshot.document, slideId) : undefined;
  if (!slide) {
    return snapshot;
  }

  const totalSteps = slide.timeline.steps.length;
  if (totalSteps === 0) {
    return snapshot.playback.status === "completed"
      ? snapshot
      : {
          ...snapshot,
          playback: {
            slideId,
            stepIndex: 0,
            status: "completed",
          },
        };
  }

  const nextStepIndex = Math.min(snapshot.playback.stepIndex + 1, totalSteps);
  const nextStatus = nextStepIndex >= totalSteps ? "completed" : "playing";

  if (
    snapshot.playback.slideId === slideId &&
    snapshot.playback.stepIndex === nextStepIndex &&
    snapshot.playback.status === nextStatus
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    playback: {
      slideId,
      stepIndex: nextStepIndex,
      status: nextStatus,
    },
  };
}

/** 重置指定 slide 的播放进度。 */
function resetPlayback(snapshot: EditorSnapshot, slideId?: string): EditorSnapshot {
  const targetSlideId = slideId ?? snapshot.playback.slideId ?? snapshot.activeSlideId;

  if (targetSlideId && !findSlide(snapshot.document, targetSlideId)) {
    return snapshot;
  }

  if (
    snapshot.playback.slideId === (targetSlideId ?? null) &&
    snapshot.playback.stepIndex === 0 &&
    snapshot.playback.status === "idle"
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    playback: {
      slideId: targetSlideId ?? null,
      stepIndex: 0,
      status: "idle",
    },
  };
}

/** 在节点数组中按目标索引插入新节点。 */
function insertNodeAt<TNode>(nodes: TNode[], node: TNode, index?: number): TNode[] {
  const nextNodes = [...nodes];
  const targetIndex = Math.min(Math.max(index ?? nextNodes.length, 0), nextNodes.length);
  nextNodes.splice(targetIndex, 0, node);
  return nextNodes;
}
