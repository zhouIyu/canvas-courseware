import type { Canvas } from "fabric";
import {
  DEFAULT_TEXT_FONT_FAMILY,
  type CoursewareNode,
  type Slide,
  type TextNode,
} from "@canvas-courseware/core";
import {
  readNodeMeta,
  resolveTextNodeChange,
  type FabricNodeObject,
} from "../editor-adapter-support";
import type { FabricInlineTextEditingLayout } from "../editor-adapter-types";
import type { FabricEditorAdapterContext } from "./context";
import { retainSelection, scheduleSelectionRestore } from "./selection";

/** 编辑态文本对象需要额外使用的 Fabric 能力。 */
type EditableFabricTextObject = FabricNodeObject & {
  /** 当前对象是否允许进入文本编辑。 */
  editable: boolean;
  /** 当前是否处于文本编辑中。 */
  isEditing?: boolean;
  /** 当前对象是否需要在下一帧重新绘制。 */
  dirty?: boolean;
  /** 进入 Fabric 文本编辑态。 */
  enterEditing?: (event?: Event) => void;
  /** 退出 Fabric 文本编辑态。 */
  exitEditing?: () => void;
  /** Fabric 用于接收真实输入的隐藏 textarea。 */
  hiddenTextarea?: HTMLTextAreaElement | null;
};

/** 当用户点击非画布区域时，主动结束当前文本对象的内联编辑态。 */
export function exitActiveTextEditing(context: FabricEditorAdapterContext): void {
  const activeObject = getActiveEditingTextObject(context);
  if (!activeObject?.isEditing || typeof activeObject.exitEditing !== "function") {
    return;
  }

  activeObject.exitEditing();
}

/** 读取当前内联文本编辑态的浮层定位信息。 */
export function getInlineTextEditingLayout(
  context: FabricEditorAdapterContext,
): FabricInlineTextEditingLayout | null {
  const canvas = context.canvas;
  const activeObject = getActiveEditingTextObject(context);
  const meta = activeObject ? readNodeMeta(activeObject) : null;
  const canvasElement = readCanvasDomElement(context);
  const bounds = activeObject?.getBoundingRect?.();

  if (!canvas || !activeObject || !meta || !canvasElement || !bounds) {
    return null;
  }

  const canvasRect = canvasElement.getBoundingClientRect();
  const canvasWidth = Math.max(canvas.getWidth(), 1);
  const canvasHeight = Math.max(canvas.getHeight(), 1);
  const scaleX = canvasRect.width / canvasWidth;
  const scaleY = canvasRect.height / canvasHeight;

  return {
    slideId: meta.slideId,
    nodeId: meta.nodeId,
    clientRect: {
      left: canvasRect.left + bounds.left * scaleX,
      top: canvasRect.top + bounds.top * scaleY,
      width: bounds.width * scaleX,
      height: bounds.height * scaleY,
    },
  };
}

/**
 * 当文本仍处于 Fabric 内联编辑态时，优先只把样式类字段增量同步回活动对象。
 * 这样可以避免字号/颜色等高频样式调整触发整页重渲染，从而打断用户正在输入的文本。
 */
export function syncInlineTextEditingFromSnapshot(
  context: FabricEditorAdapterContext,
  slide: Slide,
): boolean {
  const canvas = context.canvas;
  const activeObject = getActiveEditingTextObject(context);
  const meta = activeObject ? readNodeMeta(activeObject) : null;
  const previousSlide =
    context.lastDocumentRef?.slides.find((candidate) => candidate.id === slide.id) ?? null;

  if (
    !canvas ||
    !activeObject ||
    !meta ||
    meta.nodeType !== "text" ||
    meta.slideId !== slide.id ||
    !previousSlide
  ) {
    return false;
  }

  const nextNode = resolveInlineTextStyleSyncNode(previousSlide, slide, meta.nodeId);
  if (!nextNode) {
    return false;
  }

  applyInlineTextStyleToEditingTarget(activeObject, nextNode);
  canvas.renderAll();
  activeObject.hiddenTextarea?.focus();
  return true;
}

/** 在文本输入过程中保留“退出编辑后一次提交”的策略。 */
export function handleEditorTextChanged(
  context: FabricEditorAdapterContext,
  target: FabricNodeObject | undefined,
): void {
  if (context.isSyncing || !target) {
    return;
  }

  const editableTarget = target as EditableFabricTextObject;
  if (editableTarget.isEditing) {
    return;
  }
}

/** 双击文本对象后，直接进入 Fabric 自带的文本编辑态。 */
export function handleEditorTextDoubleClick(
  context: FabricEditorAdapterContext,
  target: FabricNodeObject | undefined,
  nativeEvent?: Event,
): void {
  if (
    context.isSyncing ||
    !context.canvas ||
    !context.controller ||
    !context.currentSlideId ||
    !target
  ) {
    return;
  }

  const meta = readNodeMeta(target);
  if (!meta || meta.nodeType !== "text") {
    return;
  }

  const editableTarget = target as EditableFabricTextObject;
  if (editableTarget.isEditing || typeof editableTarget.enterEditing !== "function") {
    return;
  }

  retainSelection(context, meta.nodeId);
  context.controller.handleAdapterEvent({
    type: "adapter.selection.changed",
    slideId: context.currentSlideId,
    nodeIds: [meta.nodeId],
  });

  context.isSyncing = true;
  try {
    context.canvas.setActiveObject(target);
    context.canvas.renderAll();
  } finally {
    context.isSyncing = false;
  }

  editableTarget.editable = true;
  queueMicrotask(() => {
    if (!context.canvas || context.currentSlideId !== meta.slideId || editableTarget.isEditing) {
      return;
    }

    editableTarget.enterEditing?.(nativeEvent);
    editableTarget.hiddenTextarea?.focus();
  });
}

