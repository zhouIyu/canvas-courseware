import type {
  AnimationKind,
  CoursewareNode,
  EasingName,
  Slide,
} from "@canvas-courseware/core";
import type { FabricPlayerAdapterContext, FabricPlaybackObject } from "./context";

/** 播放动作中的动画执行选项。 */
interface PlayerAnimationOptions {
  /** 当前动画是否承担“显示节点”职责。 */
  reveal: boolean;
  /** 发起本轮播放时记录的同步版本号。 */
  version: number;
  /** 是否以无动画方式直接落到最终状态。 */
  instant: boolean;
}

/** 执行指定动画 id 对应的播放逻辑。 */
export async function playPlayerAnimation(
  context: FabricPlayerAdapterContext,
  slide: Slide,
  animationId: string,
  options: PlayerAnimationOptions,
): Promise<void> {
  const animation = slide.timeline.animations.find((item) => item.id === animationId);
  if (!animation) {
    return;
  }

  const object = context.objectMap.get(animation.targetId);
  const node = findNode(slide, animation.targetId);
  if (!object || !node || options.version !== context.syncVersion) {
    return;
  }

  if (options.instant) {
    applyAnimationFinalState(context, object, node, animation, options.reveal);
    return;
  }

  if ((animation.delayMs ?? 0) > 0) {
    await sleep(animation.delayMs ?? 0);
    if (options.version !== context.syncVersion) {
      return;
    }
  }

  switch (animation.kind) {
    case "appear":
      playAppearAnimation(context, object, node, options.reveal);
      return;
    case "fade":
      await playFadeAnimation(context, object, node, animation, options.reveal);
      return;
    case "slide-up":
      await playSlideUpAnimation(context, object, node, animation, options.reveal);
      return;
    default:
      return;
  }
}

/** 把标准节点状态写回到 Fabric 播放对象。 */
export function applyPlayerNodeState(
  object: FabricPlaybackObject,
  node: CoursewareNode,
): void {
  object.left = node.x;
  object.top = node.y;
  object.angle = node.rotation;
  object.opacity = node.opacity;
  object.visible = node.visible;

  if (node.type === "text") {
    object.text = node.props.text;
  }

  if (node.type === "image") {
    const naturalWidth = object.width || 1;
    const naturalHeight = object.height || 1;
    object.scaleX = node.width / naturalWidth;
    object.scaleY = node.height / naturalHeight;
  } else {
    object.scaleX = 1;
    object.scaleY = 1;
  }

  object.setCoords?.();
}

/** 以无动画的方式直接落到动画执行完成后的最终状态。 */
function applyAnimationFinalState(
  context: FabricPlayerAdapterContext,
  object: FabricPlaybackObject,
  node: CoursewareNode,
  animation: {
    kind: AnimationKind;
  },
  reveal: boolean,
): void {
  switch (animation.kind) {
    case "appear":
      playAppearAnimation(context, object, node, reveal);
      return;
    case "fade":
      applyPlayerNodeState(object, node);

      if (!reveal && object.visible === false) {
        context.canvas?.requestRenderAll();
        return;
      }

      object.visible = true;
      object.opacity = node.opacity;
      object.setCoords?.();
      context.canvas?.requestRenderAll();
      return;
    case "slide-up":
      applyPlayerNodeState(object, node);
      object.visible = true;
      object.setCoords?.();
      context.canvas?.requestRenderAll();
      return;
    default:
      return;
  }
}

/** 执行最轻量的 appear 动画。 */
function playAppearAnimation(
  context: FabricPlayerAdapterContext,
  object: FabricPlaybackObject,
  node: CoursewareNode,
  reveal: boolean,
): void {
  applyPlayerNodeState(object, node);
  if (reveal || object.visible !== false) {
    object.visible = true;
  }

  context.canvas?.requestRenderAll();
}

