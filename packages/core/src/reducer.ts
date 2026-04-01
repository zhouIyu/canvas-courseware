import type { EditorCommand, ReorderPosition } from "./commands";
import type {
  CoursewareDocument,
  CoursewareNode,
  EditorSnapshot,
  ImageNodeProps,
  NodeAnimation,
  NodePatch,
  PlaybackState,
  RectNodeProps,
  SelectionState,
  Slide,
  TextNodeProps,
  TimelineStep,
} from "./schema";

export function reduceSnapshot(
  snapshot: EditorSnapshot,
  command: EditorCommand,
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
    case "slide.activate":
      return activateSlide(snapshot, command.slideId);
    case "node.create":
      return createNode(snapshot, command.slideId, command.node, command.index);
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
      return upsertTimelineStep(snapshot, command.slideId, command.step);
    case "timeline.step.remove":
      return removeTimelineStep(snapshot, command.slideId, command.stepId);
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

function createSnapshotForDocument(document: CoursewareDocument): EditorSnapshot {
  const activeSlideId = document.slides[0]?.id ?? null;

  return {
    document,
    activeSlideId,
    selection: {
      slideId: activeSlideId,
      nodeIds: [],
    },
    playback: {
      slideId: activeSlideId,
      stepIndex: 0,
      status: "idle",
    },
  };
}

function insertSlide(snapshot: EditorSnapshot, slide: Slide, index?: number): EditorSnapshot {
  const nextSlides = insertAt(snapshot.document.slides, slide, index);
  const nextDocument = { ...snapshot.document, slides: nextSlides };
  const activeSlideId = snapshot.activeSlideId ?? slide.id;

  return {
    ...snapshot,
    document: nextDocument,
    activeSlideId,
    selection: snapshot.activeSlideId
      ? snapshot.selection
      : {
          slideId: slide.id,
          nodeIds: [],
        },
    playback: snapshot.playback.slideId
      ? snapshot.playback
      : {
          slideId: slide.id,
          stepIndex: 0,
          status: "idle",
        },
  };
}

function updateSlide(
  snapshot: EditorSnapshot,
  slideId: string,
  patch: Partial<Pick<Slide, "name" | "size" | "background">>,
): EditorSnapshot {
  let changed = false;
  const nextSlides = snapshot.document.slides.map((slide) => {
    if (slide.id !== slideId) {
      return slide;
    }

    changed = true;
    return {
      ...slide,
      name: patch.name ?? slide.name,
      size: patch.size ? { ...slide.size, ...patch.size } : slide.size,
      background: patch.background
        ? { ...slide.background, ...patch.background }
        : slide.background,
    };
  });

  if (!changed) {
    return snapshot;
  }

  return {
    ...snapshot,
    document: { ...snapshot.document, slides: nextSlides },
  };
}

function deleteSlide(snapshot: EditorSnapshot, slideId: string): EditorSnapshot {
  const index = snapshot.document.slides.findIndex((slide) => slide.id === slideId);

  if (index === -1) {
    return snapshot;
  }

  const nextSlides = snapshot.document.slides.filter((slide) => slide.id !== slideId);
  const nextDocument = { ...snapshot.document, slides: nextSlides };
  const fallbackSlideId = nextSlides[Math.min(index, nextSlides.length - 1)]?.id ?? null;
  const activeSlideId =
    snapshot.activeSlideId === slideId ? fallbackSlideId : snapshot.activeSlideId;
  const selection =
    snapshot.selection.slideId === slideId
      ? {
          slideId: activeSlideId,
          nodeIds: [],
        }
      : snapshot.selection;
  const playback =
    snapshot.playback.slideId === slideId
      ? ({
          slideId: fallbackSlideId,
          stepIndex: 0,
          status: "idle",
        } satisfies PlaybackState)
      : snapshot.playback;

  return {
    ...snapshot,
    document: nextDocument,
    activeSlideId,
    selection,
    playback,
  };
}

function activateSlide(snapshot: EditorSnapshot, slideId: string): EditorSnapshot {
  if (snapshot.activeSlideId === slideId || !findSlide(snapshot.document, slideId)) {
    return snapshot;
  }

  return {
    ...snapshot,
    activeSlideId: slideId,
    selection: {
      slideId,
      nodeIds: [],
    },
  };
}

function createNode(
  snapshot: EditorSnapshot,
  slideId: string,
  node: CoursewareNode,
  index?: number,
): EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => ({
    ...slide,
    nodes: insertAt(slide.nodes, node, index),
  }));
}

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

