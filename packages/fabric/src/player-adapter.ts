import {
  Canvas,
  type FabricObject,
} from "fabric";
import {
  type AnimationKind,
  type CoursewareDocument,
  type CoursewareNode,
  type EasingName,
  type PlaybackState,
  type Slide,
  type StepTrigger,
  type TimelineAction,
  type TimelineStep,
} from "@canvas-courseware/core";
import {
  createFabricNodeObject,
  type FabricRenderableObject,
} from "./object-factory";

type FabricPlaybackObject = FabricRenderableObject & {
  getScaledWidth?: () => number;
  getScaledHeight?: () => number;
};

export interface FabricPlayerAdapterOptions {
  document?: CoursewareDocument | null;
  slideId?: string | null;
  bindCanvasClick?: boolean;
  enableAutoTrigger?: boolean;
}

export interface FabricPlayerMountOptions {
  canvasElement: HTMLCanvasElement;
  document?: CoursewareDocument | null;
  slideId?: string | null;
}

export interface FabricPlayerAdapterState {
  document: CoursewareDocument | null;
  slideId: string | null;
  stepIndex: number;
  status: PlaybackState["status"];
  nextTrigger: StepTrigger["type"] | null;
}

export type FabricPlayerStateListener = (state: FabricPlayerAdapterState) => void;

export class FabricPlayerAdapter {
  private canvas: Canvas | null = null;
  private document: CoursewareDocument | null;
  private currentSlideId: string | null;
  private readonly bindCanvasClick: boolean;
  private readonly enableAutoTrigger: boolean;
  private readonly objectMap = new Map<string, FabricPlaybackObject>();
  private readonly objectNodeMap = new WeakMap<FabricObject, string>();
  private readonly listeners = new Set<FabricPlayerStateListener>();
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private syncVersion = 0;
  private state: FabricPlayerAdapterState;

  constructor(options: FabricPlayerAdapterOptions = {}) {
    this.document = options.document ?? null;
    this.currentSlideId = options.slideId ?? options.document?.slides[0]?.id ?? null;
    this.bindCanvasClick = options.bindCanvasClick ?? true;
    this.enableAutoTrigger = options.enableAutoTrigger ?? true;
    this.state = {
      document: this.document,
      slideId: this.currentSlideId,
      stepIndex: 0,
      status: "idle",
      nextTrigger: null,
    };
  }

  getCanvas(): Canvas | null {
    return this.canvas;
  }

  getState(): FabricPlayerAdapterState {
    return this.state;
  }

