import type { Canvas } from "fabric";
import type { CoursewareNode, EditorSnapshot, Slide } from "@canvas-courseware/core";
import { DEFAULT_TEXT_FONT_FAMILY } from "@canvas-courseware/core";
import {
  applyCanvasBackgroundImage,
  applySelectionToCanvas,
  createEditorNodeObject,
  loadCanvasBackgroundImage,
  renderEmptyCanvas,
  resetCanvasBackground,
  resolveSlide,
  syncCanvasFrame,
  type FabricNodeObject,
} from "../editor-adapter-support";
import { FabricFrameImage } from "../frame-image-object";
import { FabricShapeRect } from "../shape-rect-object";
import type { FabricEditorAdapterContext } from "./context";
import { clearSelectionRestoreTimer } from "./selection";
import { clearEditorAlignmentGuides } from "./alignment";
import { syncInlineTextEditingFromSnapshot } from "./text-editing";

/** 释放当前编辑画布并重置所有与渲染生命周期有关的状态。 */
export async function disposeEditorCanvas(
  context: FabricEditorAdapterContext,
): Promise<void> {
  context.syncVersion += 1;
  context.objectMap.clear();
  context.lastDocumentRef = null;
  context.lastRenderedSlideId = null;
  clearSelectionRestoreTimer(context);
  clearEditorAlignmentGuides(context, {
    skipRender: true,
  });

  if (!context.canvas) {
    return;
  }

  const currentCanvas = context.canvas;
  context.canvas = null;
  await currentCanvas.dispose();
}

/** 把控制器快照同步到当前 Fabric 编辑画布。 */
export async function syncEditorSnapshot(
  context: FabricEditorAdapterContext,
  snapshot: EditorSnapshot,
): Promise<void> {
  const canvas = context.canvas;
  if (!canvas) {
    return;
  }

  const slide = resolveSlide(snapshot, context.currentSlideId);
  if (!slide) {
    syncEmptyEditorSnapshot(context, canvas, snapshot);
    return;
  }

  context.currentSlideId = slide.id;
  const previousSlide =
    context.lastDocumentRef?.slides.find((candidate) => candidate.id === slide.id) ?? null;

  const didSyncInlineTextEditing =
    context.lastDocumentRef !== snapshot.document &&
    context.lastRenderedSlideId === slide.id &&
    context.objectMap.size === slide.nodes.length &&
    syncInlineTextEditingFromSnapshot(context, slide);

  if (didSyncInlineTextEditing) {
    context.lastDocumentRef = snapshot.document;
    return;
  }

  const didSyncExistingObjects =
    context.lastDocumentRef !== snapshot.document &&
    context.lastRenderedSlideId === slide.id &&
    previousSlide !== null &&
    syncExistingEditorObjectsFromSlide(context, canvas, previousSlide, slide);

  if (didSyncExistingObjects) {
    context.lastDocumentRef = snapshot.document;
  } else if (shouldRenderSlide(context, snapshot, slide)) {
    await renderEditorSlide(context, canvas, slide);
    context.lastDocumentRef = snapshot.document;
  } else if (shouldSyncCanvasFrame(canvas, slide)) {
    /**
     * 纯选中态变化也会走到 `syncEditorSnapshot`。
     * 如果这里每次都重新 `setDimensions`，在部分浏览器与显示缩放环境下，
     * 点击对象会触发整个 Fabric 画布的瞬时重排，表现成“画布整体收缩 / 抖动”。
     * 因此这里只在画布逻辑尺寸或背景色真的漂移时才补做 frame 同步。
     */
    syncCanvasFrame(canvas, slide);
  }

  context.isSyncing = true;
  try {
    applySelectionToCanvas(canvas, snapshot.selection, slide.id, context.objectMap);
  } finally {
    context.isSyncing = false;
  }
}

/** 当页面结构稳定且仅发生节点属性变化时，尽量原地同步 Fabric 对象，避免整页重建闪动。 */
function syncExistingEditorObjectsFromSlide(
  context: FabricEditorAdapterContext,
  canvas: Canvas,
  previousSlide: Slide,
  nextSlide: Slide,
): boolean {
  if (!canSyncExistingEditorObjects(context, previousSlide, nextSlide)) {
    return false;
  }

  for (const nextNode of nextSlide.nodes) {
    const targetObject = context.objectMap.get(nextNode.id);
    if (!targetObject) {
      return false;
    }

    syncEditorObjectFromNode(targetObject, nextNode);
  }

  canvas.renderAll();
  return true;
}

