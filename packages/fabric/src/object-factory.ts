import {
  Control,
  FabricImage,
  Rect,
  Textbox,
  controlsUtils,
  type FabricObject,
} from "fabric";
import {
  DEFAULT_TEXT_FONT_FAMILY,
  type CoursewareNode,
  type ImageNode,
  type RectNode,
  type TextNode,
} from "@canvas-courseware/core";

/** 编辑态控制点的可视尺寸，适当放大以改善缩放控制点的可点击性。 */
const EDITOR_CONTROL_CORNER_SIZE = 16;

/** 编辑态控制点的触摸/命中尺寸，进一步扩大右下角等控制点的命中区域。 */
const EDITOR_CONTROL_TOUCH_SIZE = 28;

/** 编辑态控制框外围补白，用于扩大控制点附近的可操作区域。 */
const EDITOR_CONTROL_PADDING = 8;

/** Fabric 文本宽度调整动作名。 */
const TEXTBOX_RESIZE_ACTION = "resizing";

/** Fabric 适配层内部统一使用的对象类型。 */
export type FabricRenderableObject = FabricObject & {
  left?: number;
  top?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
  opacity?: number;
  visible?: boolean;
  text?: string;
  setCoords?: () => void;
};

/** 创建 Fabric 对象时可配置的交互模式。 */
export interface FabricNodeFactoryOptions {
  /** 是否按编辑态创建交互对象。 */
  interactive: boolean;
  /** 非交互对象的默认悬停光标。 */
  hoverCursor?: string;
  /** 非交互对象的默认拖拽光标。 */
  moveCursor?: string;
  /** 对象创建完成后的附加处理，例如挂载元数据。 */
  finalizeObject?: (object: FabricRenderableObject, node: CoursewareNode) => void;
}

/**
 * 根据节点类型创建对应的 Fabric 对象。
 * 这里统一收口基础创建逻辑，避免编辑态和播放态分别维护一套对象工厂。
 */
export async function createFabricNodeObject(
  node: CoursewareNode,
  options: FabricNodeFactoryOptions,
): Promise<FabricRenderableObject | null> {
  switch (node.type) {
    case "text":
      return createFabricTextObject(node, options);
    case "rect":
      return createFabricRectObject(node, options);
    case "image":
      return createFabricImageObject(node, options);
    default:
      return null;
  }
}

/**
 * 创建文本对象。
 * 默认统一补齐字体和行高，避免 Fabric 因收到空值而在布局阶段出现异常。
 */
export function createFabricTextObject(
  node: TextNode,
  options: FabricNodeFactoryOptions,
): FabricRenderableObject {
  const object = new Textbox(node.props.text, {
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    angle: node.rotation,
    opacity: node.opacity,
    visible: node.visible,
    fill: node.props.color,
    fontSize: node.props.fontSize,
    fontFamily: node.props.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: node.props.fontWeight,
    lineHeight: node.props.lineHeight ?? 1.5,
    textAlign: node.props.textAlign,
    /**
     * 当前产品把文本内容编辑统一收口到右侧属性面板，
     * 避免 Textbox/IText 自身的点击进入编辑态行为干扰选中、拖拽与缩放控制点。
     */
    editable: false,
    ...createNodeInteractionOptions(node, options),
    originX: "left",
    originY: "top",
  }) as FabricRenderableObject;

  /**
   * Fabric 的 Textbox 默认更偏向“左右改宽度”，底部角点并不会稳定触发宽度调整。
   * 为了满足当前编辑器对“右下角也能缩放文本框”的一致性交互预期，
   * 这里在编辑态下覆写文本对象控制点，让四个角都能进入宽度调整链路。
   */
  if (options.interactive) {
    applyTextboxEditorControls(object);
  }

  return finalizeFabricObject(object, node, options);
}

/** 创建矩形对象。 */
export function createFabricRectObject(
  node: RectNode,
  options: FabricNodeFactoryOptions,
): FabricRenderableObject {
  const object = new Rect({
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    angle: node.rotation,
    opacity: node.opacity,
    visible: node.visible,
    fill: node.props.fill,
    stroke: node.props.stroke,
    strokeWidth: node.props.strokeWidth,
    rx: node.props.radius,
    ry: node.props.radius,
    ...createNodeInteractionOptions(node, options),
    originX: "left",
    originY: "top",
  }) as FabricRenderableObject;

  return finalizeFabricObject(object, node, options);
}

/**
 * 创建图片对象。
 * 当图片地址为空或加载失败时，会自动回退到统一的占位对象。
 */
