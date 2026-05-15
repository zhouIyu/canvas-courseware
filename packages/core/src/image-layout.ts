import type { ImageCrop, ObjectFit } from "./schema";

/** 图片布局计算需要的原始尺寸。 */
export interface ImageLayoutSize {
  /** 原始宽度。 */
  width: number;
  /** 原始高度。 */
  height: number;
}

/** 图片节点最终用于渲染的归一化裁剪窗口。 */
export interface ResolvedImageCrop {
  /** 左上角 X 比例。 */
  x: number;
  /** 左上角 Y 比例。 */
  y: number;
  /** 裁剪宽度比例。 */
  width: number;
  /** 裁剪高度比例。 */
  height: number;
}

/** 图片在固定 frame 内的最终绘制参数。 */
export interface ImageFrameLayout {
  /** 画框宽度。 */
  frameWidth: number;
  /** 画框高度。 */
  frameHeight: number;
  /** 最终用于绘制的裁剪窗口。 */
  crop: ResolvedImageCrop;
  /** 图片在画框内的绘制宽度。 */
  drawWidth: number;
  /** 图片在画框内的绘制高度。 */
  drawHeight: number;
  /** 图片绘制区域左边距。 */
  offsetX: number;
  /** 图片绘制区域上边距。 */
  offsetY: number;
}

/** 默认的完整图片裁剪窗口。 */
export const DEFAULT_IMAGE_CROP: ResolvedImageCrop = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

/** 把输入裁剪窗口约束到 0 - 1 范围，并确保不会超出原图边界。 */
export function normalizeImageCrop(crop?: ImageCrop | null): ResolvedImageCrop {
  if (!crop) {
    return { ...DEFAULT_IMAGE_CROP };
  }

  const x = clamp(crop.x, 0, 1);
  const y = clamp(crop.y, 0, 1);
  const width = clamp(crop.width, 0.01, 1 - x);
  const height = clamp(crop.height, 0.01, 1 - y);

  return {
    x,
    y,
    width,
    height,
  };
}

/** 基于 frame 尺寸、适配方式和裁剪窗口计算最终图片绘制参数。 */
export function resolveImageFrameLayout(options: {
  /** 节点 frame 宽度。 */
  frameWidth: number;
  /** 节点 frame 高度。 */
  frameHeight: number;
  /** 原始图片尺寸。 */
  sourceSize: ImageLayoutSize;
  /** 当前图片适配方式。 */
  objectFit?: ObjectFit;
  /** 当前裁剪窗口。 */
  crop?: ImageCrop | null;
}): ImageFrameLayout {
  const frameWidth = Math.max(options.frameWidth, 1);
  const frameHeight = Math.max(options.frameHeight, 1);
  const sourceWidth = Math.max(options.sourceSize.width, 1);
  const sourceHeight = Math.max(options.sourceSize.height, 1);
  const crop = normalizeImageCrop(options.crop);
  const cropWidth = sourceWidth * crop.width;
  const cropHeight = sourceHeight * crop.height;
  const fit = options.objectFit ?? "cover";

  if (fit === "fill") {
    return {
      frameWidth,
      frameHeight,
      crop,
      drawWidth: frameWidth,
      drawHeight: frameHeight,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const scaleResolver = fit === "contain" ? Math.min : Math.max;
  const scale = scaleResolver(frameWidth / cropWidth, frameHeight / cropHeight);
  const drawWidth = cropWidth * scale;
  const drawHeight = cropHeight * scale;

  return {
    frameWidth,
    frameHeight,
    crop,
    drawWidth,
    drawHeight,
    offsetX: (frameWidth - drawWidth) / 2,
    offsetY: (frameHeight - drawHeight) / 2,
  };
}

/** 统一做数值边界收敛。 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
