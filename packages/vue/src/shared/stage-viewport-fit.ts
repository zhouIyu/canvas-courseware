import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
  type ComputedRef,
  type Ref,
} from "vue";

/** 共享视口适配时使用的内容尺寸结构。 */
export interface StageViewportContentSize {
  /** 当前内容区的可用宽度。 */
  width: number;
  /** 当前内容区的可用高度。 */
  height: number;
}

/** 画布原始尺寸的只读结构。 */
export interface StageViewportSlideSize {
  /** 课件原始宽度。 */
  width: number;
  /** 课件原始高度。 */
  height: number;
}

/** 缩放后画布外框的尺寸结构。 */
interface StageViewportFrameSize {
  /** 当前缩放后的外框宽度。 */
  width: number;
  /** 当前缩放后的外框高度。 */
  height: number;
}

/** 共享缩放逻辑需要的输入参数。 */
interface StageViewportFitOptions {
  /** 实际承担“可用画布区”职责的 DOM 节点。 */
  viewportRef: Ref<HTMLElement | null>;
  /** 当前激活画布的原始尺寸。 */
  slideSize: ComputedRef<StageViewportSlideSize | null>;
}

/** 画布视图控制当前处于“适配”还是“手动”模式。 */
export type StageViewportZoomMode = "fit" | "manual";

/** 工作区高度密度档位，供编辑态和预览态共用。 */
export type WorkspaceViewportDensity = "spacious" | "compact" | "dense";

/** 手动缩放允许使用的固定档位，保证编辑态与预览态体验一致。 */
const STAGE_VIEWPORT_SCALE_STEPS = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200];

/** 缩放比较时容忍的最小误差，避免浮点数抖动导致按钮状态来回跳。 */
const SCALE_COMPARE_EPSILON = 0.5;

/**
 * 把 CSS 里的尺寸值转成安全数值。
 * 解析失败时统一回退到 `0`，避免后续内容区计算出现 `NaN`。
 */
