import type { Canvas } from "fabric";
import type { EditorSnapshot, Slide } from "@canvas-courseware/core";
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

  const didSyncInlineTextEditing =
    context.lastDocumentRef !== snapshot.document &&
    context.lastRenderedSlideId === slide.id &&
    context.objectMap.size === slide.nodes.length &&
    syncInlineTextEditingFromSnapshot(context, slide);

  if (didSyncInlineTextEditing) {
    context.lastDocumentRef = snapshot.document;
    return;
  }

  if (shouldRenderSlide(context, snapshot, slide)) {
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
