import type { NodeBatchUpdateEntry, ReorderPosition } from "../commands";
import type {
  CoursewareDocument,
  CoursewareNode,
  ImageNodeProps,
  NodePatch,
  RectNodeProps,
  SelectionState,
  Slide,
  TextNodeProps,
  EditorSnapshot,
} from "../schema";

/** 根据页面 id 更新文档中的单个 slide。 */
export function updateDocumentSlide(
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

/** 把标准节点补丁合并到指定节点上。 */
export function applyNodePatch(node: CoursewareNode, patch: NodePatch): CoursewareNode {
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

/** 将批量命令里的节点补丁按节点 id 合并，保证每个节点最终只应用一次补丁。 */
export function createNodePatchMap(updates: NodeBatchUpdateEntry[]): Map<string, NodePatch> {
  const patchMap = new Map<string, NodePatch>();

  for (const update of updates) {
    const previousPatch = patchMap.get(update.nodeId);
    patchMap.set(
      update.nodeId,
      previousPatch ? mergeNodePatch(previousPatch, update.patch) : update.patch,
    );
  }

  return patchMap;
}

/** 合并同一个节点的连续补丁，后一次值覆盖前一次值，同时保留属性级合并。 */
export function mergeNodePatch(previousPatch: NodePatch, nextPatch: NodePatch): NodePatch {
  const mergedProps =
    previousPatch.props || nextPatch.props
      ? {
          ...(previousPatch.props ?? {}),
          ...(nextPatch.props ?? {}),
        }
      : undefined;

  return {
    ...previousPatch,
    ...nextPatch,
    props: mergedProps,
  };
}

/** 根据 id 查询文档中的指定 slide。 */
export function findSlide(document: CoursewareDocument, slideId: string): Slide | undefined {
  return document.slides.find((slide) => slide.id === slideId);
}

/** 在指定位置插入一个元素，并自动做边界保护。 */
export function insertAt<TItem>(items: TItem[], item: TItem, index?: number): TItem[] {
  const nextItems = [...items];
  const targetIndex = clamp(index ?? nextItems.length, 0, nextItems.length);
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
}

/** 按 id 新增或更新集合中的对象。 */
export function upsertById<TItem extends { id: string }>(items: TItem[], item: TItem): TItem[] {
  const index = items.findIndex((current) => current.id === item.id);

  if (index === -1) {
    return [...items, item];
  }

  return items.map((current) => (current.id === item.id ? item : current));
}

/** 根据语义位置解析重排后的最终索引。 */
export function resolveReorderIndex<TItem extends { id: string }>(
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

/** 去重后保留原始顺序，避免 selection 中出现重复节点。 */
export function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** 比较两个 selection 是否完全一致。 */
export function isSelectionEqual(a: SelectionState, b: SelectionState): boolean {
  return (
    a.slideId === b.slideId &&
    a.nodeIds.length === b.nodeIds.length &&
    a.nodeIds.every((id, index) => id === b.nodeIds[index])
  );
}

/** 对数值做统一边界收敛。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
