import type { FabricObject } from "fabric";
import type { CoursewareNode, Slide, TimelineStep } from "@canvas-courseware/core";
import {
  applyCanvasBackgroundImage,
  loadCanvasBackgroundImage,
  resetCanvasBackground,
  syncCanvasFrame,
} from "../background";
import { createFabricNodeObject } from "../object-factory";
import type { FabricPlayerAdapterContext, FabricPlaybackObject } from "./context";

/** 释放当前预览画布并重置所有与渲染生命周期有关的状态。 */
export async function disposePlayerCanvas(
  context: FabricPlayerAdapterContext,
): Promise<void> {
  context.syncVersion += 1;
  context.objectMap.clear();

  if (!context.canvas) {
    return;
  }

  const canvas = context.canvas;
  context.canvas = null;
  await canvas.dispose();
}

/** 重建当前页面的 Fabric 播放对象树与背景。 */
export async function renderPlayerSlide(
  context: FabricPlayerAdapterContext,
  slide: Slide,
  version: number,
): Promise<void> {
  if (!context.canvas) {
    return;
  }

  context.objectMap.clear();
  context.canvas.clear();
  syncCanvasFrame(context.canvas, slide);
  resetCanvasBackground(context.canvas);

  const backgroundImage = await loadCanvasBackgroundImage(slide);
  if (version !== context.syncVersion || !context.canvas) {
    return;
  }

  applyCanvasBackgroundImage(context.canvas, backgroundImage);
  const objects = await buildPlaybackObjects(context, slide, version);
  if (version !== context.syncVersion || !context.canvas) {
    return;
  }

  if (objects.length > 0) {
    context.canvas.add(...objects);
  }

  context.canvas.requestRenderAll();
}

/**
 * 根据当前等待中的 trigger 更新画布与对象的点击提示。
 * page-click 会让画布整体可点击，node-click 则只激活目标对象。
 */
export function syncTriggerAffordance(
  context: FabricPlayerAdapterContext,
  nextStep: TimelineStep | null,
): void {
  if (!context.canvas) {
    return;
  }

  const shouldFindTarget = nextStep?.trigger.type === "node-click";
  context.canvas.skipTargetFind = !shouldFindTarget;
  context.canvas.defaultCursor =
    nextStep?.trigger.type === "page-click" ? "pointer" : "default";
  context.canvas.hoverCursor = context.canvas.defaultCursor;

  for (const [nodeId, object] of context.objectMap.entries()) {
    const isNodeClickTarget =
      nextStep?.trigger.type === "node-click" && nextStep.trigger.targetId === nodeId;

    object.evented = isNodeClickTarget;
    object.hoverCursor = isNodeClickTarget ? "pointer" : "default";
    object.moveCursor = object.hoverCursor;
  }

  context.canvas.requestRenderAll();
}

/** 从 Fabric 点击目标里反查当前节点 id。 */
export function resolveNodeIdForTarget(
  context: FabricPlayerAdapterContext,
  target: FabricObject | null,
): string | null {
  if (!target) {
    return null;
  }

  return context.objectNodeMap.get(target) ?? null;
}

/** 顺序构建当前页面的全部播放态对象，并同步维护映射关系。 */
async function buildPlaybackObjects(
  context: FabricPlayerAdapterContext,
  slide: Slide,
  version: number,
): Promise<FabricPlaybackObject[]> {
  const objects: FabricPlaybackObject[] = [];

  for (const node of slide.nodes) {
    const object = await createPlaybackObject(node);
    if (version !== context.syncVersion || !context.canvas) {
      return objects;
    }

    objects.push(object);
    context.objectMap.set(node.id, object);
    context.objectNodeMap.set(object, node.id);
  }

  return objects;
}

/** 为单个节点创建播放态 Fabric 对象。 */
async function createPlaybackObject(node: CoursewareNode): Promise<FabricPlaybackObject> {
  switch (node.type) {
    case "text":
    case "rect":
    case "image":
      return (await createFabricNodeObject(node, {
        interactive: false,
      })) as FabricPlaybackObject;
    default:
      throw new Error("Unsupported node type");
  }
}
