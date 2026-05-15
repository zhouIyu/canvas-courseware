import { FabricImage, Rect } from "fabric";
import {
  resolveImageFrameLayout,
  type ImageCrop,
  type ObjectFit,
} from "@canvas-courseware/core";

/** 可被 frame 图片对象消费的原始资源对象。 */
type FrameImageSource = ConstructorParameters<typeof FabricImage>[0];

/** Frame 图片对象支持的额外序列化字段。 */
export interface FrameImageOptions {
  /** 固定 frame 的宽度。 */
  frameWidth: number;
  /** 固定 frame 的高度。 */
  frameHeight: number;
  /** 当前图片适配方式。 */
  objectFit?: ObjectFit;
  /** 当前图片裁剪窗口。 */
  crop?: ImageCrop | null;
}

/** Frame 图片对象实际可消费的构造参数。 */
type FabricFrameImageOptions = ConstructorParameters<typeof FabricImage>[1] & Partial<FrameImageOptions>;

/**
 * 统一把图片渲染到固定 frame 内。
 * 这样对象的控制框始终等于节点 `width/height`，同时支持 `objectFit + crop + flip` 的稳定组合。
 */
export class FabricFrameImage extends FabricImage {
  /** 当前节点真实 frame 宽度。 */
  declare frameWidth: number;
  /** 当前节点真实 frame 高度。 */
  declare frameHeight: number;
  /** 当前图片适配方式。 */
  declare objectFit: ObjectFit;
  /** 当前图片裁剪窗口。 */
  declare imageCrop: ImageCrop | null;

  constructor(element: FrameImageSource, options: FabricFrameImageOptions = {}) {
    super(element, options);

    this.frameWidth = Math.max(options.frameWidth ?? this.width ?? 1, 1);
    this.frameHeight = Math.max(options.frameHeight ?? this.height ?? 1, 1);
    this.objectFit = options.objectFit ?? "cover";
    this.imageCrop = options.crop ?? null;
    this.width = this.frameWidth;
    this.height = this.frameHeight;
  }

  /** 同步 frame 布局相关字段，并强制维持固定 frame 几何。 */
  syncFrameLayout(options: {
    /** 最新 frame 宽度。 */
    frameWidth: number;
    /** 最新 frame 高度。 */
    frameHeight: number;
    /** 最新适配方式。 */
    objectFit?: ObjectFit;
    /** 最新裁剪窗口。 */
    crop?: ImageCrop | null;
  }): void {
    this.frameWidth = Math.max(options.frameWidth, 1);
    this.frameHeight = Math.max(options.frameHeight, 1);
    this.objectFit = options.objectFit ?? "cover";
    this.imageCrop = options.crop ?? null;
    this.width = this.frameWidth;
    this.height = this.frameHeight;
  }

  /** 为图片对象补上 frame 裁剪边界。 */
  override needsItsOwnCache(): boolean {
    return true;
  }

  /** 使用固定 frame 重绘图片内容，并对超出区域执行裁切。 */
  override _renderFill(ctx: CanvasRenderingContext2D): void {
    const elementToDraw = this._element;
    if (!elementToDraw) {
      return;
    }

    const sourceWidth =
      (elementToDraw as HTMLImageElement).naturalWidth || elementToDraw.width || 1;
    const sourceHeight =
      (elementToDraw as HTMLImageElement).naturalHeight || elementToDraw.height || 1;
    const frameLayout = resolveImageFrameLayout({
      frameWidth: this.frameWidth,
      frameHeight: this.frameHeight,
      sourceSize: {
        width: sourceWidth,
        height: sourceHeight,
      },
      objectFit: this.objectFit,
      crop: this.imageCrop,
    });
    const cropLeft = sourceWidth * frameLayout.crop.x;
    const cropTop = sourceHeight * frameLayout.crop.y;
    const cropWidth = sourceWidth * frameLayout.crop.width;
    const cropHeight = sourceHeight * frameLayout.crop.height;
    const frameLeft = -this.frameWidth / 2;
    const frameTop = -this.frameHeight / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(frameLeft, frameTop, this.frameWidth, this.frameHeight);
    ctx.clip();
    ctx.drawImage(
      elementToDraw,
      cropLeft,
      cropTop,
      cropWidth,
      cropHeight,
      frameLeft + frameLayout.offsetX,
      frameTop + frameLayout.offsetY,
      frameLayout.drawWidth,
      frameLayout.drawHeight,
    );
    ctx.restore();
  }
}

/** 创建一块空图片占位，沿用固定 frame 的控制盒模型。 */
export function createFrameImagePlaceholder(frameWidth: number, frameHeight: number): Rect {
  return new Rect({
    width: frameWidth,
    height: frameHeight,
    rx: 0,
    ry: 0,
  });
}