/** 执行淡入动画。 */
async function playFadeAnimation(
  context: FabricPlayerAdapterContext,
  object: FabricPlaybackObject,
  node: CoursewareNode,
  animation: { durationMs: number; easing?: EasingName },
  reveal: boolean,
): Promise<void> {
  applyPlayerNodeState(object, node);

  if (reveal) {
    object.visible = true;
    object.opacity = 0;
  } else if (object.visible === false) {
    return;
  }

  context.canvas?.requestRenderAll();

  await animateNumber(object, "opacity", node.opacity, {
    duration: animation.durationMs,
    easing: resolveEasing(animation.easing),
    onChange: () => context.canvas?.requestRenderAll(),
  });

  object.opacity = node.opacity;
  object.visible = true;
  context.canvas?.requestRenderAll();
}

/** 执行从下方滑入的动画。 */
async function playSlideUpAnimation(
  context: FabricPlayerAdapterContext,
  object: FabricPlaybackObject,
  node: CoursewareNode,
  animation: {
    durationMs: number;
    easing?: EasingName;
    offsetY?: number;
  },
  reveal: boolean,
): Promise<void> {
  const offsetY = animation.offsetY ?? 32;

  applyPlayerNodeState(object, node);
  object.visible = true;
  object.top = node.y + offsetY;

  if (reveal) {
    object.opacity = 0;
  }

  object.setCoords?.();
  context.canvas?.requestRenderAll();

  await Promise.all([
    animateNumber(object, "top", node.y, {
      duration: animation.durationMs,
      easing: resolveEasing(animation.easing),
      onChange: () => {
        object.setCoords?.();
        context.canvas?.requestRenderAll();
      },
    }),
    animateNumber(object, "opacity", node.opacity, {
      duration: animation.durationMs,
      easing: resolveEasing(animation.easing),
      onChange: () => context.canvas?.requestRenderAll(),
    }),
  ]);

  applyPlayerNodeState(object, node);
  object.visible = true;
  object.setCoords?.();
  context.canvas?.requestRenderAll();
}

/** 从当前页面里查询动画目标节点。 */
function findNode(slide: Slide, nodeId: string): CoursewareNode | undefined {
  return slide.nodes.find((node) => node.id === nodeId);
}

/** 把业务 easing 名称映射成 Fabric 所需的缓动函数。 */
function resolveEasing(easing?: EasingName) {
  switch (easing) {
    case "ease-in":
      return easeIn;
    case "ease-out":
      return easeOut;
    case "ease-in-out":
      return easeInOut;
    case "linear":
    default:
      return linear;
  }
}

/** 对指定数值属性执行 Fabric 动画。 */
function animateNumber(
  object: FabricPlaybackObject,
  key: "top" | "opacity",
  endValue: number,
  options: {
    duration: number;
    easing: (
      timeElapsed: number,
      startValue: number,
      byValue: number,
      duration: number,
    ) => number;
    onChange: VoidFunction;
  },
): Promise<void> {
  return new Promise((resolve) => {
    object.animate(
      {
        [key]: endValue,
      },
      {
        duration: options.duration,
        easing: options.easing,
        onChange: () => options.onChange(),
        onComplete: () => resolve(),
      },
    );
  });
}

/** 线性缓动。 */
function linear(timeElapsed: number, startValue: number, byValue: number, duration: number) {
  return startValue + (byValue * timeElapsed) / duration;
}

/** 三次方 ease-in 缓动。 */
function easeIn(timeElapsed: number, startValue: number, byValue: number, duration: number) {
  const progress = timeElapsed / duration;
  return startValue + byValue * progress * progress * progress;
}

/** 三次方 ease-out 缓动。 */
function easeOut(timeElapsed: number, startValue: number, byValue: number, duration: number) {
  const progress = timeElapsed / duration - 1;
  return startValue + byValue * (progress * progress * progress + 1);
}

/** 三次方 ease-in-out 缓动。 */
function easeInOut(
  timeElapsed: number,
  startValue: number,
  byValue: number,
  duration: number,
) {
  let progress = timeElapsed / (duration / 2);

  if (progress < 1) {
    return startValue + (byValue / 2) * progress * progress * progress;
  }

  progress -= 2;
  return startValue + (byValue / 2) * (progress * progress * progress + 2);
}

/** 等待指定时长后继续执行。 */
function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
