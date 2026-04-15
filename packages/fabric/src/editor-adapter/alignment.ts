import { ActiveSelection, Line } from "fabric";
import {
  readNodeMeta,
  type FabricNodeObject,
} from "../editor-adapter-support";
import type {
  FabricAlignmentGuideLine,
  FabricAlignmentGuideOrientation,
  FabricEditorAdapterContext,
} from "./context";

/** 拖拽吸附命中的最大距离阈值。 */
const SNAP_THRESHOLD_PX = 6;

/** 对齐参考线统一颜色，和工作台主色保持一致。 */
const GUIDE_STROKE_COLOR = "#0D9488";

/** 对齐参考线统一线宽。 */
const GUIDE_STROKE_WIDTH = 1;

/** 对齐参考线统一虚线节奏。 */
const GUIDE_STROKE_DASH_ARRAY: number[] = [6, 4];

/** 对齐参考线透明度，避免压过画布主体内容。 */
const GUIDE_STROKE_OPACITY = 0.9;

/** 单个对象在画布坐标中的包围盒。 */
interface EditorObjectBounds {
  /** 左边界。 */
  left: number;
  /** 顶边界。 */
  top: number;
  /** 右边界。 */
  right: number;
  /** 底边界。 */
  bottom: number;
  /** 水平中心。 */
  centerX: number;
  /** 垂直中心。 */
  centerY: number;
}

/** 单轴吸附命中结果。 */
interface AxisSnapMatch {
  /** 最终吸附到的参考线坐标。 */
  line: number;
  /** 需要对目标对象补偿的位移。 */
  offset: number;
  /** 当前命中的距离，用于比较优先级。 */
  distance: number;
}

/** 在对象拖拽过程中执行吸附计算，并同步渲染对齐参考线。 */
export function handleEditorObjectMoving(
  context: FabricEditorAdapterContext,
  target: FabricNodeObject | ActiveSelection | undefined,
): void {
  if (context.isSyncing || !context.canvas || !context.currentSlideId || !target) {
    clearEditorAlignmentGuides(context);
    return;
  }

  const movingBounds = resolveObjectBounds(target);
  if (!movingBounds) {
    clearEditorAlignmentGuides(context);
    return;
  }

  const movingNodeIds = resolveMovingNodeIds(target);
  const referenceBounds = resolveReferenceBounds(
    context,
    context.currentSlideId,
    movingNodeIds,
  );
  const verticalMatch = resolveBestVerticalSnapMatch(
    movingBounds,
    context.canvas.getWidth(),
    referenceBounds,
  );
  const horizontalMatch = resolveBestHorizontalSnapMatch(
    movingBounds,
    context.canvas.getHeight(),
    referenceBounds,
  );

  applySnapMatch(target, verticalMatch, horizontalMatch);
  syncAlignmentGuides(context, verticalMatch?.line ?? null, horizontalMatch?.line ?? null);
}

/** 清理当前画布上的对齐参考线。 */
export function clearEditorAlignmentGuides(
  context: FabricEditorAdapterContext,
  options: {
    /** 传入 true 时仅清理对象，不主动触发额外重绘。 */
    skipRender?: boolean;
  } = {},
): void {
  if (!context.canvas) {
    context.alignmentVerticalGuide = null;
    context.alignmentHorizontalGuide = null;
    return;
  }

  const didClearVertical = clearGuideByOrientation(context, "vertical");
  const didClearHorizontal = clearGuideByOrientation(context, "horizontal");
  if (!options.skipRender && (didClearVertical || didClearHorizontal)) {
    context.canvas.requestRenderAll();
  }
}

/** 读取目标对象在当前画布坐标系中的包围盒。 */
function resolveObjectBounds(
  target: FabricNodeObject | ActiveSelection,
): EditorObjectBounds | null {
  const bounds = target.getBoundingRect?.();
  if (!bounds) {
    return null;
  }

  const left = bounds.left;
  const top = bounds.top;
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;

  return {
    left,
    top,
    right,
    bottom,
    centerX: left + bounds.width / 2,
    centerY: top + bounds.height / 2,
  };
}

