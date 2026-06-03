import { ActiveSelection, Canvas, Point, util, type TMat2D } from "fabric";
import type {
  CoursewareNode,
  EditorSnapshot,
  NodePatch,
  SelectionState,
  Slide,
} from "@canvas-courseware/core";
import {
  createFabricNodeObject,
  type FabricRenderableObject,
} from "./object-factory";
import {
  applyCanvasBackgroundImage,
  loadCanvasBackgroundImage,
  resetCanvasBackground,
  syncCanvasFrame,
  syncCanvasBackgroundImage,
} from "./background";

/** Fabric 对象上挂载节点元信息的私有字段。 */
const NODE_META_KEY = "__coursewareNodeMeta";

/** Fabric 编辑对象上的课件节点元信息。 */
export interface FabricNodeMeta {
  /** 关联的节点 id。 */
  nodeId: string;
  /** 关联的页面 id。 */
  slideId: string;
  /** 关联的节点类型。 */
  nodeType: CoursewareNode["type"];
}

/** Fabric 编辑态适配器内部统一使用的对象类型。 */
export type FabricNodeObject = FabricRenderableObject & {
  [NODE_META_KEY]?: FabricNodeMeta;
  getScaledWidth?: () => number;
  getScaledHeight?: () => number;
  getBoundingRect?: () => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  set?: (key: string | Record<string, unknown>, value?: unknown) => unknown;
};

/** 根据当前激活页面 id 从快照里解析页面。 */
export function resolveSlide(
  snapshot: EditorSnapshot,
  currentSlideId: string | null,
): Slide | undefined {
  const slideId = currentSlideId ?? snapshot.activeSlideId;
  return slideId
    ? snapshot.document.slides.find((slide) => slide.id === slideId)
    : undefined;
}

export {
  applyCanvasBackgroundImage,
  loadCanvasBackgroundImage,
  resetCanvasBackground,
  syncCanvasFrame,
  syncCanvasBackgroundImage,
};

/** 在没有可渲染页面时，重置 Fabric 画布到空白状态。 */
export function renderEmptyCanvas(
  canvas: Canvas,
  objectMap: Map<string, FabricNodeObject>,
): void {
  objectMap.clear();
  canvas.clear();
  resetCanvasBackground(canvas);
  canvas.backgroundColor = "#FFFFFF";
  canvas.renderAll();
}

/** 把标准选中态同步回 Fabric 当前画布。 */
export function applySelectionToCanvas(
  canvas: Canvas,
  selection: SelectionState,
  slideId: string,
  objectMap: Map<string, FabricNodeObject>,
): void {
  const selectedObjects =
    selection.slideId === slideId
      ? selection.nodeIds
          .map((nodeId) => objectMap.get(nodeId))
          .filter((object): object is FabricNodeObject => Boolean(object))
      : [];
  const activeObjects = canvas.getActiveObjects() as FabricNodeObject[];

  /**
   * 当当前 Fabric 选中态已经与标准 selection 完全一致时，
   * 不再额外执行一次 `discardActiveObject + setActiveObject`。
   * 这样可以避免纯文档同步阶段把控制框先清空再重建，减少旋转/拖拽结束后的闪动。
   */
  if (isCanvasSelectionMatched(activeObjects, selectedObjects)) {
    return;
  }

  canvas.discardActiveObject();

  if (selectedObjects.length === 1) {
    canvas.setActiveObject(selectedObjects[0]);
  } else if (selectedObjects.length > 1) {
    const activeSelection = new ActiveSelection(selectedObjects, {
      canvas,
    });
    applyActiveSelectionInteractionPolicy(activeSelection);
    canvas.setActiveObject(
      activeSelection,
    );
  }

  canvas.renderAll();
}

/**
 * 统一收口编辑态多选控制框的交互策略。
 * 当前先禁用 ActiveSelection 旋转，避免继续暴露尚未稳定的多选旋转链路。
 */
export function applyActiveSelectionInteractionPolicy(selection: ActiveSelection): void {
  const activeSelection = selection as ActiveSelection & {
    lockRotation?: boolean;
    setControlsVisibility?: (options: Record<string, boolean>) => void;
    setCoords?: () => void;
  };

  activeSelection.lockRotation = true;
  activeSelection.setControlsVisibility?.({
    mtr: false,
  });
  activeSelection.setCoords?.();
}

/** 判断当前 Fabric 选中对象列表是否已与标准 selection 对应的对象列表完全一致。 */
function isCanvasSelectionMatched(
  activeObjects: FabricNodeObject[],
  selectedObjects: FabricNodeObject[],
): boolean {
  return (
    activeObjects.length === selectedObjects.length &&
    activeObjects.every((object, index) => object === selectedObjects[index])
  );
}

/** 从 Fabric 当前选中对象解析标准节点 id 列表。 */
export function resolveCanvasSelectionNodeIds(
  canvas: Canvas,
  retainedNodeId: string | null,
): string[] {
  const canvasNodeIds = canvas
    .getActiveObjects()
    .map((object) => readNodeMeta(object as FabricNodeObject)?.nodeId)
    .filter((nodeId): nodeId is string => Boolean(nodeId));

  return canvasNodeIds.length === 0 && retainedNodeId ? [retainedNodeId] : canvasNodeIds;
}

