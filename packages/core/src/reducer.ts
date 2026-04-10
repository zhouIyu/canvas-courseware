import type { NodeBatchUpdateEntry, ReorderPosition } from "./commands";
import type {
  CoursewareNode,
  EditorSnapshot,
  NodePatch,
  ObjectFit,
  SelectionState,
} from "./schema";
import {
  findConvertibleImageNode,
  removeNodeIdsFromSelection,
  removeNodesFromSlide,
} from "./reducer/node-removal";
import { activateSlide, createSnapshotForDocument, deleteSlide, insertSlide, reorderSlide, updateSlide } from "./reducer/slide";
import {
  removeAnimation,
  removeTimelineStep,
  reorderTimelineStep,
  upsertAnimation,
  upsertTimelineStep,
} from "./reducer/timeline";
import {
  applyNodePatch,
  createNodePatchMap,
  findSlide,
  insertAt,
  isSelectionEqual,
  resolveReorderIndex,
  unique,
  updateDocumentSlide,
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
    case "node.image.set-as-background":
      return setImageNodeAsBackground(snapshot, command.slideId, command.nodeId, command.fit);
    case "node.batch.delete":
      return deleteNodes(snapshot, command.slideId, command.nodeIds);
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
  return deleteNodes(snapshot, slideId, [nodeId]);
}

/** 统一删除同一页面中的多个节点，并同步收敛时间轴与当前选择态。 */
function deleteNodes(
  snapshot: EditorSnapshot,
  slideId: string,
  nodeIds: string[],
): EditorSnapshot {
  let removedNodeIds: string[] = [];
  const nextSnapshot = updateDocumentSlide(snapshot, slideId, (slide) => {
    const cleanupResult = removeNodesFromSlide(slide, nodeIds);
    removedNodeIds = cleanupResult.removedNodeIds;

    return cleanupResult.removedNodeIds.length === 0
      ? slide
      : {
          ...slide,
          nodes: cleanupResult.nodes,
          timeline: cleanupResult.timeline,
        };
  });

  return nextSnapshot === snapshot
    ? snapshot
    : syncSelectionAfterNodeRemoval(nextSnapshot, snapshot.selection, slideId, removedNodeIds);
}

/** 把当前图片节点转换成 slide 背景，并同步清理原节点与相关时间轴引用。 */
function setImageNodeAsBackground(
  snapshot: EditorSnapshot,
  slideId: string,
  nodeId: string,
  fit?: ObjectFit,
): EditorSnapshot {
  const slide = findSlide(snapshot.document, slideId);
  const imageNode = slide ? findConvertibleImageNode(slide, nodeId) : null;
  if (!slide || !imageNode) {
    return snapshot;
  }

  let removedNodeIds: string[] = [];
  const nextSnapshot = updateDocumentSlide(snapshot, slideId, (currentSlide) => {
    const cleanupResult = removeNodesFromSlide(currentSlide, [nodeId]);
    removedNodeIds = cleanupResult.removedNodeIds;

    return cleanupResult.removedNodeIds.length === 0
      ? currentSlide
      : {
          ...currentSlide,
          background: {
            ...currentSlide.background,
            image: {
              src: imageNode.props.src.trim(),
              fit: fit ?? imageNode.props.objectFit ?? currentSlide.background.image?.fit ?? "cover",
            },
          },
          nodes: cleanupResult.nodes,
          timeline: cleanupResult.timeline,
        };
  });

  return nextSnapshot === snapshot
    ? snapshot
    : syncSelectionAfterNodeRemoval(nextSnapshot, snapshot.selection, slideId, removedNodeIds);
}

/** 把当前选择态与实际删除结果重新对齐，避免 UI 继续保留已失效的选中对象。 */
function syncSelectionAfterNodeRemoval(
  snapshot: EditorSnapshot,
  selection: SelectionState,
  slideId: string,
  nodeIds: string[],
): EditorSnapshot {
  const nextSelection = removeNodeIdsFromSelection(selection, slideId, nodeIds);
  if (nextSelection === selection) {
    return snapshot;
  }

  return {
    ...snapshot,
    selection: nextSelection,
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
