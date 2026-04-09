import type { ObjectFit } from "@canvas-courseware/core";

/** 背景图填充方式选项的结构定义。 */
export interface BackgroundImageFitOption {
  /** 标准 schema 中的填充方式值。 */
  value: ObjectFit;
  /** 面向用户的简短名称。 */
  label: string;
  /** 辅助用户理解差异的说明文案。 */
  description: string;
}

/** “设为背景”流程默认采用的填充方式。 */
export const DEFAULT_BACKGROUND_IMAGE_FIT: ObjectFit = "cover";

/** 页面背景图填充方式的统一选项列表。 */
export const BACKGROUND_IMAGE_FIT_OPTIONS: readonly BackgroundImageFitOption[] = [
  {
    value: "cover",
    label: "裁切铺满",
    description: "铺满整个页面，可能裁掉图片边缘，适合横图做封面。",
  },
  {
    value: "contain",
    label: "完整显示",
    description: "完整保留图片内容，可能在四周留白，适合竖图或信息图。",
  },
  {
    value: "fill",
    label: "拉伸铺满",
    description: "直接拉伸到整页，不留白也不裁切，但会改变图片比例。",
  },
] as const;

/** 判断任意值是否为受支持的背景图填充方式。 */
export const isBackgroundImageFit = (value: unknown): value is ObjectFit =>
  BACKGROUND_IMAGE_FIT_OPTIONS.some((option) => option.value === value);

/** 把任意输入归一化成合法的背景图填充方式。 */
export const normalizeBackgroundImageFit = (
  value: unknown,
  fallback: ObjectFit = DEFAULT_BACKGROUND_IMAGE_FIT,
): ObjectFit => (isBackgroundImageFit(value) ? value : fallback);