/** 根据节点数据创建编辑态 Fabric 对象，并补齐编辑器专属元信息。 */
export async function createEditorNodeObject(
  node: CoursewareNode,
  slideId: string,
): Promise<FabricNodeObject | null> {
  return (await createFabricNodeObject(node, {
    interactive: true,
    finalizeObject: (object, currentNode) => {
      /**
       * 编辑态必须默认全显当前 slide 的所有对象。
       * 即使节点在预览态为了后续步骤而以 `visible=false` 起始，
       * 进入编辑画布后也要强制显示，避免排版和时间轴配置时看不到对象。
       */
      applyEditorVisibilityStrategy(object as FabricNodeObject);
      attachNodeMeta(object as FabricNodeObject, currentNode, slideId);
    },
  })) as FabricNodeObject | null;
}

/** 从 Fabric 对象读取挂载的节点元信息。 */
export function readNodeMeta(
  object: FabricNodeObject | null | undefined,
): FabricNodeMeta | null {
  if (!object) {
    return null;
  }

  return object[NODE_META_KEY] ?? null;
}

/** 读取 Fabric 对象当前几何信息，并规整到课件节点所需的数值精度。 */
export function readObjectGeometry(object: FabricNodeObject) {
  return {
    x: round(object.left ?? 0),
    y: round(object.top ?? 0),
    width: round(resolveScaledSize(object, "width", "scaleX")),
    height: round(resolveScaledSize(object, "height", "scaleY")),
    rotation: round(object.angle ?? 0),
  };
}

/** 计算多选包围盒位移，用来把批量拖拽回写成单节点更新命令。 */
export function resolveActiveSelectionTranslation(
  selection: ActiveSelection,
  nodes: CoursewareNode[],
): {
  /** 当前多选整体在 X 轴上的位移。 */
  deltaX: number;
  /** 当前多选整体在 Y 轴上的位移。 */
  deltaY: number;
} | null {
  if (nodes.length === 0) {
    return null;
  }

  const currentBounds = selection.getBoundingRect();
  const previousBounds = resolveNodeBounds(nodes);
  const deltaX = round(currentBounds.left) - previousBounds.left;
  const deltaY = round(currentBounds.top) - previousBounds.top;

  return deltaX === 0 && deltaY === 0
    ? null
    : {
        deltaX,
        deltaY,
      };
}

/** 直接计算多选整体变换后每个节点应回写到文档中的标准几何补丁。 */
export function resolveActiveSelectionNodePatches(
  snapshot: EditorSnapshot,
  slideId: string,
  selection: ActiveSelection,
): Array<{
  /** 需要回写的节点 id。 */
  nodeId: string;
  /** 节点新的标准补丁。 */
  patch: NodePatch;
}> {
  const selectedNodeIds =
    snapshot.selection.slideId === slideId ? snapshot.selection.nodeIds : [];
  const selectedNodes = resolveUnlockedSelectionNodes(snapshot, slideId, selectedNodeIds);
  if (selectedNodes.length === 0) {
    return [];
  }

  const activeSelectionObjectMap = resolveActiveSelectionObjectMap(selection);
  const selectionTransform = selection.calcTransformMatrix();

  return selectedNodes
    .map((node) => {
      const childObject = activeSelectionObjectMap.get(node.id);
      if (!childObject) {
        return null;
      }

      const patch = resolveActiveSelectionNodePatch(node, childObject, selectionTransform);
      return patch ? { nodeId: node.id, patch } : null;
    })
    .filter(
      (
        entry,
      ): entry is {
        nodeId: string;
        patch: NodePatch;
      } => Boolean(entry),
    );
}

/** 从标准快照里解析当前多选中仍可编辑的节点，避免把锁定对象写回到批量命令里。 */
function resolveUnlockedSelectionNodes(
  snapshot: EditorSnapshot,
  slideId: string,
  selectedNodeIds: string[],
): CoursewareNode[] {
  return selectedNodeIds
    .map((nodeId) => findNode(snapshot, slideId, nodeId))
    .filter((node): node is CoursewareNode => {
      if (!node) {
        return false;
      }

      return !node.locked;
    });
}