/** 标记当前文本对象已经进入编辑态。 */
export function handleEditorTextEditingEntered(
  context: FabricEditorAdapterContext,
  target: FabricNodeObject | undefined,
): void {
  const editableTarget = target as EditableFabricTextObject | undefined;
  if (!editableTarget) {
    return;
  }

  editableTarget.editable = true;
  const meta = readNodeMeta(target);
  if (!context.controller || !meta) {
    return;
  }

  context.controller.handleAdapterEvent({
    type: "adapter.text.editing.entered",
    slideId: meta.slideId,
    nodeId: meta.nodeId,
  });
}

/** 文本编辑完成后，统一回写最终内容并恢复到普通选中态。 */
export function handleEditorTextEditingExited(
  context: FabricEditorAdapterContext,
  target: FabricNodeObject | undefined,
): void {
  if (!target) {
    return;
  }

  const editableTarget = target as EditableFabricTextObject;
  editableTarget.editable = false;

  const meta = readNodeMeta(target);
  const slideId = meta?.slideId ?? context.currentSlideId;
  if (context.controller && meta) {
    context.controller.handleAdapterEvent({
      type: "adapter.text.editing.exited",
      slideId: meta.slideId,
      nodeId: meta.nodeId,
    });
  }

  if (!context.controller || !slideId) {
    return;
  }

  /**
   * 文本编辑退出时，Fabric 可能会先抛出一次选中态变化，
   * 进而触发控制器把当前快照同步回画布。
   * 这里如果继续用 `isSyncing` 拦截，就会把真正的最终文本提交漏掉。
   */
  const textChange = resolveTextNodeChange(context.controller.getSnapshot(), slideId, target);
  if (!textChange) {
    return;
  }

  retainSelection(context, textChange.nodeId);
  queueMicrotask(() => {
    if (!context.controller) {
      return;
    }

    context.controller.handleAdapterEvent({
      type: "adapter.text.changed",
      slideId,
      nodeId: textChange.nodeId,
      text: textChange.text,
    });
    scheduleSelectionRestore(context, textChange.nodeId);
  });
}

/** 读取当前 Fabric 画布中仍处于编辑态的文本对象。 */
function getActiveEditingTextObject(
  context: FabricEditorAdapterContext,
): EditableFabricTextObject | null {
  const activeObject = context.canvas?.getActiveObject() as
    | EditableFabricTextObject
    | undefined;
  return activeObject?.isEditing ? activeObject : null;
}

/** 读取当前可用于定位浮层的真实 canvas DOM。 */
function readCanvasDomElement(context: FabricEditorAdapterContext): HTMLCanvasElement | null {
  const runtimeCanvas = context.canvas as
    | (Canvas & {
        upperCanvasEl?: HTMLCanvasElement | null;
        lowerCanvasEl?: HTMLCanvasElement | null;
      })
    | null;

  return runtimeCanvas?.upperCanvasEl ?? runtimeCanvas?.lowerCanvasEl ?? null;
}

/** 把文档中的文本样式字段增量写回当前正在编辑的 Fabric 文本对象。 */
function applyInlineTextStyleToEditingTarget(
  target: EditableFabricTextObject,
  node: TextNode,
): void {
  target.set?.({
    fill: node.props.color,
    fontSize: node.props.fontSize,
    fontFamily: node.props.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: node.props.fontWeight ?? 400,
    fontStyle: node.props.fontStyle ?? "normal",
    lineHeight: node.props.lineHeight ?? 1.5,
    textAlign: node.props.textAlign ?? "left",
  });
  target.dirty = true;
  target.setCoords?.();
}

/**
 * 判断本次快照变化是否只涉及当前编辑中文本节点的样式字段。
 * 只要出现结构变化、非目标节点改动、背景变化或文本内容变化，就回退到完整重渲染路径。
 */
function resolveInlineTextStyleSyncNode(
  previousSlide: Slide,
  nextSlide: Slide,
  editingNodeId: string,
): TextNode | null {
  if (
    previousSlide.background !== nextSlide.background ||
    previousSlide.nodes.length !== nextSlide.nodes.length
  ) {
    return null;
  }

  for (let index = 0; index < nextSlide.nodes.length; index += 1) {
    const previousNode = previousSlide.nodes[index];
    const nextNode = nextSlide.nodes[index];
    if (previousNode.id !== nextNode.id) {
      return null;
    }

    if (nextNode.id !== editingNodeId) {
      if (previousNode !== nextNode) {
        return null;
      }
      continue;
    }

    if (previousNode === nextNode) {
      return null;
    }

    return isInlineTextStyleOnlyChanged(previousNode, nextNode) ? nextNode : null;
  }

  return null;
}

/** 限定内联同步只放行字号、颜色、字重、斜体等样式类字段。 */
function isInlineTextStyleOnlyChanged(
  previousNode: CoursewareNode,
  nextNode: CoursewareNode,
): nextNode is TextNode {
  return (
    previousNode.type === "text" &&
    nextNode.type === "text" &&
    previousNode.name === nextNode.name &&
    previousNode.x === nextNode.x &&
    previousNode.y === nextNode.y &&
    previousNode.width === nextNode.width &&
    previousNode.height === nextNode.height &&
    previousNode.rotation === nextNode.rotation &&
    previousNode.opacity === nextNode.opacity &&
    previousNode.visible === nextNode.visible &&
    previousNode.locked === nextNode.locked &&
    previousNode.props.text === nextNode.props.text
  );
}