/** 判断当前两版 slide 是否仍可复用现有 Fabric 对象原地同步。 */
function canSyncExistingEditorObjects(
  context: FabricEditorAdapterContext,
  previousSlide: Slide,
  nextSlide: Slide,
): boolean {
  if (
    previousSlide.size !== nextSlide.size ||
    previousSlide.background !== nextSlide.background ||
    previousSlide.nodes.length !== nextSlide.nodes.length ||
    context.objectMap.size !== nextSlide.nodes.length
  ) {
    return false;
  }

  return nextSlide.nodes.every((nextNode, index) => {
    const previousNode = previousSlide.nodes[index];
    return canSyncExistingEditorNode(previousNode, nextNode);
  });
}

/** 只有节点身份、类型和图片资源入口稳定时，才允许复用现有 Fabric 对象。 */
function canSyncExistingEditorNode(
  previousNode: CoursewareNode,
  nextNode: CoursewareNode,
): boolean {
  if (previousNode.id !== nextNode.id || previousNode.type !== nextNode.type) {
    return false;
  }

  if (previousNode.type === "rect" && nextNode.type === "rect") {
    return canSyncExistingRectNode(previousNode, nextNode);
  }

  return (
    previousNode.type !== "image" ||
    (nextNode.type === "image" && previousNode.props.src === nextNode.props.src)
  );
}

/** 复杂矩形样式允许直接触发整页重渲染，避免 path/包围盒同步不完整。 */
function canSyncExistingRectNode(
  previousNode: Extract<CoursewareNode, { type: "rect" }>,
  nextNode: Extract<CoursewareNode, { type: "rect" }>,
): boolean {
  const previousHasComplexCorners = Boolean(previousNode.props.cornerRadii);
  const nextHasComplexCorners = Boolean(nextNode.props.cornerRadii);
  const previousHasGradient = previousNode.props.fillType === "linear-gradient";
  const nextHasGradient = nextNode.props.fillType === "linear-gradient";

  return (
    !previousHasComplexCorners &&
    !nextHasComplexCorners &&
    !previousHasGradient &&
    !nextHasGradient
  );
}

/** 把标准节点数据原地写回现有 Fabric 对象，避免几何类改动触发整页重建。 */
function syncEditorObjectFromNode(
  targetObject: FabricNodeObject,
  node: CoursewareNode,
): void {
  applyCommonNodeObjectFields(targetObject, node);

  switch (node.type) {
    case "text":
      applyTextNodeObjectFields(targetObject, node);
      break;
    case "rect":
      applyRectNodeObjectFields(targetObject, node);
      break;
    case "image":
      applyImageNodeObjectFields(targetObject, node);
      break;
    default:
      break;
  }

  targetObject.setCoords?.();
}

/** 统一同步所有节点共享的几何、显隐和交互字段。 */
function applyCommonNodeObjectFields(
  targetObject: FabricNodeObject,
  node: CoursewareNode,
): void {
  targetObject.set?.({
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    angle: node.rotation,
    opacity: node.opacity,
    /**
     * 编辑态继续保持“默认全显”策略。
     * 即使文档里的节点用于预览态仍是 `visible=false`，
     * 原地同步几何时也不能把编辑画布里的对象重新隐藏回去。
     */
    visible: true,
    selectable: !node.locked,
    evented: !node.locked,
    hasControls: !node.locked,
    lockMovementX: node.locked,
    lockMovementY: node.locked,
    lockUniScaling: node.lockAspectRatio,
    scaleX: 1,
    scaleY: 1,
  });
}

/** 把文本节点的样式与内容同步回现有 Textbox。 */
function applyTextNodeObjectFields(
  targetObject: FabricNodeObject,
  node: Extract<CoursewareNode, { type: "text" }>,
): void {
  targetObject.set?.({
    text: node.props.text,
    fill: node.props.color,
    fontSize: node.props.fontSize,
    fontFamily: node.props.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: node.props.fontWeight,
    fontStyle: node.props.fontStyle ?? "normal",
    lineHeight: node.props.lineHeight ?? 1.5,
    textAlign: node.props.textAlign ?? "left",
  });
}

