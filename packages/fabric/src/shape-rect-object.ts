import {
  Gradient,
  Path,
  Shadow,
  type TComplexPathData,
} from "fabric";
import {
  createDefaultRectGradientFill,
  createRectCornerRadii,
  resolveRectUniformRadius,
  type RectCornerRadii,
  type RectGradientFill,
  type RectNodeProps,
  type RectShadow,
} from "@canvas-courseware/core";

/** 自定义矩形对象的扩展配置。 */
export interface FabricShapeRectOptions {
  /** 当前矩形节点宽度。 */
  width: number;
  /** 当前矩形节点高度。 */
  height: number;
  /** 当前矩形节点样式属性。 */
  rectProps: RectNodeProps;
}

/** 自定义矩形对象实际可消费的构造参数。 */
type FabricShapeRectObjectOptions = ConstructorParameters<typeof Path>[1] &
  Partial<FabricShapeRectOptions>;

/**
 * 统一承载矩形的独立圆角、渐变与阴影渲染。
 * 当圆角保持统一时仍可沿用规则矩形 path；需要四角独立时则直接走定制 path。
 */
export class FabricShapeRect extends Path {
  /** 当前矩形节点真实宽度。 */
  declare rectWidth: number;
  /** 当前矩形节点真实高度。 */
  declare rectHeight: number;
  /** 当前矩形填充方式。 */
  declare rectFillType: NonNullable<RectNodeProps["fillType"]>;
  /** 当前矩形渐变配置。 */
  declare rectGradient: RectGradientFill;
  /** 当前矩形四角圆角配置。 */
  declare rectCornerRadii: RectCornerRadii;
  /** 当前矩形阴影配置。 */
  declare rectShadow: RectShadow | undefined;

  constructor(options: FabricShapeRectObjectOptions) {
    const normalizedWidth = Math.max(options.width ?? 1, 1);
    const normalizedHeight = Math.max(options.height ?? 1, 1);
    const normalizedRectProps = normalizeRectNodeProps({
      ...options.rectProps,
      radius: resolveRectUniformRadius(options.rectProps ?? { fill: "#000000" }),
    } as RectNodeProps);
    const path = createRoundedRectPath(
      normalizedWidth,
      normalizedHeight,
      normalizedRectProps.cornerRadii ?? createRectCornerRadii(),
    );

    super(path, options);
    this.rectWidth = normalizedWidth;
    this.rectHeight = normalizedHeight;
    this.rectFillType = normalizedRectProps.fillType ?? "solid";
    this.rectGradient = normalizedRectProps.gradient ?? createDefaultRectGradientFill();
    this.rectCornerRadii = normalizedRectProps.cornerRadii ?? createRectCornerRadii();
    this.rectShadow = normalizedRectProps.shadow;
    this.syncRectLayout({
      width: normalizedWidth,
      height: normalizedHeight,
      rectProps: normalizedRectProps,
    });
  }

  /** 同步矩形 path、填充与阴影，保持对象本身持续可复用。 */
  syncRectLayout(options: FabricShapeRectOptions): void {
    this.rectWidth = Math.max(options.width, 1);
    this.rectHeight = Math.max(options.height, 1);

    const normalizedProps = normalizeRectNodeProps(options.rectProps);
    this.rectFillType = normalizedProps.fillType ?? "solid";
    this.rectGradient = normalizedProps.gradient ?? createDefaultRectGradientFill();
    this.rectCornerRadii = normalizedProps.cornerRadii ?? createRectCornerRadii();
    this.rectShadow = normalizedProps.shadow;

    this._setPath(
      createRoundedRectPath(this.rectWidth, this.rectHeight, this.rectCornerRadii),
      false,
    );
    this.width = this.rectWidth;
    this.height = this.rectHeight;

    this.set({
      fill:
        this.rectFillType === "linear-gradient"
          ? createFabricLinearGradient(this.rectWidth, this.rectHeight, this.rectGradient)
          : normalizedProps.fill,
      stroke: normalizedProps.stroke,
      strokeWidth: normalizedProps.strokeWidth,
      shadow: this.rectShadow ? createFabricShadow(this.rectShadow) : null,
    });
    this.setCoords();
  }
}

/** 归一化矩形样式结构，保证后续渲染阶段无需反复做空值判断。 */
export function normalizeRectNodeProps(props: RectNodeProps): RectNodeProps {
  const normalizedRadius = resolveRectUniformRadius(props);

  return {
    ...props,
    fillType: props.fillType ?? "solid",
    gradient: props.gradient
      ? {
          ...props.gradient,
        }
      : createDefaultRectGradientFill(),
    radius: normalizedRadius,
    cornerRadii: props.cornerRadii
      ? {
          ...props.cornerRadii,
        }
      : createRectCornerRadii(normalizedRadius),
    shadow: props.shadow
      ? {
          ...props.shadow,
        }
      : undefined,
  };
}

/** 生成支持四角独立圆角的矩形 path。 */
function createRoundedRectPath(
  width: number,
  height: number,
  cornerRadii: RectCornerRadii,
): TComplexPathData {
  const maxRadiusX = width / 2;
  const maxRadiusY = height / 2;
  const topLeft = clampCornerRadius(cornerRadii.topLeft, maxRadiusX, maxRadiusY);
  const topRight = clampCornerRadius(cornerRadii.topRight, maxRadiusX, maxRadiusY);
  const bottomRight = clampCornerRadius(cornerRadii.bottomRight, maxRadiusX, maxRadiusY);
  const bottomLeft = clampCornerRadius(cornerRadii.bottomLeft, maxRadiusX, maxRadiusY);

  return [
    ["M", topLeft, 0],
    ["L", width - topRight, 0],
    ["Q", width, 0, width, topRight],
    ["L", width, height - bottomRight],
    ["Q", width, height, width - bottomRight, height],
    ["L", bottomLeft, height],
    ["Q", 0, height, 0, height - bottomLeft],
    ["L", 0, topLeft],
    ["Q", 0, 0, topLeft, 0],
    ["Z"],
  ];
}

/** 把矩形渐变角度转换为 Fabric 线性渐变坐标。 */
function createFabricLinearGradient(
  width: number,
  height: number,
  gradient: RectGradientFill,
): Gradient<"linear"> {
  const radians = (gradient.angle * Math.PI) / 180;
  const centerX = width / 2;
  const centerY = height / 2;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const vectorLength =
    Math.max(Math.abs(Math.cos(radians)) * halfWidth, Math.abs(Math.sin(radians)) * halfHeight) ||
    1;
  const deltaX = Math.cos(radians) * vectorLength;
  const deltaY = Math.sin(radians) * vectorLength;

  return new Gradient({
    type: "linear",
    coords: {
      x1: centerX - deltaX,
      y1: centerY - deltaY,
      x2: centerX + deltaX,
      y2: centerY + deltaY,
    },
    colorStops: [
      {
        offset: 0,
        color: gradient.from,
        opacity: 1,
      },
      {
        offset: 1,
        color: gradient.to,
        opacity: 1,
      },
    ],
  });
}

/** 创建一份 Fabric 阴影对象。 */
function createFabricShadow(shadow: RectShadow): Shadow {
  return new Shadow({
    color: shadow.color,
    offsetX: shadow.offsetX,
    offsetY: shadow.offsetY,
    blur: shadow.blur,
  });
}

/** 把四角圆角限制在当前矩形宽高的一半内。 */
function clampCornerRadius(value: number, maxRadiusX: number, maxRadiusY: number): number {
  return Math.min(Math.max(value, 0), Math.min(maxRadiusX, maxRadiusY));
}
