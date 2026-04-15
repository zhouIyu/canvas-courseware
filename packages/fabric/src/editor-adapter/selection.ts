import { ActiveSelection, type ModifiedEvent } from "fabric";
import {
  findNode,
  readNodeMeta,
  readObjectGeometry,
  resolveActiveSelectionNodeTranslations,
  resolveCanvasSelectionNodeIds,
  type FabricNodeObject,
} from "../editor-adapter-support";
import type { FabricAutoSaveBlockReason } from "../editor-adapter-types";
import type { FabricEditorAdapterContext } from "./context";

/**
 * 对象拖拽、缩放、旋转结束后，Fabric 可能会短暂抛出一次空选中。
 * 这里保留一个很短的兜底窗口，避免编辑侧面板被误清空。
 */
const SELECTION_RETENTION_WINDOW_MS = 180;

/**
 * 拖拽、缩放、旋转完成后的短稳定窗口。
 * 让自动保存等待画布与侧栏状态彻底稳定后再执行，避免交互刚结束就触发闪动。
 */
const TRANSFORM_AUTOSAVE_SETTLE_MS = 1000;

/** 把当前 Fabric 选中态同步回标准控制器。 */
export function emitEditorSelectionChange(context: FabricEditorAdapterContext): void {
  if (context.isSyncing || !context.canvas || !context.controller || !context.currentSlideId) {
    return;
  }

  const retainedNodeId = getRetainedSelectionNodeId(context);
  const nodeIds = resolveCanvasSelectionNodeIds(context.canvas, retainedNodeId);

  if (nodeIds.length === 1) {
    retainSelection(context, nodeIds[0]);
  } else {
    clearRetainedSelection(context);
  }

  context.controller.handleAdapterEvent({
    type: "adapter.selection.changed",
    slideId: context.currentSlideId,
    nodeIds,
  });
}

/** 处理对象变换完成后的标准文档回写。 */
export function handleEditorObjectModified(
  context: FabricEditorAdapterContext,
  event: ModifiedEvent,
): void {
  if (context.isSyncing || !context.controller || !context.currentSlideId) {
    return;
  }

  const target = event.target as FabricNodeObject | undefined;
  if (!target) {
    return;
  }

  if (target instanceof ActiveSelection) {
    handleActiveSelectionModified(context, event, target);
    return;
  }

  handleSingleObjectModified(context, event, target);
}

/** 统一处理右键菜单请求，并把命中目标同步回标准选中态。 */
export function handleEditorContextMenu(
  context: FabricEditorAdapterContext,
  target: FabricNodeObject | ActiveSelection | undefined,
  nativeEvent?: Event,
): void {
  const mouseEvent = nativeEvent instanceof MouseEvent ? nativeEvent : null;
  if (!mouseEvent) {
    return;
  }

  mouseEvent.preventDefault();

  const selectionNodeIds = resolveContextMenuSelectionNodeIds(context, target);
  const meta =
    target instanceof ActiveSelection
      ? null
      : target
        ? readNodeMeta(target)
        : null;
  syncContextMenuSelection(context, selectionNodeIds);

  context.onContextMenuRequest?.({
    clientX: mouseEvent.clientX,
    clientY: mouseEvent.clientY,
    slideId: context.currentSlideId,
    nodeId: meta?.nodeId ?? null,
    selectionNodeIds,
  });
}

/** 从当前 Fabric 目标对象中提取要保留的单选节点。 */
export function captureSelectionTarget(
  context: FabricEditorAdapterContext,
  target: FabricNodeObject | undefined,
): void {
  markCanvasTransformAutoSaveBlock(context);
  const meta = target ? readNodeMeta(target) : null;
  if (!meta) {
    return;
  }

  retainSelection(context, meta.nodeId);
}

/** 标记最近发生过一次画布变换，让自动保存稍后再执行。 */
export function markCanvasTransformAutoSaveBlock(
  context: FabricEditorAdapterContext,
): void {
  context.autoSaveBlockReason = "canvas-transform";
  context.autoSaveBlockExpiresAt = Date.now() + TRANSFORM_AUTOSAVE_SETTLE_MS;
}

/** 读取当前仍然有效的画布变换阻塞原因。 */
export function readCanvasTransformAutoSaveBlockReason(
  context: FabricEditorAdapterContext,
): FabricAutoSaveBlockReason | null {
  if (
    context.autoSaveBlockReason !== "canvas-transform" ||
    Date.now() > context.autoSaveBlockExpiresAt
  ) {
    clearCanvasTransformAutoSaveBlock(context);
    return null;
  }

  return context.autoSaveBlockReason;
}

