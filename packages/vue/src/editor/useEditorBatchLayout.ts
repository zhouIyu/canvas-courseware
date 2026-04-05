import type {
  CoursewareNode,
  EditorController,
  EditorSnapshot,
  NodePatch,
  Slide,
} from "@canvas-courseware/core";
import type { ComputedRef, ShallowRef } from "vue";

/** 图层面板批量对齐动作。 */
export type LayerAlignMode =
  | "left"
  | "h-center"
  | "right"
  | "top"
  | "v-center"
  | "bottom";

/** 图层面板批量分布动作。 */
export type LayerDistributeMode = "horizontal" | "vertical";

/** 批量排版 composable 的初始化参数。 */
interface UseEditorBatchLayoutOptions {
  /** 编辑器当前快照。 */
  snapshot: ShallowRef<EditorSnapshot>;
  /** 当前激活页面。 */
  activeSlide: ComputedRef<Slide | undefined>;
  /** 命令控制器，用于派发标准更新命令。 */
  controller: EditorController;
}

/** 批量坐标回写时使用的最小补丁条目。 */
interface NodePositionUpdateEntry {
  /** 需要更新的节点 id。 */
  nodeId: string;
  /** 节点新的坐标补丁。 */
  patch: Pick<NodePatch, "x" | "y">;
}

/**
 * 组合多选后的对齐与分布能力。
 * 这里只负责把批量排版意图转换成标准节点更新命令，不直接碰 Fabric 对象。
 */
export function useEditorBatchLayout(options: UseEditorBatchLayoutOptions) {
  /** 读取当前页面里处于选中态且可编辑的节点列表。 */
  const resolveEditableSelectedNodes = (): CoursewareNode[] => {
    const slide = options.activeSlide.value;
    if (!slide || options.snapshot.value.selection.nodeIds.length === 0) {
      return [];
    }

    return options.snapshot.value.selection.nodeIds
      .map((nodeId) => slide.nodes.find((node) => node.id === nodeId))
      .filter((node): node is CoursewareNode => {
        if (!node) {
          return false;
        }

        return !node.locked;
      });
  };

  /** 对当前多选节点执行批量对齐。 */
  const alignSelectedNodes = (mode: LayerAlignMode) => {
    const selectedNodes = resolveEditableSelectedNodes();
    const slide = options.activeSlide.value;
    if (selectedNodes.length < 2 || !slide) {
      return;
    }

    const updates = resolveAlignUpdates(selectedNodes, mode);
    if (updates.length === 0) {
      return;
    }

    options.controller.execute({
      type: "node.batch.update",
      slideId: slide.id,
      updates,
    });
  };

  /** 对当前多选节点执行批量分布。 */
  const distributeSelectedNodes = (mode: LayerDistributeMode) => {
    const selectedNodes = resolveEditableSelectedNodes();
    const slide = options.activeSlide.value;
    if (selectedNodes.length < 3 || !slide) {
      return;
    }

    const updates = resolveDistributeUpdates(selectedNodes, mode);
    if (updates.length === 0) {
      return;
    }

    options.controller.execute({
      type: "node.batch.update",
      slideId: slide.id,
      updates,
    });
  };

  return {
    alignSelectedNodes,
    distributeSelectedNodes,
  };
}

/** 计算批量对齐后真正需要写回的节点坐标补丁。 */
function resolveAlignUpdates(
  nodes: CoursewareNode[],
  mode: LayerAlignMode,
): NodePositionUpdateEntry[] {
  const bounds = resolveSelectionBounds(nodes);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;

  return filterChangedPositionUpdates(
    nodes,
    nodes.map((node) => ({
      nodeId: node.id,
      patch: resolveAlignedPosition(node, mode, bounds, centerX, centerY),
    })),
  );
}

/** 计算批量分布后真正需要写回的节点坐标补丁。 */
function resolveDistributeUpdates(
  nodes: CoursewareNode[],
  mode: LayerDistributeMode,
): NodePositionUpdateEntry[] {
  const sortedNodes =
    mode === "horizontal"
      ? [...nodes].sort((a, b) => a.x + a.width / 2 - (b.x + b.width / 2))
      : [...nodes].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const firstNode = sortedNodes[0];
  const lastNode = sortedNodes[sortedNodes.length - 1];
  const firstCenter =
    mode === "horizontal"
      ? firstNode.x + firstNode.width / 2
      : firstNode.y + firstNode.height / 2;
  const lastCenter =
    mode === "horizontal"
      ? lastNode.x + lastNode.width / 2
      : lastNode.y + lastNode.height / 2;
  const gap = (lastCenter - firstCenter) / (sortedNodes.length - 1);

  return filterChangedPositionUpdates(
    sortedNodes,
    sortedNodes.slice(1, -1).map((node, index) => ({
      nodeId: node.id,
      patch:
        mode === "horizontal"
          ? { x: firstCenter + gap * (index + 1) - node.width / 2, y: node.y }
          : { x: node.x, y: firstCenter + gap * (index + 1) - node.height / 2 },
    })),
  );
}

/** 读取一组节点的最小包围盒。 */
function resolveSelectionBounds(nodes: CoursewareNode[]) {
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));

  return {
    left,
    top,
    right,
    bottom,
  };
}

/** 过滤掉位置没有变化的批量补丁，避免无意义历史记录。 */
function filterChangedPositionUpdates(
  nodes: CoursewareNode[],
  updates: NodePositionUpdateEntry[],
): NodePositionUpdateEntry[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return updates.filter((update) => {
    const node = nodeMap.get(update.nodeId);
    return node ? update.patch.x !== node.x || update.patch.y !== node.y : false;
  });
}

/** 根据对齐动作计算节点的新坐标。 */
function resolveAlignedPosition(
  node: CoursewareNode,
  mode: LayerAlignMode,
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  },
  centerX: number,
  centerY: number,
) {
  switch (mode) {
    case "left":
      return { x: bounds.left, y: node.y };
    case "h-center":
      return { x: centerX - node.width / 2, y: node.y };
    case "right":
      return { x: bounds.right - node.width, y: node.y };
    case "top":
      return { x: node.x, y: bounds.top };
    case "v-center":
      return { x: node.x, y: centerY - node.height / 2 };
    case "bottom":
      return { x: node.x, y: bounds.bottom - node.height };
    default:
      return { x: node.x, y: node.y };
  }
}