function readCssBoxValue(value: string): number {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

/**
 * 读取目标元素真正可用的内容区尺寸。
 * 这里显式扣掉 `padding` 和 `border`，保证缩放逻辑消费的是实际可摆放画布的区域。
 */
function readElementContentSize(element: HTMLElement | null): StageViewportContentSize {
  if (!element) {
    return {
      width: 0,
      height: 0,
    };
  }

  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  const horizontalInset =
    readCssBoxValue(styles.paddingLeft) +
    readCssBoxValue(styles.paddingRight) +
    readCssBoxValue(styles.borderLeftWidth) +
    readCssBoxValue(styles.borderRightWidth);
  const verticalInset =
    readCssBoxValue(styles.paddingTop) +
    readCssBoxValue(styles.paddingBottom) +
    readCssBoxValue(styles.borderTopWidth) +
    readCssBoxValue(styles.borderBottomWidth);

  return {
    width: Math.max(Math.round(rect.width - horizontalInset), 0),
    height: Math.max(Math.round(rect.height - verticalInset), 0),
  };
}

/**
 * 根据当前工作区净高度给出统一密度档位。
 * 档位会驱动画布留白、侧栏体积和预览附加信息的显示策略。
 */
export function resolveWorkspaceViewportDensity(height: number): WorkspaceViewportDensity {
  if (height <= 700) {
    return "dense";
  }

  if (height <= 900) {
    return "compact";
  }

  return "spacious";
}

/**
 * 把缩放百分比钳制到合法档位边界内。
 * 这样无论来自手动按钮还是默认值，都不会跑出统一的缩放上限与下限。
 */
function clampScalePercent(scalePercent: number): number {
  const minimumScalePercent = STAGE_VIEWPORT_SCALE_STEPS[0] ?? 25;
  const maximumScalePercent =
    STAGE_VIEWPORT_SCALE_STEPS[STAGE_VIEWPORT_SCALE_STEPS.length - 1] ?? 200;

  return Math.min(Math.max(scalePercent, minimumScalePercent), maximumScalePercent);
}

/**
 * 根据当前百分比和缩放方向，找到下一个固定缩放档位。
 * 适配模式下也会复用这套逻辑，确保首次点击放大 / 缩小时就进入最近的手动档位。
 */
function resolveAdjacentScalePercent(
  currentScalePercent: number,
  direction: 1 | -1,
): number {
  const normalizedScalePercent = clampScalePercent(currentScalePercent);

  if (direction > 0) {
    return (
      STAGE_VIEWPORT_SCALE_STEPS.find(
        (scalePercent) => scalePercent > normalizedScalePercent + SCALE_COMPARE_EPSILON,
      ) ??
      STAGE_VIEWPORT_SCALE_STEPS[STAGE_VIEWPORT_SCALE_STEPS.length - 1] ??
      normalizedScalePercent
    );
  }

  return (
    [...STAGE_VIEWPORT_SCALE_STEPS]
      .reverse()
      .find((scalePercent) => scalePercent < normalizedScalePercent - SCALE_COMPARE_EPSILON) ??
    STAGE_VIEWPORT_SCALE_STEPS[0] ??
    normalizedScalePercent
  );
}

/**
 * 计算当前 slide 在给定缩放比例下的外框尺寸。
 * 后续滚动判定和外框样式都统一消费这一份尺寸结果。
 */
function resolveFrameSize(
  slideSize: StageViewportSlideSize | null,
  canvasScale: number,
): StageViewportFrameSize {
  if (!slideSize) {
    return {
      width: 0,
      height: 0,
    };
  }

  return {
    width: slideSize.width * canvasScale,
    height: slideSize.height * canvasScale,
  };
}

/**
 * 观测一个可用画布区节点的真实内容尺寸。
 * 这样编辑态和预览态都能复用同一套内容盒子测量逻辑。
 */
function useObservedViewportContentSize(viewportRef: Ref<HTMLElement | null>) {
  /** 当前可用于居中摆放画布的内容区尺寸。 */
  const viewportContentSize = ref<StageViewportContentSize>({
    width: 0,
    height: 0,
  });

  /**
   * 主动刷新一次内容区尺寸。
   * 供挂载、窗口 resize 或外层布局发生变化时复用。
   */
  const refreshViewportContentSize = () => {
    viewportContentSize.value = readElementContentSize(viewportRef.value);
  };

  /** 当前挂载在可用区节点上的观察器。 */
  let viewportResizeObserver: ResizeObserver | null = null;

  /**
   * 重新绑定尺寸观察器。
   * 当 ref 指向的元素发生变化时，旧观察器会先被清理，避免重复监听。
   */
  const reconnectViewportResizeObserver = () => {
    viewportResizeObserver?.disconnect();
    viewportResizeObserver = null;

    if (!viewportRef.value) {
      refreshViewportContentSize();
      return;
    }

    viewportResizeObserver = new ResizeObserver(() => {
      refreshViewportContentSize();
    });
    viewportResizeObserver.observe(viewportRef.value);
    refreshViewportContentSize();
  };

  watch(
    () => viewportRef.value,
    () => {
      reconnectViewportResizeObserver();
    },
  );

  onMounted(() => {
    reconnectViewportResizeObserver();
  });

  onBeforeUnmount(() => {
    viewportResizeObserver?.disconnect();
    viewportResizeObserver = null;
  });

  return {
    refreshViewportContentSize,
    viewportContentSize,
  };
}

/**
 * 统一维护“适配缩放”和“手动缩放”的切换状态。
 * 视图控制只停留在 UI 层，不把缩放状态耦合到具体渲染引擎对象上。
 */
function useStageViewportZoomState(fitScale: ComputedRef<number>) {
  /** 当前视图缩放模式，默认跟随适配结果。 */
  const zoomMode = ref<StageViewportZoomMode>("fit");

  /** 手动缩放时使用的百分比值。 */
  const manualScalePercent = ref(100);

  /** 适配模式下换算后的百分比摘要，供 UI 直接展示。 */
  const fitScalePercent = computed(() => Math.round(fitScale.value * 100));

  /** 当前真正展示给用户的缩放百分比。 */
  const scalePercent = computed(() =>
    zoomMode.value === "fit"
      ? fitScalePercent.value
      : clampScalePercent(manualScalePercent.value),
  );

  /** 当前实际作用到画布上的缩放比例。 */
  const canvasScale = computed(() =>
    zoomMode.value === "fit" ? fitScale.value : clampScalePercent(manualScalePercent.value) / 100,
  );

  /** 当前是否处于适配模式。 */
  const isFitZoom = computed(() => zoomMode.value === "fit");

  /** 当前是否处于手动 `100%` 视图。 */
  const isActualSizeZoom = computed(
    () =>
      zoomMode.value === "manual" &&
      Math.abs(clampScalePercent(manualScalePercent.value) - 100) <= SCALE_COMPARE_EPSILON,
  );

  /** 当前是否还能继续放大。 */
  const canZoomIn = computed(() => {
    const maximumScalePercent =
      STAGE_VIEWPORT_SCALE_STEPS[STAGE_VIEWPORT_SCALE_STEPS.length - 1] ?? scalePercent.value;
    return scalePercent.value < maximumScalePercent - SCALE_COMPARE_EPSILON;
  });

  /** 当前是否还能继续缩小。 */
  const canZoomOut = computed(() => {
    const minimumScalePercent = STAGE_VIEWPORT_SCALE_STEPS[0] ?? scalePercent.value;
    return scalePercent.value > minimumScalePercent + SCALE_COMPARE_EPSILON;
  });

  /** 切换到指定的手动缩放百分比。 */
  const setManualScalePercent = (nextScalePercent: number) => {
    manualScalePercent.value = clampScalePercent(nextScalePercent);
    zoomMode.value = "manual";
  };

  /** 放大到下一个固定档位。 */
  const zoomIn = () => {
    setManualScalePercent(resolveAdjacentScalePercent(scalePercent.value, 1));
  };

  /** 缩小到下一个固定档位。 */
  const zoomOut = () => {
    setManualScalePercent(resolveAdjacentScalePercent(scalePercent.value, -1));
  };

  /** 恢复到自适应画布的默认视图。 */
  const zoomToFit = () => {
    zoomMode.value = "fit";
  };

  /** 回到手动 `100%` 视图。 */
  const zoomToActualSize = () => {
    setManualScalePercent(100);
  };

  return {
    canZoomIn,
    canZoomOut,
    canvasScale,
    fitScalePercent,
    isActualSizeZoom,
    isFitZoom,
    scalePercent,
    zoomIn,
    zoomMode,
    zoomOut,
    zoomToActualSize,
    zoomToFit,
  };
}

/**
 * 基于真实可用区尺寸和当前外框尺寸，计算滚动与居中策略。
 * 当用户主动放大后，只在确有必要时开放局部滚动，同时保留未溢出轴向的居中效果。
 */
function useStageViewportOverflowState(
  viewportContentSize: Ref<StageViewportContentSize>,
  frameSize: ComputedRef<StageViewportFrameSize>,
) {
  /** 当前画布是否在水平方向超出可用区。 */
  const isHorizontalOverflowing = computed(
    () => frameSize.value.width > viewportContentSize.value.width + SCALE_COMPARE_EPSILON,
  );

  /** 当前画布是否在垂直方向超出可用区。 */
  const isVerticalOverflowing = computed(
    () => frameSize.value.height > viewportContentSize.value.height + SCALE_COMPARE_EPSILON,
  );

  /** 当前视口是否需要开放局部滚动以承载放大后的画布。 */
  const shouldAllowViewportScroll = computed(
    () => isHorizontalOverflowing.value || isVerticalOverflowing.value,
  );

  /** 承载画布外框的内层容器样式，同时负责非溢出方向的居中对齐。 */
  const canvasBackdropStyle = computed<CSSProperties>(() => ({
    width: `${Math.max(viewportContentSize.value.width, frameSize.value.width)}px`,
    height: `${Math.max(viewportContentSize.value.height, frameSize.value.height)}px`,
    justifyItems: isHorizontalOverflowing.value ? "start" : "center",
    alignItems: isVerticalOverflowing.value ? "start" : "center",
  }));

  return {
    canvasBackdropStyle,
    shouldAllowViewportScroll,
  };
}

/**
 * 统一管理编辑态 / 预览态的画布适配缩放逻辑。
 * 组件只需要提供真实可用区节点和当前 slide 尺寸，就能得到稳定的缩放结果。
 */
export function useStageViewportFit(options: StageViewportFitOptions) {
  /** 当前真实可用区的内容尺寸。 */
  const { refreshViewportContentSize, viewportContentSize } =
    useObservedViewportContentSize(options.viewportRef);

  /** 当前适配模式下的等比缩放比例。 */
  const fitScale = computed(() => {
    const slideSize = options.slideSize.value;
    if (
      !slideSize ||
      viewportContentSize.value.width <= 0 ||
      viewportContentSize.value.height <= 0
    ) {
      return 1;
    }

    const widthScale = viewportContentSize.value.width / slideSize.width;
    const heightScale = viewportContentSize.value.height / slideSize.height;
    return Math.min(1, widthScale, heightScale);
  });

  /** 当前缩放控制的所有响应式状态与操作。 */
  const {
    canZoomIn,
    canZoomOut,
    canvasScale,
    fitScalePercent,
    isActualSizeZoom,
    isFitZoom,
    scalePercent,
    zoomIn,
    zoomMode,
    zoomOut,
    zoomToActualSize,
    zoomToFit,
  } = useStageViewportZoomState(fitScale);

  /** 缩放后外框尺寸，用来让布局高度和真实显示尺寸保持一致。 */
  const frameSize = computed(() => resolveFrameSize(options.slideSize.value, canvasScale.value));

  /** 基于当前外框尺寸计算内层承载容器的布局策略。 */
  const { canvasBackdropStyle, shouldAllowViewportScroll } = useStageViewportOverflowState(
    viewportContentSize,
    frameSize,
  );

  /** 缩放后外框尺寸，用来让布局高度和真实显示尺寸保持一致。 */
  const canvasFrameStyle = computed<CSSProperties>(() => {
    return {
      width: `${frameSize.value.width}px`,
      height: `${frameSize.value.height}px`,
    };
  });

  /** 实际渲染层仍保留原始尺寸，只通过 transform 执行缩放。 */
  const canvasSurfaceStyle = computed<CSSProperties>(() => {
    const slideSize = options.slideSize.value;
    if (!slideSize) {
      return {};
    }

    return {
      width: `${slideSize.width}px`,
      height: `${slideSize.height}px`,
      transform: `scale(${canvasScale.value})`,
      transformOrigin: "top left",
    };
  });

  return {
    canZoomIn,
    canZoomOut,
    canvasBackdropStyle,
    canvasFrameStyle,
    canvasScale,
    canvasSurfaceStyle,
    fitScalePercent,
    isActualSizeZoom,
    isFitZoom,
    refreshViewportContentSize,
    scalePercent,
    shouldAllowViewportScroll,
    viewportContentSize,
    zoomIn,
    zoomMode,
    zoomOut,
    zoomToActualSize,
    zoomToFit,
  };
}
