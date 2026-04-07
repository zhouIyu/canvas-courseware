import { Canvas, FabricImage } from "fabric";
import type { ObjectFit, Slide } from "@canvas-courseware/core";

/** 便于按需读写 Fabric 画布背景图属性的局部类型。 */
type CanvasWithBackgroundImage = Canvas & {
  backgroundImage?: FabricImage | undefined;
};

/** 让画布尺寸和纯色背景始终与当前 slide 保持一致。 */
export function syncCanvasFrame(canvas: Canvas, slide: Slide): void {
  canvas.setDimensions({
    width: slide.size.width,
    height: slide.size.height,
  });
  canvas.backgroundColor = slide.background.fill;
}

/** 清空当前画布上的背景图，供空态和切页时复用。 */
export function resetCanvasBackground(canvas: Canvas): void {
  (canvas as CanvasWithBackgroundImage).backgroundImage = undefined;
}

/**
 * 按当前 slide 的背景配置同步背景图。
 * 这里单独拆成异步步骤，避免选择态变更时重复加载背景资源。
 */
export async function syncCanvasBackgroundImage(canvas: Canvas, slide: Slide): Promise<void> {
  const backgroundImage = await createCanvasBackgroundImage(slide);
  (canvas as CanvasWithBackgroundImage).backgroundImage = backgroundImage ?? undefined;
}

/** 把 slide 背景图转换为可挂到 Fabric 画布上的背景对象。 */
async function createCanvasBackgroundImage(slide: Slide): Promise<FabricImage | null> {
  const backgroundImage = slide.background.image;
  const normalizedSource = backgroundImage?.src.trim();

  if (!backgroundImage || !normalizedSource) {
    return null;
  }

  try {
    const image = await FabricImage.fromURL(
      normalizedSource,
      {
        crossOrigin: "anonymous",
      },
      {
        originX: "left",
        originY: "top",
        selectable: false,
        evented: false,
      },
    );

    applyBackgroundImagePlacement(
      image,
      slide.size.width,
      slide.size.height,
      backgroundImage.fit,
    );

    return image;
  } catch {
    return null;
  }
}

/**
 * 根据 slide 尺寸和适配方式，把背景图放到正确位置。
 * `fill` 会强制铺满，`contain` 和 `cover` 则保持原始宽高比。
 */
function applyBackgroundImagePlacement(
  image: FabricImage,
  slideWidth: number,
  slideHeight: number,
  fit: ObjectFit,
): void {
  const naturalWidth = image.width || 1;
  const naturalHeight = image.height || 1;

  if (fit === "fill") {
    image.set({
      left: 0,
      top: 0,
      scaleX: slideWidth / naturalWidth,
      scaleY: slideHeight / naturalHeight,
    });
    image.setCoords();
    return;
  }

  const scaleResolver = fit === "contain" ? Math.min : Math.max;
  const scale = scaleResolver(slideWidth / naturalWidth, slideHeight / naturalHeight);
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;

  image.set({
    left: (slideWidth - renderedWidth) / 2,
    top: (slideHeight - renderedHeight) / 2,
    scaleX: scale,
    scaleY: scale,
  });
  image.setCoords();
}
