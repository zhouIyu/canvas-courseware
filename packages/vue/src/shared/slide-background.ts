import type { SlideBackground } from "@canvas-courseware/core";

/** 把背景图适配方式转换成 CSS 可直接消费的 `background-size`。 */
function resolveBackgroundSize(fit: NonNullable<SlideBackground["image"]>["fit"]): string {
  return fit === "fill" ? "100% 100%" : fit;
}

/**
 * 根据 slide 背景配置生成缩略图和预览卡片可复用的样式对象。
 * 纯色始终作为底色保留，背景图则按配置的填充方式叠加显示。
 */
export function createSlideBackgroundStyle(background: SlideBackground): Record<string, string> {
  const backgroundImage = background.image;
  const normalizedSource = backgroundImage?.src.trim();

  if (!backgroundImage || !normalizedSource) {
    return {
      backgroundColor: background.fill,
    };
  }

  return {
    backgroundColor: background.fill,
    backgroundImage: `url(${JSON.stringify(normalizedSource)})`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: resolveBackgroundSize(backgroundImage.fit),
  };
}