  subscribe(listener: FabricPlayerStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async mount(options: FabricPlayerMountOptions): Promise<void> {
    await this.disposeCanvas();

    this.document = options.document ?? this.document;
    this.currentSlideId =
      options.slideId ?? this.currentSlideId ?? this.document?.slides[0]?.id ?? null;

    this.canvas = new Canvas(options.canvasElement, {
      preserveObjectStacking: true,
      selection: false,
      skipTargetFind: true,
      backgroundColor: "#FFFFFF",
    });

    if (this.bindCanvasClick) {
      this.canvas.on("mouse:down", (event) => {
        void this.handlePointerDown(event.target ?? null);
      });
    }

    await this.reset();
  }

  async setDocument(document: CoursewareDocument | null): Promise<void> {
    this.document = document;
    this.currentSlideId = document ? this.resolveNextSlideId(document, this.currentSlideId) : null;
    await this.reset();
  }

  async setSlideId(slideId: string | null): Promise<void> {
    this.currentSlideId = slideId;
    await this.reset();
  }

  /**
   * 把预览定位到指定步骤之前的状态。
   * 这里会先回到初始画面，再即时应用目标步骤之前的所有动作，
   * 让“从当前步骤开始预览”可以直接看到正确的前置场景。
   */
  async seekToStep(stepIndex: number, slideId?: string | null): Promise<FabricPlayerAdapterState> {
    if (slideId !== undefined) {
      this.currentSlideId = slideId;
    }

    await this.reset();
    this.clearAutoTimer();
    this.syncTriggerAffordance(null);

    const slide = this.getCurrentSlide();
    if (!slide) {
      return this.state;
    }

    const targetStepIndex = clampStepIndex(stepIndex, slide.timeline.steps.length);
    if (targetStepIndex === 0) {
      return this.state;
    }

    const version = this.syncVersion;

    for (let index = 0; index < targetStepIndex; index += 1) {
      const targetStep = slide.timeline.steps[index];
      if (!targetStep) {
        break;
      }

      await this.executeStep(slide, targetStep, version, {
        instant: true,
      });

      if (version !== this.syncVersion) {
        return this.state;
      }
    }

    this.setState({
      ...this.state,
      slideId: slide.id,
      stepIndex: targetStepIndex,
      status: "idle",
      nextTrigger: null,
    });

    this.updateWaitingState(version);
    return this.state;
  }

  async reset(): Promise<FabricPlayerAdapterState> {
    this.clearAutoTimer();

    const canvas = this.canvas;
    const slide = this.getCurrentSlide();
    const version = ++this.syncVersion;

    if (!canvas || !slide) {
      this.objectMap.clear();
      this.syncTriggerAffordance(null);
      this.setState({
        document: this.document,
        slideId: this.currentSlideId,
        stepIndex: 0,
        status: slide ? "idle" : "completed",
        nextTrigger: null,
      });

      if (canvas) {
        canvas.clear();
        canvas.backgroundColor = "#FFFFFF";
        canvas.requestRenderAll();
      }

      return this.state;
    }

    await this.renderSlide(canvas, slide, version);

    if (version !== this.syncVersion) {
      return this.state;
    }

    this.setState({
      document: this.document,
      slideId: slide.id,
      stepIndex: 0,
      status: "idle",
      nextTrigger: null,
    });

    this.updateWaitingState(version);
    return this.state;
  }

  /**
   * 处理预览画布上的点击事件。
   * 这里会根据下一步的 trigger 类型决定是接受页面点击，还是只接受特定对象点击。
   */
  async handlePointerDown(target: FabricObject | null): Promise<boolean> {
    const nextStep = this.getNextStep();

    if (!nextStep) {
      return false;
    }

    if (nextStep.trigger.type === "page-click") {
      return this.playNextStep(true);
    }

    if (nextStep.trigger.type === "node-click") {
      const targetNodeId = this.resolveNodeIdForTarget(target);

      if (!targetNodeId || targetNodeId !== nextStep.trigger.targetId) {
        return false;
      }

      return this.playNextStep(true);
    }

    return false;
  }

  async playNextStep(force = false): Promise<boolean> {
    const slide = this.getCurrentSlide();
    const nextStep = this.getNextStep();
    const version = this.syncVersion;

    if (!slide || !nextStep) {
      this.syncTriggerAffordance(null);
      this.setState({
        ...this.state,
        status: "completed",
        nextTrigger: null,
      });
      return false;
    }

    if (!force && nextStep.trigger.type === "auto") {
      return false;
    }

    this.clearAutoTimer();
    this.syncTriggerAffordance(null);
    this.setState({
      ...this.state,
      status: "playing",
      nextTrigger: null,
    });

    await this.executeStep(slide, nextStep, version);

    if (version !== this.syncVersion) {
      return false;
    }

    this.setState({
      ...this.state,
      stepIndex: this.state.stepIndex + 1,
      status: "idle",
      nextTrigger: null,
    });

    this.updateWaitingState(version);
    return true;
  }

  async dispose(): Promise<void> {
    this.clearAutoTimer();
    this.listeners.clear();
    await this.disposeCanvas();
    this.document = null;
    this.currentSlideId = null;
    this.syncTriggerAffordance(null);
    this.setState({
      document: null,
      slideId: null,
      stepIndex: 0,
      status: "completed",
      nextTrigger: null,
    });
  }

  private async disposeCanvas(): Promise<void> {
    this.syncVersion += 1;
    this.objectMap.clear();

    if (!this.canvas) {
      return;
    }

    const canvas = this.canvas;
    this.canvas = null;
    await canvas.dispose();
  }

  private getCurrentSlide(): Slide | undefined {
    if (!this.document) {
      return undefined;
    }

    const slideId = this.currentSlideId ?? this.document.slides[0]?.id;
    return slideId
      ? this.document.slides.find((slide) => slide.id === slideId)
      : undefined;
  }

  private getNextStep(): TimelineStep | undefined {
    const slide = this.getCurrentSlide();
    return slide?.timeline.steps[this.state.stepIndex];
  }

  private updateWaitingState(version: number): void {
    if (version !== this.syncVersion) {
      return;
    }

    const nextStep = this.getNextStep();

    if (!nextStep) {
      this.syncTriggerAffordance(null);
      this.setState({
        ...this.state,
        status: "completed",
        nextTrigger: null,
      });
      return;
    }

    if (nextStep.trigger.type === "page-click" || nextStep.trigger.type === "node-click") {
      this.syncTriggerAffordance(nextStep);
      this.setState({
        ...this.state,
        status: "paused",
        nextTrigger: nextStep.trigger.type,
      });
      return;
    }

    this.syncTriggerAffordance(null);
    this.setState({
      ...this.state,
      status: "playing",
      nextTrigger: "auto",
    });
    this.scheduleAutoStep(nextStep.trigger.delayMs, version);
  }

  private scheduleAutoStep(delayMs: number, version: number): void {
    if (!this.enableAutoTrigger) {
      return;
    }

    this.clearAutoTimer();
    this.autoTimer = setTimeout(() => {
      if (version !== this.syncVersion) {
        return;
      }

      void this.playNextStep(true);
    }, delayMs);
  }

  private clearAutoTimer(): void {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }

  private async renderSlide(canvas: Canvas, slide: Slide, version: number): Promise<void> {
    this.objectMap.clear();
    canvas.clear();
    this.syncCanvasFrame(canvas, slide);

    const objects: FabricPlaybackObject[] = [];

    for (const node of slide.nodes) {
      const object = await this.createObjectForNode(node);

      if (version !== this.syncVersion || !this.canvas) {
        return;
      }

      objects.push(object);
      this.objectMap.set(node.id, object);
      this.objectNodeMap.set(object, node.id);
    }

    if (objects.length > 0) {
      canvas.add(...objects);
    }

    canvas.requestRenderAll();
  }

  /**
   * 根据当前等待中的 trigger 更新画布与对象的点击提示。
   * page-click 会让画布整体可点击，node-click 则只激活目标对象。
   */
  private syncTriggerAffordance(nextStep: TimelineStep | null): void {
    if (!this.canvas) {
      return;
    }

    const shouldFindTarget = nextStep?.trigger.type === "node-click";
    this.canvas.skipTargetFind = !shouldFindTarget;
    this.canvas.defaultCursor = nextStep?.trigger.type === "page-click" ? "pointer" : "default";
    this.canvas.hoverCursor = this.canvas.defaultCursor;

    for (const [nodeId, object] of this.objectMap.entries()) {
      const isNodeClickTarget =
        nextStep?.trigger.type === "node-click" && nextStep.trigger.targetId === nodeId;

      object.evented = isNodeClickTarget;
      object.hoverCursor = isNodeClickTarget ? "pointer" : "default";
      object.moveCursor = object.hoverCursor;
    }

    this.canvas.requestRenderAll();
  }

  /**
   * 从 Fabric 点击目标里反查当前节点 id。
   * 这个映射只在播放器内部使用，不会泄漏到 UI 层。
   */
  private resolveNodeIdForTarget(target: FabricObject | null): string | null {
    if (!target) {
      return null;
    }

    return this.objectNodeMap.get(target) ?? null;
  }

  private syncCanvasFrame(canvas: Canvas, slide: Slide): void {
    canvas.setDimensions({
      width: slide.size.width,
      height: slide.size.height,
    });
    canvas.backgroundColor = slide.background.fill;
  }

  private async executeStep(
    slide: Slide,
    step: TimelineStep,
    version: number,
    options: {
      instant: boolean;
    } = {
      instant: false,
    },
  ): Promise<void> {
    for (const action of step.actions) {
      if (version !== this.syncVersion) {
        return;
      }

      await this.executeAction(slide, action, version, options);
    }
  }

  private async executeAction(
    slide: Slide,
    action: TimelineAction,
    version: number,
    options: {
      instant: boolean;
    },
  ): Promise<void> {
    switch (action.type) {
      case "show-node": {
        const object = this.objectMap.get(action.targetId);
        const node = findNode(slide, action.targetId);

        if (!object || !node) {
          return;
        }

        if (action.animationId) {
          await this.playAnimation(slide, action.animationId, {
            reveal: true,
            version,
            instant: options.instant,
          });
        } else {
          applyNodeState(object, node);
          object.visible = true;
          this.canvas?.requestRenderAll();
        }
        return;
      }

      case "hide-node": {
        const object = this.objectMap.get(action.targetId);
        if (!object) {
          return;
        }

        object.visible = false;
        this.canvas?.discardActiveObject();
        this.canvas?.requestRenderAll();
        return;
      }

      case "play-animation":
        await this.playAnimation(slide, action.animationId, {
          reveal: false,
          version,
          instant: options.instant,
        });
        return;

      default:
        return;
    }
  }

  private async playAnimation(
    slide: Slide,
    animationId: string,
    options: {
      reveal: boolean;
      version: number;
      instant: boolean;
    },
  ): Promise<void> {
    const animation = slide.timeline.animations.find((item) => item.id === animationId);

    if (!animation) {
      return;
    }

    const object = this.objectMap.get(animation.targetId);
    const node = findNode(slide, animation.targetId);

    if (!object || !node || options.version !== this.syncVersion) {
      return;
    }

    if (options.instant) {
      this.applyAnimationFinalState(object, node, animation, options.reveal);
      return;
    }

    if ((animation.delayMs ?? 0) > 0) {
      await sleep(animation.delayMs ?? 0);
      if (options.version !== this.syncVersion) {
        return;
      }
    }

    switch (animation.kind) {
      case "appear":
        this.playAppearAnimation(object, node, options.reveal);
        return;
      case "fade":
        await this.playFadeAnimation(object, node, animation, options.reveal);
        return;
      case "slide-up":
        await this.playSlideUpAnimation(object, node, animation, options.reveal);
        return;
      default:
        return;
    }
  }

  /** 以无动画的方式直接落到动画执行完成后的最终状态。 */
  private applyAnimationFinalState(
    object: FabricPlaybackObject,
    node: CoursewareNode,
    animation: {
      kind: AnimationKind;
    },
    reveal: boolean,
  ): void {
    switch (animation.kind) {
      case "appear":
        this.playAppearAnimation(object, node, reveal);
        return;
      case "fade":
        applyNodeState(object, node);

        if (!reveal && object.visible === false) {
          this.canvas?.requestRenderAll();
          return;
        }

        object.visible = true;
        object.opacity = node.opacity;
        object.setCoords?.();
        this.canvas?.requestRenderAll();
        return;
      case "slide-up":
        applyNodeState(object, node);
        object.visible = true;
        object.setCoords?.();
        this.canvas?.requestRenderAll();
        return;
      default:
        return;
    }
  }

  private playAppearAnimation(
    object: FabricPlaybackObject,
    node: CoursewareNode,
    reveal: boolean,
  ): void {
    applyNodeState(object, node);
    if (reveal || object.visible !== false) {
      object.visible = true;
    }
    this.canvas?.requestRenderAll();
  }

  private async playFadeAnimation(
    object: FabricPlaybackObject,
    node: CoursewareNode,
    animation: { durationMs: number; easing?: EasingName },
    reveal: boolean,
  ): Promise<void> {
    applyNodeState(object, node);

    if (reveal) {
      object.visible = true;
      object.opacity = 0;
    } else if (object.visible === false) {
      return;
    }

    this.canvas?.requestRenderAll();

    await animateNumber(object, "opacity", node.opacity, {
      duration: animation.durationMs,
      easing: resolveEasing(animation.easing),
      onChange: () => this.canvas?.requestRenderAll(),
    });

    object.opacity = node.opacity;
    object.visible = true;
    this.canvas?.requestRenderAll();
  }

  private async playSlideUpAnimation(
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

    applyNodeState(object, node);
    object.visible = true;
    object.top = node.y + offsetY;

    if (reveal) {
      object.opacity = 0;
    }

    object.setCoords?.();
    this.canvas?.requestRenderAll();

    await Promise.all([
      animateNumber(object, "top", node.y, {
        duration: animation.durationMs,
        easing: resolveEasing(animation.easing),
        onChange: () => {
          object.setCoords?.();
          this.canvas?.requestRenderAll();
        },
      }),
      animateNumber(object, "opacity", node.opacity, {
        duration: animation.durationMs,
        easing: resolveEasing(animation.easing),
        onChange: () => this.canvas?.requestRenderAll(),
      }),
    ]);

    applyNodeState(object, node);
    object.visible = true;
    object.setCoords?.();
    this.canvas?.requestRenderAll();
  }

  private async createObjectForNode(node: CoursewareNode): Promise<FabricPlaybackObject> {
    switch (node.type) {
      case "text":
        return (await createFabricNodeObject(node, {
          interactive: false,
        })) as FabricPlaybackObject;
      case "rect":
        return (await createFabricNodeObject(node, {
          interactive: false,
        })) as FabricPlaybackObject;
      case "image":
        return (await createFabricNodeObject(node, {
          interactive: false,
        })) as FabricPlaybackObject;
      default:
        throw new Error("Unsupported node type");
    }
  }

  private resolveNextSlideId(
    document: CoursewareDocument,
    preferredSlideId: string | null,
  ): string | null {
    if (preferredSlideId && document.slides.some((slide) => slide.id === preferredSlideId)) {
      return preferredSlideId;
    }

    return document.slides[0]?.id ?? null;
  }

  private setState(state: FabricPlayerAdapterState): void {
    this.state = state;

    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

function findNode(slide: Slide, nodeId: string): CoursewareNode | undefined {
  return slide.nodes.find((node) => node.id === nodeId);
}

function applyNodeState(object: FabricPlaybackObject, node: CoursewareNode): void {
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

function linear(timeElapsed: number, startValue: number, byValue: number, duration: number) {
  return startValue + (byValue * timeElapsed) / duration;
}

function easeIn(timeElapsed: number, startValue: number, byValue: number, duration: number) {
  const progress = timeElapsed / duration;
  return startValue + byValue * progress * progress * progress;
}

function easeOut(timeElapsed: number, startValue: number, byValue: number, duration: number) {
  const progress = timeElapsed / duration - 1;
  return startValue + byValue * (progress * progress * progress + 1);
}

function easeInOut(timeElapsed: number, startValue: number, byValue: number, duration: number) {
  let progress = timeElapsed / (duration / 2);

  if (progress < 1) {
    return startValue + (byValue / 2) * progress * progress * progress;
  }

  progress -= 2;
  return startValue + (byValue / 2) * (progress * progress * progress + 2);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function clampStepIndex(stepIndex: number, stepCount: number): number {
  return Math.min(Math.max(stepIndex, 0), stepCount);
}