function upsertTimelineStep(
  snapshot: EditorSnapshot,
  slideId: string,
  step: TimelineStep,
): EditorSnapshot {
  return updateDocumentSlide(snapshot, slideId, (slide) => ({
    ...slide,
    timeline: {
      ...slide.timeline,
      steps: upsertById(slide.timeline.steps, step),
    },
  }));
}

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

function updateDocumentSlide(
  snapshot: EditorSnapshot,
  slideId: string,
  updater: (slide: Slide) => Slide,
): EditorSnapshot {
  let changed = false;
  const nextSlides = snapshot.document.slides.map((slide) => {
    if (slide.id !== slideId) {
      return slide;
    }

    const nextSlide = updater(slide);
    if (nextSlide !== slide) {
      changed = true;
    }
    return nextSlide;
  });

  if (!changed) {
    return snapshot;
  }

  return {
    ...snapshot,
    document: {
      ...snapshot.document,
      slides: nextSlides,
    },
  };
}

function applyNodePatch(node: CoursewareNode, patch: NodePatch): CoursewareNode {
  const nextProps = patch.props
    ? {
        ...node.props,
        ...patch.props,
      }
    : node.props;

  switch (node.type) {
    case "text":
      return {
        ...node,
        name: patch.name ?? node.name,
        x: patch.x ?? node.x,
        y: patch.y ?? node.y,
        width: patch.width ?? node.width,
        height: patch.height ?? node.height,
        rotation: patch.rotation ?? node.rotation,
        opacity: patch.opacity ?? node.opacity,
        visible: patch.visible ?? node.visible,
        locked: patch.locked ?? node.locked,
        props: nextProps as TextNodeProps,
      };
    case "image":
      return {
        ...node,
        name: patch.name ?? node.name,
        x: patch.x ?? node.x,
        y: patch.y ?? node.y,
        width: patch.width ?? node.width,
        height: patch.height ?? node.height,
        rotation: patch.rotation ?? node.rotation,
        opacity: patch.opacity ?? node.opacity,
        visible: patch.visible ?? node.visible,
        locked: patch.locked ?? node.locked,
        props: nextProps as ImageNodeProps,
      };
    case "rect":
      return {
        ...node,
        name: patch.name ?? node.name,
        x: patch.x ?? node.x,
        y: patch.y ?? node.y,
        width: patch.width ?? node.width,
        height: patch.height ?? node.height,
        rotation: patch.rotation ?? node.rotation,
        opacity: patch.opacity ?? node.opacity,
        visible: patch.visible ?? node.visible,
        locked: patch.locked ?? node.locked,
        props: nextProps as RectNodeProps,
      };
    default:
      return node;
  }
}

function findSlide(document: CoursewareDocument, slideId: string): Slide | undefined {
  return document.slides.find((slide) => slide.id === slideId);
}

function insertAt<TItem>(items: TItem[], item: TItem, index?: number): TItem[] {
  const nextItems = [...items];
  const targetIndex = clamp(index ?? nextItems.length, 0, nextItems.length);
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
}

function upsertById<TItem extends { id: string }>(items: TItem[], item: TItem): TItem[] {
  const index = items.findIndex((current) => current.id === item.id);

  if (index === -1) {
    return [...items, item];
  }

  return items.map((current) => (current.id === item.id ? item : current));
}

function resolveReorderIndex<TItem extends { id: string }>(
  items: TItem[],
  currentIndex: number,
  position: ReorderPosition,
  index?: number,
  targetNodeId?: string,
): number {
  if (targetNodeId) {
    const targetIndex = items.findIndex((item) => item.id === targetNodeId);
    if (targetIndex !== -1) {
      return targetIndex;
    }
  }

  switch (position) {
    case "front":
      return items.length;
    case "back":
      return 0;
    case "forward":
      return clamp(currentIndex + 1, 0, items.length);
    case "backward":
      return clamp(currentIndex - 1, 0, items.length);
    case "index":
      return clamp(index ?? currentIndex, 0, items.length);
    default:
      return currentIndex;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isSelectionEqual(a: SelectionState, b: SelectionState): boolean {
  return (
    a.slideId === b.slideId &&
    a.nodeIds.length === b.nodeIds.length &&
    a.nodeIds.every((id, index) => id === b.nodeIds[index])
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
