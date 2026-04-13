import { Canvas, type FabricObject } from "fabric";
import type { CoursewareDocument } from "@canvas-courseware/core";
import {
  createFabricPlayerAdapterContext,
  type FabricPlayerAdapterContext,
} from "./player-adapter/context";
import { handlePlayerPointerDown, playNextPlayerStep, resetPlayerAdapter, seekPlayerToStep } from "./player-adapter/playback";
import { disposePlayerCanvas, syncTriggerAffordance } from "./player-adapter/rendering";
import {
  clearPlayerAutoTimer,
  resolveNextPlayerSlideId,
  setPlayerState,
} from "./player-adapter/state";
import type {
  FabricPlayerAdapterOptions,
  FabricPlayerAdapterState,
  FabricPlayerMountOptions,
  FabricPlayerStateListener,
} from "./player-adapter-types";

export type {
  FabricPlayerAdapterOptions,
  FabricPlayerAdapterState,
  FabricPlayerMountOptions,
  FabricPlayerStateListener,
} from "./player-adapter-types";

/** Fabric 播放态适配器，负责消费文档并按时间轴驱动画布播放。 */
export class FabricPlayerAdapter {
  /** 当前适配器的可变运行时上下文。 */
  private readonly context: FabricPlayerAdapterContext;

  constructor(options: FabricPlayerAdapterOptions = {}) {
    this.context = createFabricPlayerAdapterContext(options);
  }

  /** 读取当前 Fabric 画布实例。 */
  getCanvas(): Canvas | null {
    return this.context.canvas;
  }

  /** 读取当前播放器状态快照。 */
  getState(): FabricPlayerAdapterState {
    return this.context.state;
  }

  /** 订阅播放器状态变化。 */
  subscribe(listener: FabricPlayerStateListener): () => void {
    this.context.listeners.add(listener);
    return () => this.context.listeners.delete(listener);
  }

  /** 挂载 Fabric 画布并完成首次播放态重置。 */
  async mount(options: FabricPlayerMountOptions): Promise<void> {
    await disposePlayerCanvas(this.context);

    this.context.document = options.document ?? this.context.document;
    this.context.currentSlideId =
      options.slideId ??
      this.context.currentSlideId ??
      this.context.document?.slides[0]?.id ??
      null;

    this.context.canvas = new Canvas(options.canvasElement, {
      preserveObjectStacking: true,
      selection: false,
      skipTargetFind: true,
      backgroundColor: "#FFFFFF",
    });

    if (this.context.bindCanvasClick) {
      this.context.canvas.on("mouse:down", (event) => {
        void handlePlayerPointerDown(this.context, event.target ?? null);
      });
    }

    await resetPlayerAdapter(this.context);
  }

  /** 切换当前消费的文档，并保留尽可能稳定的页面上下文。 */
  async setDocument(document: CoursewareDocument | null): Promise<void> {
    this.context.document = document;
    this.context.currentSlideId = document
      ? resolveNextPlayerSlideId(document, this.context.currentSlideId)
      : null;
    await resetPlayerAdapter(this.context);
  }

  /** 切换当前预览页面，并回到该页面的初始播放状态。 */
  async setSlideId(slideId: string | null): Promise<void> {
    this.context.currentSlideId = slideId;
    await resetPlayerAdapter(this.context);
  }

  /** 把预览定位到指定步骤之前的状态。 */
  async seekToStep(
    stepIndex: number,
    slideId?: string | null,
  ): Promise<FabricPlayerAdapterState> {
    return seekPlayerToStep(this.context, stepIndex, slideId);
  }

  /** 重置当前预览页面到初始播放状态。 */
  async reset(): Promise<FabricPlayerAdapterState> {
    return resetPlayerAdapter(this.context);
  }

  /** 处理预览画布上的点击事件。 */
  async handlePointerDown(target: FabricObject | null): Promise<boolean> {
    return handlePlayerPointerDown(this.context, target);
  }

  /** 推进并执行当前等待中的下一步。 */
  async playNextStep(force = false): Promise<boolean> {
    return playNextPlayerStep(this.context, force);
  }

  /** 销毁当前播放器适配器并释放画布、订阅与内部状态。 */
  async dispose(): Promise<void> {
    clearPlayerAutoTimer(this.context);
    this.context.listeners.clear();
    await disposePlayerCanvas(this.context);
    this.context.document = null;
    this.context.currentSlideId = null;
    syncTriggerAffordance(this.context, null);
    setPlayerState(this.context, {
      document: null,
      slideId: null,
      stepIndex: 0,
      status: "completed",
      nextTrigger: null,
    });
  }
}