/** 把矩形节点的填充、描边和圆角同步回现有矩形对象。 */
function applyRectNodeObjectFields(
  targetObject: FabricNodeObject,
  node: Extract<CoursewareNode, { type: "rect" }>,
): void {
  if (targetObject instanceof FabricShapeRect) {
    targetObject.syncRectLayout({
      width: node.width,
      height: node.height,
      rectProps: node.props,
    });
    return;
  }

  targetObject.set?.({
    fill: node.props.fill,
    stroke: node.props.stroke,
    strokeWidth: node.props.strokeWidth,
    rx: node.props.radius,
    ry: node.props.radius,
  });
}

/** 把图片节点的 frame、翻转和裁剪参数同步回现有图片对象或占位对象。 */
function applyImageNodeObjectFields(
  targetObject: FabricNodeObject,
  node: Extract<CoursewareNode, { type: "image" }>,
): void {
  targetObject.set?.({
    flipX: node.props.flipX ?? false,
    flipY: node.props.flipY ?? false,
  });

  if (targetObject instanceof FabricFrameImage) {
    targetObject.syncFrameLayout({
      frameWidth: node.width,
      frameHeight: node.height,
      objectFit: node.props.objectFit ?? "cover",
      crop: node.props.crop ?? null,
    });
  }
}

/** 重建当前页面的 Fabric 对象树与背景。 */
async function renderEditorSlide(
  context: FabricEditorAdapterContext,
  canvas: Canvas,
  slide: Slide,
): Promise<void> {
  const syncVersion = ++context.syncVersion;
  context.isSyncing = true;

  try {
    clearEditorAlignmentGuides(context, {
      skipRender: true,
    });
    context.objectMap.clear();
    canvas.clear();
    syncCanvasFrame(canvas, slide);
    resetCanvasBackground(canvas);

    const backgroundImage = await loadCanvasBackgroundImage(slide);
    if (syncVersion !== context.syncVersion || !context.canvas) {
      return;
    }

    applyCanvasBackgroundImage(canvas, backgroundImage);
    const objects = await buildEditorObjects(context, slide, syncVersion);
    if (syncVersion !== context.syncVersion || !context.canvas) {
      return;
    }

    if (objects.length > 0) {
      canvas.add(...objects);
    }

    context.lastRenderedSlideId = slide.id;
    canvas.renderAll();
  } finally {
    context.isSyncing = false;
  }
}

/** 在没有可渲染页面时，把画布恢复到空白状态。 */
function syncEmptyEditorSnapshot(
  context: FabricEditorAdapterContext,
  canvas: Canvas,
  snapshot: EditorSnapshot,
): void {
  context.currentSlideId = context.currentSlideId ?? snapshot.activeSlideId;
  context.lastDocumentRef = snapshot.document;
  context.lastRenderedSlideId = null;
  context.isSyncing = true;
  try {
    clearEditorAlignmentGuides(context, {
      skipRender: true,
    });
    renderEmptyCanvas(canvas, context.objectMap);
  } finally {
    context.isSyncing = false;
  }
}

/** 判断本次快照变化是否需要整页重渲染。 */
function shouldRenderSlide(
  context: FabricEditorAdapterContext,
  snapshot: EditorSnapshot,
  slide: Slide,
): boolean {
  return (
    context.lastDocumentRef !== snapshot.document ||
    context.lastRenderedSlideId !== slide.id ||
    context.objectMap.size !== slide.nodes.length
  );
}

/** 仅当 Fabric 画布逻辑尺寸或背景色与当前 slide 不一致时，才需要重同步 frame。 */
function shouldSyncCanvasFrame(canvas: Canvas, slide: Slide): boolean {
  const hasSizeDrift =
    canvas.getWidth() !== slide.size.width || canvas.getHeight() !== slide.size.height;
  const hasBackgroundDrift =
    typeof canvas.backgroundColor === "string"
      ? canvas.backgroundColor !== slide.background.fill
      : true;

  return hasSizeDrift || hasBackgroundDrift;
}

/** 顺序构建当前页面的全部编辑态对象，并同步维护 `objectMap`。 */
async function buildEditorObjects(
  context: FabricEditorAdapterContext,
  slide: Slide,
  syncVersion: number,
): Promise<FabricNodeObject[]> {
  const objects: FabricNodeObject[] = [];

  for (const node of slide.nodes) {
    const object = await createEditorNodeObject(node, slide.id);
    if (syncVersion !== context.syncVersion || !context.canvas) {
      return objects;
    }

    if (object) {
      objects.push(object);
      context.objectMap.set(node.id, object);
    }
  }

  return objects;
}