/** 解析当前拖拽目标对应的节点 id 集合。 */
function resolveMovingNodeIds(target: FabricNodeObject | ActiveSelection): string[] {
  if (target instanceof ActiveSelection) {
    return target
      .getObjects()
      .map((object) => readNodeMeta(object as FabricNodeObject)?.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId));
  }

  const meta = readNodeMeta(target);
  return meta ? [meta.nodeId] : [];
}

/** 读取当前 slide 内可作为吸附参考的对象包围盒。 */
function resolveReferenceBounds(
  context: FabricEditorAdapterContext,
  slideId: string,
  movingNodeIds: string[],
): EditorObjectBounds[] {
  const excludedNodeIds = new Set(movingNodeIds);

  return Array.from(context.objectMap.entries())
    .filter(([nodeId]) => !excludedNodeIds.has(nodeId))
    .map(([, object]) => {
      const meta = readNodeMeta(object);
      if (!meta || meta.slideId !== slideId) {
        return null;
      }

      return resolveObjectBounds(object);
    })
    .filter((bounds): bounds is EditorObjectBounds => Boolean(bounds));
}

/** 在 X 轴上解析最佳吸附命中。 */
function resolveBestVerticalSnapMatch(
  movingBounds: EditorObjectBounds,
  canvasWidth: number,
  referenceBounds: EditorObjectBounds[],
): AxisSnapMatch | null {
  const movingAxisPoints = [movingBounds.left, movingBounds.centerX, movingBounds.right];
  const referenceLines = [
    0,
    canvasWidth / 2,
    canvasWidth,
    ...referenceBounds.flatMap((bounds) => [bounds.left, bounds.centerX, bounds.right]),
  ];

  return resolveAxisSnapMatch(movingAxisPoints, referenceLines);
}

/** 在 Y 轴上解析最佳吸附命中。 */
function resolveBestHorizontalSnapMatch(
  movingBounds: EditorObjectBounds,
  canvasHeight: number,
  referenceBounds: EditorObjectBounds[],
): AxisSnapMatch | null {
  const movingAxisPoints = [movingBounds.top, movingBounds.centerY, movingBounds.bottom];
  const referenceLines = [
    0,
    canvasHeight / 2,
    canvasHeight,
    ...referenceBounds.flatMap((bounds) => [bounds.top, bounds.centerY, bounds.bottom]),
  ];

  return resolveAxisSnapMatch(movingAxisPoints, referenceLines);
}

/** 在单个坐标轴上选出距离最短且不超过阈值的吸附命中。 */
function resolveAxisSnapMatch(
  movingAxisPoints: number[],
  referenceLines: number[],
): AxisSnapMatch | null {
  let bestMatch: AxisSnapMatch | null = null;

  for (const movingPoint of movingAxisPoints) {
    for (const referenceLine of referenceLines) {
      const distance = Math.abs(referenceLine - movingPoint);
      if (distance > SNAP_THRESHOLD_PX) {
        continue;
      }

      const currentMatch: AxisSnapMatch = {
        line: referenceLine,
        offset: referenceLine - movingPoint,
        distance,
      };

      if (isBetterSnapMatch(currentMatch, bestMatch)) {
        bestMatch = currentMatch;
      }
    }
  }

  return bestMatch;
}

/** 把吸附位移应用到当前拖拽目标对象。 */
function applySnapMatch(
  target: FabricNodeObject | ActiveSelection,
  verticalMatch: AxisSnapMatch | null,
  horizontalMatch: AxisSnapMatch | null,
): void {
  if (!verticalMatch && !horizontalMatch) {
    return;
  }

  if (verticalMatch) {
    target.left = round((target.left ?? 0) + verticalMatch.offset);
  }

  if (horizontalMatch) {
    target.top = round((target.top ?? 0) + horizontalMatch.offset);
  }

  target.setCoords?.();
}