/** 清理已经失效的画布变换自动保存阻塞状态。 */
export function clearCanvasTransformAutoSaveBlock(
  context: FabricEditorAdapterContext,
): void {
  context.autoSaveBlockReason = null;
  context.autoSaveBlockExpiresAt = 0;
}

/** 为单个节点开启一个很短的选中保留窗口。 */
export function retainSelection(
  context: FabricEditorAdapterContext,
  nodeId: string,
): void {
  context.retainedSelectionNodeId = nodeId;
  context.retainedSelectionExpiresAt = Date.now() + SELECTION_RETENTION_WINDOW_MS;
}

/** 清空当前保留的选中节点。 */
export function clearRetainedSelection(context: FabricEditorAdapterContext): void {
  context.retainedSelectionNodeId = null;
  context.retainedSelectionExpiresAt = 0;
}

/** 清理尚未执行的延迟重选任务。 */
export function clearSelectionRestoreTimer(context: FabricEditorAdapterContext): void {
  if (!context.selectionRestoreTimer) {
    return;
  }

  clearTimeout(context.selectionRestoreTimer);
  context.selectionRestoreTimer = null;
}

/** 读取当前仍然有效的保留节点 id。 */
export function getRetainedSelectionNodeId(
  context: FabricEditorAdapterContext,
): string | null {
  if (!context.retainedSelectionNodeId || Date.now() > context.retainedSelectionExpiresAt) {
    clearRetainedSelection(context);
    return null;
  }

  return context.retainedSelectionNodeId;
}

/** 在对象变换落盘后，显式把单选态同步回标准控制器。 */
export function syncRetainedSelection(context: FabricEditorAdapterContext): void {
  if (!context.controller || !context.currentSlideId) {
    return;
  }

  const nodeId = getRetainedSelectionNodeId(context);
  if (!nodeId) {
    return;
  }

  context.controller.handleAdapterEvent({
    type: "adapter.selection.changed",
    slideId: context.currentSlideId,
    nodeIds: [nodeId],
  });
}

/** 在对象变换落盘后的下一拍重建 Fabric 和控制器两边的单选态。 */
export function scheduleSelectionRestore(
  context: FabricEditorAdapterContext,
  nodeId: string,
): void {
  if (!context.currentSlideId) {
    return;
  }

  const slideId = context.currentSlideId;
  clearSelectionRestoreTimer(context);
  context.selectionRestoreTimer = setTimeout(() => {
    context.selectionRestoreTimer = null;

    if (!context.canvas || !context.controller || context.currentSlideId !== slideId) {
      return;
    }

    const targetObject = context.objectMap.get(nodeId);
    if (!targetObject) {
      return;
    }

    /**
     * 这里不再直接调用 `canvas.setActiveObject(...)`。
     * 在 Fabric 刚完成对象变换或文本编辑退出的瞬间，控制点集合仍可能处于中间态；
     * 此时手动二次激活对象，部分场景会触发 Fabric 读取尚未稳定的控制点并报错。
     * 统一回到标准控制器，让订阅链在下一拍通过 `applySelectionToCanvas(...)` 恢复选中态，
     * 可以避开这一段脆弱窗口，同时保持 UI 与适配层的一致性。
     */
    context.controller.handleAdapterEvent({
      type: "adapter.selection.changed",
      slideId,
      nodeIds: [nodeId],
    });
  }, 0);
}

/** 处理多选整体变换结束后的文档回写，确保批量拖拽只生成一次历史记录。 */
function handleActiveSelectionModified(
  context: FabricEditorAdapterContext,
  event: ModifiedEvent,
  target: ActiveSelection,
): void {
  if (!context.controller || !context.currentSlideId) {
    return;
  }

  const action = readTransformAction(event);
  if (isSelectionTransformAction(action)) {
    return;
  }

  clearRetainedSelection(context);
  const translatedNodes = resolveActiveSelectionNodeTranslations(
    context.controller.getSnapshot(),
    context.currentSlideId,
    target,
  );
  if (translatedNodes.length === 0) {
    return;
  }

  context.controller.handleAdapterEvent({
    type: "adapter.nodes.translated",
    slideId: context.currentSlideId,
    updates: translatedNodes,
  });
}

