import type {
  RectCornerRadii,
  RectGradientFill,
  RectNodeProps,
  RectShadow,
} from "./schema";

/** 默认矩形描边颜色。 */
export const DEFAULT_RECT_STROKE_COLOR = "#4B7BE5";

/** 默认矩形纯色填充。 */
export const DEFAULT_RECT_FILL_COLOR = "#DCE8FF";

/** 默认矩形线性渐变起点颜色。 */
export const DEFAULT_RECT_GRADIENT_FROM = "#E0EDFF";

/** 默认矩形线性渐变终点颜色。 */
export const DEFAULT_RECT_GRADIENT_TO = "#A9C8FF";

/** 默认矩形渐变角度。 */
export const DEFAULT_RECT_GRADIENT_ANGLE = 135;

/** 默认矩形统一圆角值。 */
export const DEFAULT_RECT_RADIUS = 16;

/** 默认矩形阴影颜色。 */
export const DEFAULT_RECT_SHADOW_COLOR = "rgba(59, 91, 219, 0.22)";

/** 默认矩形阴影 X 偏移。 */
export const DEFAULT_RECT_SHADOW_OFFSET_X = 0;

/** 默认矩形阴影 Y 偏移。 */
export const DEFAULT_RECT_SHADOW_OFFSET_Y = 10;

/** 默认矩形阴影模糊半径。 */
export const DEFAULT_RECT_SHADOW_BLUR = 24;

/** 创建一份标准化的矩形渐变配置。 */
export function createDefaultRectGradientFill(): RectGradientFill {
  return {
    from: DEFAULT_RECT_GRADIENT_FROM,
    to: DEFAULT_RECT_GRADIENT_TO,
    angle: DEFAULT_RECT_GRADIENT_ANGLE,
  };
}

/** 把统一圆角值展开为四角圆角配置。 */
export function createRectCornerRadii(radius = DEFAULT_RECT_RADIUS): RectCornerRadii {
  const normalizedRadius = Math.max(radius, 0);
  return {
    topLeft: normalizedRadius,
    topRight: normalizedRadius,
    bottomRight: normalizedRadius,
    bottomLeft: normalizedRadius,
  };
}

/** 创建一份默认矩形阴影配置。 */
export function createDefaultRectShadow(): RectShadow {
  return {
    color: DEFAULT_RECT_SHADOW_COLOR,
    offsetX: DEFAULT_RECT_SHADOW_OFFSET_X,
    offsetY: DEFAULT_RECT_SHADOW_OFFSET_Y,
    blur: DEFAULT_RECT_SHADOW_BLUR,
  };
}

/** 创建一份默认矩形属性。 */
export function createDefaultRectNodeProps(): RectNodeProps {
  return {
    fill: DEFAULT_RECT_FILL_COLOR,
    fillType: "solid",
    gradient: createDefaultRectGradientFill(),
    stroke: DEFAULT_RECT_STROKE_COLOR,
    strokeWidth: 1,
    radius: DEFAULT_RECT_RADIUS,
    cornerRadii: createRectCornerRadii(DEFAULT_RECT_RADIUS),
    shadow: undefined,
  };
}

/** 判断当前矩形是否使用统一圆角。 */
export function isRectUniformRadius(cornerRadii: RectCornerRadii | undefined): boolean {
  if (!cornerRadii) {
    return true;
  }

  return (
    cornerRadii.topLeft === cornerRadii.topRight &&
    cornerRadii.topLeft === cornerRadii.bottomRight &&
    cornerRadii.topLeft === cornerRadii.bottomLeft
  );
}

/** 从矩形属性中推导当前生效的统一圆角值。 */
export function resolveRectUniformRadius(props: RectNodeProps): number {
  if (typeof props.radius === "number") {
    return Math.max(props.radius, 0);
  }

  if (props.cornerRadii && isRectUniformRadius(props.cornerRadii)) {
    return Math.max(props.cornerRadii.topLeft, 0);
  }

  return 0;
}