/** 同步当前应显示的横向 / 纵向参考线。 */
function syncAlignmentGuides(
  context: FabricEditorAdapterContext,
  verticalLineX: number | null,
  horizontalLineY: number | null,
): void {
  if (!context.canvas) {
    return;
  }

  const didSyncVertical = syncGuideByOrientation(context, "vertical", verticalLineX);
  const didSyncHorizontal = syncGuideByOrientation(context, "horizontal", horizontalLineY);
  if (didSyncVertical || didSyncHorizontal) {
    context.canvas.requestRenderAll();
  }
}

/** 按方向更新单条参考线。 */
function syncGuideByOrientation(
  context: FabricEditorAdapterContext,
  orientation: FabricAlignmentGuideOrientation,
  position: number | null,
): boolean {
  if (!context.canvas) {
    return false;
  }

  if (position === null) {
    return clearGuideByOrientation(context, orientation);
  }

  const guide = ensureGuideByOrientation(context, orientation);
  if (!guide) {
    return false;
  }

  if (orientation === "vertical") {
    guide.set({
      x1: round(position),
      y1: 0,
      x2: round(position),
      y2: context.canvas.getHeight(),
      visible: true,
    });
  } else {
    guide.set({
      x1: 0,
      y1: round(position),
      x2: context.canvas.getWidth(),
      y2: round(position),
      visible: true,
    });
  }

  guide.setCoords?.();
  context.canvas.bringObjectToFront(guide);
  return true;
}

/** 创建或复用指定方向的参考线对象。 */
function ensureGuideByOrientation(
  context: FabricEditorAdapterContext,
  orientation: FabricAlignmentGuideOrientation,
): FabricAlignmentGuideLine | null {
  if (!context.canvas) {
    return null;
  }

  const existingGuide = readGuideByOrientation(context, orientation);
  if (existingGuide) {
    return existingGuide;
  }

  const guide = new Line([0, 0, 0, 0], {
    stroke: GUIDE_STROKE_COLOR,
    strokeWidth: GUIDE_STROKE_WIDTH,
    strokeDashArray: GUIDE_STROKE_DASH_ARRAY,
    strokeUniform: true,
    opacity: GUIDE_STROKE_OPACITY,
    selectable: false,
    evented: false,
    hasControls: false,
    objectCaching: false,
    excludeFromExport: true,
    hoverCursor: "default",
    moveCursor: "default",
    visible: true,
  }) as FabricAlignmentGuideLine;

  guide.__coursewareAlignmentGuide = orientation;
  context.canvas.add(guide);
  writeGuideByOrientation(context, orientation, guide);
  return guide;
}

/** 清理指定方向的参考线对象。 */
function clearGuideByOrientation(
  context: FabricEditorAdapterContext,
  orientation: FabricAlignmentGuideOrientation,
): boolean {
  const guide = readGuideByOrientation(context, orientation);
  if (!guide) {
    return false;
  }

  context.canvas?.remove(guide);
  writeGuideByOrientation(context, orientation, null);
  return true;
}

/** 按方向读取当前缓存的参考线对象。 */
function readGuideByOrientation(
  context: FabricEditorAdapterContext,
  orientation: FabricAlignmentGuideOrientation,
): FabricAlignmentGuideLine | null {
  return orientation === "vertical"
    ? context.alignmentVerticalGuide
    : context.alignmentHorizontalGuide;
}

/** 按方向写入当前缓存的参考线对象。 */
function writeGuideByOrientation(
  context: FabricEditorAdapterContext,
  orientation: FabricAlignmentGuideOrientation,
  guide: FabricAlignmentGuideLine | null,
): void {
  if (orientation === "vertical") {
    context.alignmentVerticalGuide = guide;
    return;
  }

  context.alignmentHorizontalGuide = guide;
}

/** 比较两个吸附命中，优先保留距离更近且位移更平滑的一项。 */
function isBetterSnapMatch(
  candidate: AxisSnapMatch,
  current: AxisSnapMatch | null,
): boolean {
  if (!current) {
    return true;
  }

  if (candidate.distance !== current.distance) {
    return candidate.distance < current.distance;
  }

  return Math.abs(candidate.offset) < Math.abs(current.offset);
}

/** 统一规整浮点结果，减少连续拖拽中的小数抖动。 */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