/** 处理单个对象的拖拽、缩放和旋转落盘。 */
function handleSingleObjectModified(
  context: FabricEditorAdapterContext,
  event: ModifiedEvent,
  target: FabricNodeObject,
): void {
  if (!context.controller || !context.currentSlideId) {
    return;
  }

  const meta = readNodeMeta(target);
  if (!meta) {
    return;
  }

  const action = readTransformAction(event);
  const nextGeometry = readObjectGeometry(target);
  const previousNode = findNode(
    context.controller.getSnapshot(),
    context.currentSlideId,
    meta.nodeId,
  );
  const didResize =
    !previousNode ||
    previousNode.width !== nextGeometry.width ||
    previousNode.height !== nextGeometry.height;
  const didRotate = !previousNode || previousNode.rotation !== nextGeometry.rotation;
  const didTranslate =
    !previousNode ||
    previousNode.x !== nextGeometry.x ||
    previousNode.y !== nextGeometry.y;
  retainSelection(context, meta.nodeId);

  if (handleResizeModification(context, action, didResize, meta.nodeId, nextGeometry)) {
    return;
  }

  if (handleRotationModification(context, action, didRotate, meta.nodeId, nextGeometry.rotation)) {
    return;
  }

  if (didTranslate) {
    context.controller.handleAdapterEvent({
      type: "adapter.node.translated",
      slideId: context.currentSlideId,
      nodeId: meta.nodeId,
      x: nextGeometry.x,
      y: nextGeometry.y,
    });
  }

  syncRetainedSelection(context);
  scheduleSelectionRestore(context, meta.nodeId);
}

/** 在缩放命中路径不稳定时，仍然根据几何变化准确回写尺寸。 */
function handleResizeModification(
  context: FabricEditorAdapterContext,
  action: string,
  didResize: boolean,
  nodeId: string,
  nextGeometry: ReturnType<typeof readObjectGeometry>,
): boolean {
  if (!context.controller || !context.currentSlideId) {
    return false;
  }

  if (!didResize || !isResizeAction(action)) {
    return false;
  }

  context.controller.handleAdapterEvent({
    type: "adapter.node.resized",
    slideId: context.currentSlideId,
    nodeId,
    patch: nextGeometry,
  });
  syncRetainedSelection(context);
  scheduleSelectionRestore(context, nodeId);
  return true;
}

/** 单独收口旋转回写和后续选中态恢复，避免主流程继续膨胀。 */
function handleRotationModification(
  context: FabricEditorAdapterContext,
  action: string,
  didRotate: boolean,
  nodeId: string,
  rotation: number,
): boolean {
  if (!context.controller || !context.currentSlideId || !action.includes("rotate")) {
    return false;
  }

  if (didRotate) {
    context.controller.handleAdapterEvent({
      type: "adapter.node.rotated",
      slideId: context.currentSlideId,
      nodeId,
      rotation,
    });
  }

  syncRetainedSelection(context);
  scheduleSelectionRestore(context, nodeId);
  return true;
}

/** 读取右键请求真正对应的菜单上下文选中态。 */
function resolveContextMenuSelectionNodeIds(
  context: FabricEditorAdapterContext,
  target: FabricNodeObject | ActiveSelection | undefined,
): string[] {
  if (!context.canvas) {
    return [];
  }

  const currentSelectionNodeIds = resolveCanvasSelectionNodeIds(context.canvas, null);
  if (target instanceof ActiveSelection) {
    return currentSelectionNodeIds;
  }

  const meta = target ? readNodeMeta(target) : null;
  if (!meta) {
    return [];
  }

  if (currentSelectionNodeIds.length > 1 && currentSelectionNodeIds.includes(meta.nodeId)) {
    return currentSelectionNodeIds;
  }

  return [meta.nodeId];
}

/** 把右键菜单对应的选中态同步回控制器，并维护单选保留窗口。 */
function syncContextMenuSelection(
  context: FabricEditorAdapterContext,
  selectionNodeIds: string[],
): void {
  if (!context.controller || !context.currentSlideId) {
    return;
  }

  context.controller.handleAdapterEvent({
    type: "adapter.selection.changed",
    slideId: context.currentSlideId,
    nodeIds: selectionNodeIds,
  });

  if (selectionNodeIds.length === 1) {
    retainSelection(context, selectionNodeIds[0]);
    return;
  }

  clearRetainedSelection(context);
}

/** 统一读取 Fabric 当前变换动作名。 */
function readTransformAction(event: ModifiedEvent): string {
  return (event.action ?? event.transform?.action ?? "").toLowerCase();
}

/** 判断多选整体变换是否属于不应回写平移结果的缩放/旋转类动作。 */
function isSelectionTransformAction(action: string): boolean {
  return (
    action.includes("scale") ||
    action.includes("resiz") ||
    action.includes("skew") ||
    action.includes("rotate")
  );
}

/** 缩放动作的命中标识并不稳定，这里统一收口判断逻辑。 */
function isResizeAction(action: string): boolean {
  return (
    action.includes("scale") ||
    action.includes("resiz") ||
    action.includes("skew") ||
    !action
  );
}
