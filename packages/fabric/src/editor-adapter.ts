import { Canvas } from "fabric";
import type { EditorController } from "@canvas-courseware/core";
import { registerEditorCanvasEvents } from "./editor-canvas-events";
import {
  createFabricEditorAdapterContext,
  type FabricEditorAdapterContext,
} from "./editor-adapter/context";
import { disposeEditorCanvas, syncEditorSnapshot } from "./editor-adapter/rendering";
import {
  captureSelectionTarget,
  emitEditorSelectionChange,
  handleEditorContextMenu,
  handleEditorObjectModified,
} from "./editor-adapter/selection";
import {
  exitActiveTextEditing,
  getInlineTextEditingLayout,
  handleEditorTextChanged,
  handleEditorTextDoubleClick,
  handleEditorTextEditingEntered,
  handleEditorTextEditingExited,
} from "./editor-adapter/text-editing";
import type {
  FabricEditorAdapterMountOptions,
  FabricEditorAdapterOptions,
  FabricInlineTextEditingLayout,
} from "./editor-adapter-types";

export type {
  FabricEditorAdapterMountOptions,
  FabricEditorAdapterOptions,
  FabricEditorContextMenuRequest,
  FabricInlineTextEditingLayout,
} from "./editor-adapter-types";

/**
 * 略微放大画布的目标命中容差，帮助缩放控制点在自动化和真实鼠标操作里更容易命中。
 * 这里保持一个很小的数值，避免把普通点击误识别成对象操作。
 */
const EDITOR_TARGET_FIND_TOLERANCE = 6;

/** Fabric 编辑态适配器，负责把控制器快照映射为编辑画布。 */
export class FabricEditorAdapter {
  /** 当前适配器的可变运行时上下文。 */
  private readonly context: FabricEditorAdapterContext;

  constructor(options: FabricEditorAdapterOptions = {}) {
    this.context = createFabricEditorAdapterContext(options);

    if (options.controller) {
      this.bindController(options.controller);
    }
  }

  /** 绑定编辑控制器，并在后续快照变化时触发画布同步。 */
  bindController(controller: EditorController): void {
    this.context.unsubscribeSnapshot?.();
    this.context.controller = controller;
    this.context.unsubscribeSnapshot = controller.subscribe((snapshot) => {
      void syncEditorSnapshot(this.context, snapshot);
    });

    if (this.context.canvas) {
      void syncEditorSnapshot(this.context, controller.getSnapshot());
    }
  }

  /** 读取当前 Fabric 画布实例。 */
  getCanvas(): Canvas | null {
    return this.context.canvas;
  }

  /** 读取当前激活的 slide id。 */
  getSlideId(): string | null {
    return this.context.currentSlideId;
  }

  /** 当用户点击非画布区域时，主动结束当前文本对象的内联编辑态。 */
  exitActiveTextEditing(): void {
    exitActiveTextEditing(this.context);
  }

  /** 读取当前内联文本编辑态的浮层定位信息。 */
  getInlineTextEditingLayout(): FabricInlineTextEditingLayout | null {
    return getInlineTextEditingLayout(this.context);
  }

  /** 挂载 Fabric 画布并注册编辑态事件。 */
  async mount(options: FabricEditorAdapterMountOptions): Promise<void> {
    await disposeEditorCanvas(this.context);

    this.context.currentSlideId =
      options.slideId ??
      this.context.currentSlideId ??
      this.context.controller?.getSnapshot().activeSlideId ??
      null;

    this.context.canvas = new Canvas(options.canvasElement, {
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: "#FFFFFF",
      targetFindTolerance: EDITOR_TARGET_FIND_TOLERANCE,
      fireRightClick: true,
      stopContextMenu: true,
    });

    registerEditorCanvasEvents(this.context.canvas, {
      emitSelectionChange: () => emitEditorSelectionChange(this.context),
      captureSelectionTarget: (target) => captureSelectionTarget(this.context, target),
      handleObjectModified: (event) => handleEditorObjectModified(this.context, event),
      handleTextChanged: (target) => handleEditorTextChanged(this.context, target),
      handleTextDoubleClick: (target, nativeEvent) =>
        handleEditorTextDoubleClick(this.context, target, nativeEvent),
      handleTextEditingEntered: (target) =>
        handleEditorTextEditingEntered(this.context, target),
      handleTextEditingExited: (target) =>
        handleEditorTextEditingExited(this.context, target),
      handleContextMenu: (target, nativeEvent) =>
        handleEditorContextMenu(this.context, target, nativeEvent),
    });

    if (this.context.controller) {
      const snapshot = this.context.controller.getSnapshot();
      await syncEditorSnapshot(this.context, snapshot);

      const readySlideId = this.context.currentSlideId ?? snapshot.activeSlideId;
      if (readySlideId) {
        this.context.controller.handleAdapterEvent({
          type: "adapter.ready",
          slideId: readySlideId,
        });
      }
    }
  }

  /** 切换当前激活页面，并立即同步对应画布内容。 */
  async setSlideId(slideId: string | null): Promise<void> {
    this.context.currentSlideId = slideId;
    await this.sync();
  }

  /** 主动把最新控制器快照同步到当前 Fabric 画布。 */
  async sync(): Promise<void> {
    if (!this.context.controller) {
      return;
    }

    await syncEditorSnapshot(this.context, this.context.controller.getSnapshot());
  }

  /** 销毁当前编辑适配器并释放画布、订阅与内部状态。 */
  async dispose(): Promise<void> {
    this.context.unsubscribeSnapshot?.();
    this.context.unsubscribeSnapshot = null;
    this.context.controller = null;
    await disposeEditorCanvas(this.context);
  }
}
