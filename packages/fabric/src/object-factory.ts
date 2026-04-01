import {
  FabricImage,
  Rect,
  Textbox,
  type FabricObject,
} from "fabric";
import {
  DEFAULT_TEXT_FONT_FAMILY,
  type CoursewareNode,
  type ImageNode,
  type RectNode,
  type TextNode,
} from "@canvas-courseware/core";

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
    editable: options.interactive ? !node.locked : false,
    ...createNodeInteractionOptions(node, options),
    originX: "left",
    originY: "top",
  }) as FabricRenderableObject;

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