export async function createFabricImageObject(
  node: ImageNode,
  options: FabricNodeFactoryOptions,
): Promise<FabricRenderableObject> {
  if (!node.props.src) {
    return createFabricImagePlaceholder(node, options);
  }

  try {
    const object = (await FabricImage.fromURL(node.props.src, {}, {
      left: node.x,
      top: node.y,
      angle: node.rotation,
      opacity: node.opacity,
      visible: node.visible,
      ...createNodeInteractionOptions(node, options),
      originX: "left",
      originY: "top",
    })) as FabricRenderableObject;

    const naturalWidth = object.width || 1;
    const naturalHeight = object.height || 1;
    object.scaleX = node.width / naturalWidth;
    object.scaleY = node.height / naturalHeight;

    return finalizeFabricObject(object, node, options);
  } catch {
    return createFabricImagePlaceholder(node, options);
  }
}

/** 创建图片占位对象。 */
export function createFabricImagePlaceholder(
  node: ImageNode,
  options: FabricNodeFactoryOptions,
): FabricRenderableObject {
  const object = new Rect({
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    angle: node.rotation,
    opacity: node.opacity,
    visible: node.visible,
    fill: "#EEF2FA",
    stroke: "#8EA3C7",
    strokeWidth: 1,
    strokeDashArray: [8, 6],
    ...createNodeInteractionOptions(node, options),
    originX: "left",
    originY: "top",
  }) as FabricRenderableObject;

  return finalizeFabricObject(object, node, options);
}

/**
 * 根据当前模式生成通用交互参数。
 * 编辑态会尊重节点锁定状态，播放态统一禁用交互并设置默认光标。
 */
function createNodeInteractionOptions(
  node: CoursewareNode,
  options: FabricNodeFactoryOptions,
) {
  if (options.interactive) {
    return {
      selectable: !node.locked,
      evented: !node.locked,
      hasControls: !node.locked,
      lockMovementX: node.locked,
      lockMovementY: node.locked,
      /**
       * 放大编辑态控制点与命中区域，降低缩放控制点“看得见但点不中”的概率。
       * 这不会改变文档模型，只影响编辑画布中的交互可达性。
       */
      cornerSize: EDITOR_CONTROL_CORNER_SIZE,
      touchCornerSize: EDITOR_CONTROL_TOUCH_SIZE,
      padding: EDITOR_CONTROL_PADDING,
      transparentCorners: false,
    };
  }

  return {
    selectable: false,
    evented: false,
    hasControls: false,
    hoverCursor: options.hoverCursor ?? "default",
    moveCursor: options.moveCursor ?? "default",
  };
}

/**
 * 在对象构建结束后统一执行收尾动作。
 * 这里包括坐标刷新和按需注入元数据。
 */
function finalizeFabricObject(
  object: FabricRenderableObject,
  node: CoursewareNode,
  options: FabricNodeFactoryOptions,
): FabricRenderableObject {
  options.finalizeObject?.(object, node);
  object.setCoords?.();
  return object;
}

/**
 * 为编辑态 Textbox 覆写控制点交互。
 * 文本框本质上只支持“改宽度后自动重排高度”，因此这里把四个角都收敛到宽度调整，
 * 让用户从右下角、右上角等常见缩放手势也能稳定生效。
 */
function applyTextboxEditorControls(object: FabricRenderableObject): void {
  const textboxObject = object as FabricRenderableObject & {
    controls?: Record<string, Control>;
    setControlsVisibility?: (options: Record<string, boolean>) => void;
  };

  if (!textboxObject.controls) {
    return;
  }

  const createWidthResizeControl = (x: number, y: number) =>
    new Control({
      x,
      y,
      /**
       * 对 Textbox 而言，这里不是普通的等比缩放，而是“改宽度并自动重排高度”。
       * 显式声明为 `resizing`，让 Fabric 在变换阶段按文本宽度调整语义处理角控制点，
       * 避免继续沿用默认 `scale` 动作名带来的行为漂移。
       */
      actionName: TEXTBOX_RESIZE_ACTION,
      actionHandler: controlsUtils.changeWidth,
      cursorStyleHandler: controlsUtils.scaleSkewCursorStyleHandler,
    });

  textboxObject.controls.ml = createWidthResizeControl(-0.5, 0);
  textboxObject.controls.mr = createWidthResizeControl(0.5, 0);
  textboxObject.controls.tl = createWidthResizeControl(-0.5, -0.5);
  textboxObject.controls.tr = createWidthResizeControl(0.5, -0.5);
  textboxObject.controls.bl = createWidthResizeControl(-0.5, 0.5);
  textboxObject.controls.br = createWidthResizeControl(0.5, 0.5);

  /**
   * 文本框不支持独立垂直缩放，隐藏上下中点避免用户误以为可以单独拉高/压扁文本。
   */
  textboxObject.setControlsVisibility?.({
    mt: false,
    mb: false,
  });
}