/** 建立当前 ActiveSelection 内节点 id 到 Fabric 子对象的映射，便于后续逐个回写几何。 */
function resolveActiveSelectionObjectMap(
  selection: ActiveSelection,
): Map<string, FabricNodeObject> {
  const activeSelectionObjects = selection
    .getObjects()
    .map((object) => {
      const meta = readNodeMeta(object as FabricNodeObject);
      if (!meta) {
        return null;
      }

      return {
        nodeId: meta.nodeId,
        object: object as FabricNodeObject,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        nodeId: string;
        object: FabricNodeObject;
      } => Boolean(entry),
    );

  return new Map(activeSelectionObjects.map((entry) => [entry.nodeId, entry.object]));
}

/** 把 ActiveSelection 内的子对象还原到画布坐标系，并转成标准节点补丁。 */
function resolveActiveSelectionNodePatch(
  previousNode: CoursewareNode,
  childObject: FabricNodeObject,
  selectionTransform: TMat2D,
): NodePatch | null {
  const absoluteTransform = util.multiplyTransformMatrices(
    selectionTransform,
    childObject.calcOwnMatrix(),
  );
  const decomposedTransform = util.qrDecompose(absoluteTransform);
  const centerPoint = new Point(
    decomposedTransform.translateX,
    decomposedTransform.translateY,
  );
  const width = round((childObject.width ?? previousNode.width) * Math.abs(decomposedTransform.scaleX));
  const height = round(
    (childObject.height ?? previousNode.height) * Math.abs(decomposedTransform.scaleY),
  );
  const angle = round(decomposedTransform.angle ?? 0);
  const rotatedLeftTop = resolveTopLeftFromCenter(centerPoint, width, height, angle);
  const patch: NodePatch = {
    x: round(rotatedLeftTop.x),
    y: round(rotatedLeftTop.y),
    width,
    height,
    rotation: angle,
  };

  return isNodeGeometryPatchChanged(previousNode, patch) ? patch : null;
}

/** 判断本次批量变换是否真的改变了节点几何，避免无效历史记录。 */
function isNodeGeometryPatchChanged(
  previousNode: CoursewareNode,
  patch: NodePatch,
): boolean {
  return (
    patch.x !== previousNode.x ||
    patch.y !== previousNode.y ||
    patch.width !== previousNode.width ||
    patch.height !== previousNode.height ||
    patch.rotation !== previousNode.rotation
  );
}

/** 根据中心点、尺寸和角度反推编辑器统一使用的 left/top 原点。 */
function resolveTopLeftFromCenter(
  centerPoint: Point,
  width: number,
  height: number,
  angle: number,
): Point {
  const radians = (angle * Math.PI) / 180;
  const offsetX = width / 2;
  const offsetY = height / 2;
  const rotatedOffsetX = offsetX * Math.cos(radians) - offsetY * Math.sin(radians);
  const rotatedOffsetY = offsetX * Math.sin(radians) + offsetY * Math.cos(radians);

  return new Point(centerPoint.x - rotatedOffsetX, centerPoint.y - rotatedOffsetY);
}

/** 从 Fabric 文本对象中提取需要回写的文本变更。 */
export function resolveTextNodeChange(
  snapshot: EditorSnapshot,
  slideId: string,
  target: FabricNodeObject,
): {
  /** 需要回写文本内容的节点 id。 */
  nodeId: string;
  /** 节点新的文本内容。 */
  text: string;
} | null {
  const meta = readNodeMeta(target);
  if (!meta || typeof target.text !== "string") {
    return null;
  }

  const previousNode = findNode(snapshot, slideId, meta.nodeId);
  return previousNode?.type !== "text" || previousNode.props.text === target.text
    ? null
    : {
        nodeId: meta.nodeId,
        text: target.text,
      };
}

/** 从标准快照里读取指定页面上的节点对象。 */
export function findNode(
  snapshot: EditorSnapshot,
  slideId: string,
  nodeId: string,
): CoursewareNode | undefined {
  return snapshot.document.slides
    .find((slide) => slide.id === slideId)
    ?.nodes.find((node) => node.id === nodeId);
}

/**
 * 编辑态统一采用“默认全显”的展示策略。
 * 这里不改动文档中的 `visible` 字段，只覆盖编辑画布中的实际显示状态，
 * 从而保持编辑态与播放态解耦。
 */
function applyEditorVisibilityStrategy(object: FabricNodeObject): void {
  object.visible = true;
}

/** 把节点元信息挂到 Fabric 对象上，供后续事件回写时查找标准节点。 */
function attachNodeMeta(
  object: FabricNodeObject,
  node: CoursewareNode,
  slideId: string,
): void {
  object[NODE_META_KEY] = {
    nodeId: node.id,
    slideId,
    nodeType: node.type,
  };
}

/** 读取一组节点在标准文档坐标系下的最小包围盒。 */
function resolveNodeBounds(nodes: CoursewareNode[]) {
  return {
    left: round(Math.min(...nodes.map((node) => node.x))),
    top: round(Math.min(...nodes.map((node) => node.y))),
    right: round(Math.max(...nodes.map((node) => node.x + node.width))),
    bottom: round(Math.max(...nodes.map((node) => node.y + node.height))),
  };
}

/** 统一读取对象在当前缩放状态下的真实宽高。 */
function resolveScaledSize(
  object: FabricNodeObject,
  dimensionKey: "width" | "height",
  scaleKey: "scaleX" | "scaleY",
): number {
  const methodName = dimensionKey === "width" ? "getScaledWidth" : "getScaledHeight";
  const method = object[methodName];

  if (typeof method === "function") {
    return method.call(object);
  }

  return Number(object[dimensionKey] ?? 0) * Number(object[scaleKey] ?? 1);
}

/** 统一把浮点几何值规整到三位小数，避免重复同步带来抖动。 */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
