import type { ActiveSelection, Canvas, ModifiedEvent } from "fabric";
import type { FabricNodeObject } from "./editor-adapter-support";

/** 编辑态画布事件注册所需的回调集合。 */
interface RegisterEditorCanvasEventsHandlers {
  /** 统一处理选中态变化。 */
  emitSelectionChange: () => void;
  /** 在拖拽或缩放过程中记录当前目标节点。 */
  captureSelectionTarget: (target: FabricNodeObject | undefined) => void;
  /** 在拖拽过程中执行吸附与参考线反馈。 */
  handleObjectMoving: (target: FabricNodeObject | ActiveSelection | undefined) => void;
  /** 在对象变换完成后回写标准文档。 */
  handleObjectModified: (event: ModifiedEvent) => void;
  /** 清理拖拽过程中残留的对齐参考线。 */
  clearAlignmentGuides: () => void;
  /** 在文本输入过程中处理临时变更。 */
  handleTextChanged: (target: FabricNodeObject | undefined) => void;
  /** 在双击文本对象时进入画布内编辑态。 */
  handleTextDoubleClick: (target: FabricNodeObject | undefined, nativeEvent?: Event) => void;
  /** 在文本编辑进入时同步编辑态。 */
  handleTextEditingEntered: (target: FabricNodeObject | undefined) => void;
  /** 在文本编辑退出时提交最终文本。 */
  handleTextEditingExited: (target: FabricNodeObject | undefined) => void;
  /** 在右键菜单触发时同步目标对象与菜单请求。 */
  handleContextMenu: (
    target: FabricNodeObject | ActiveSelection | undefined,
    nativeEvent?: Event,
  ) => void;
}

/** 为编辑态 Fabric 画布统一注册选中、变换和文本编辑事件。 */
export function registerEditorCanvasEvents(
  canvas: Canvas,
  handlers: RegisterEditorCanvasEventsHandlers,
): void {
  canvas.on("selection:created", () => {
    handlers.clearAlignmentGuides();
    handlers.emitSelectionChange();
  });

  canvas.on("selection:updated", () => {
    handlers.clearAlignmentGuides();
    handlers.emitSelectionChange();
  });

  canvas.on("selection:cleared", () => {
    handlers.clearAlignmentGuides();
    handlers.emitSelectionChange();
  });

  /**
   * 变换过程先记录当前目标节点。
   * 这样即使 Fabric 中途抛出空选中，也能在短窗口内保住单选态。
   */
  canvas.on("object:moving", (event) => {
    handlers.captureSelectionTarget(event.target as FabricNodeObject | undefined);
    handlers.handleObjectMoving(event.target as FabricNodeObject | ActiveSelection | undefined);
  });

  canvas.on("object:scaling", (event) => {
    handlers.captureSelectionTarget(event.target as FabricNodeObject | undefined);
    handlers.clearAlignmentGuides();
  });

  canvas.on("object:rotating", (event) => {
    handlers.captureSelectionTarget(event.target as FabricNodeObject | undefined);
    handlers.clearAlignmentGuides();
  });

  canvas.on("object:modified", (event) => {
    handlers.clearAlignmentGuides();
    handlers.handleObjectModified(event);
  });

  canvas.on("mouse:up", () => {
    handlers.clearAlignmentGuides();
  });

  canvas.on("mouse:dblclick", (event) => {
    handlers.handleTextDoubleClick(event.target as FabricNodeObject | undefined, event.e);
  });

  canvas.on("text:changed", (event) => {
    handlers.handleTextChanged(event.target as FabricNodeObject | undefined);
  });

  canvas.on("text:editing:entered", (event) => {
    handlers.handleTextEditingEntered(event.target as FabricNodeObject | undefined);
  });

  canvas.on("text:editing:exited", (event) => {
    handlers.handleTextEditingExited(event.target as FabricNodeObject | undefined);
  });

  canvas.on("contextmenu", (event) => {
    handlers.clearAlignmentGuides();
    handlers.handleContextMenu(
      event.target as FabricNodeObject | ActiveSelection | undefined,
      event.e,
    );
  });
}
