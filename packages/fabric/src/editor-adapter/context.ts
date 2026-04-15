import type { Canvas, Line } from "fabric";
import type { EditorController, EditorSnapshot } from "@canvas-courseware/core";
import type { FabricNodeObject } from "../editor-adapter-support";
import type {
  FabricAutoSaveBlockReason,
  FabricEditorAdapterOptions,
  FabricEditorContextMenuRequest,
} from "../editor-adapter-types";

/** 编辑器对齐参考线的方向类型。 */
export type FabricAlignmentGuideOrientation = "vertical" | "horizontal";

/** 编辑器对齐参考线对象类型。 */
export type FabricAlignmentGuideLine = Line & {
  /** 对齐参考线方向元信息，仅用于调试与自动化断言。 */
  __coursewareAlignmentGuide?: FabricAlignmentGuideOrientation;
};

/** 编辑器适配器内部统一维护的可变运行时上下文。 */
export interface FabricEditorAdapterContext {
  /** 当前挂载的 Fabric 画布实例。 */
  canvas: Canvas | null;
  /** 当前绑定的编辑控制器。 */
  controller: EditorController | null;
  /** 当前快照订阅的释放函数。 */
  unsubscribeSnapshot: (() => void) | null;
  /** 当前激活的 slide id。 */
  currentSlideId: string | null;
  /** 节点 id 到 Fabric 对象的映射。 */
  readonly objectMap: Map<string, FabricNodeObject>;
  /** 当前是否处于内部同步阶段。 */
  isSyncing: boolean;
  /** 用于避免异步渲染串扰的同步版本号。 */
  syncVersion: number;
  /** 上一次参与渲染的文档引用。 */
  lastDocumentRef: EditorSnapshot["document"] | null;
  /** 上一次完成渲染的 slide id。 */
  lastRenderedSlideId: string | null;
  /** 最近一次需要保留的单选节点 id。 */
  retainedSelectionNodeId: string | null;
  /** 最近一次保留选中态的截止时间戳。 */
  retainedSelectionExpiresAt: number;
  /** 对象变换后的延迟重选计时器。 */
  selectionRestoreTimer: ReturnType<typeof setTimeout> | null;
  /** 当前自动保存暂缓原因。 */
  autoSaveBlockReason: FabricAutoSaveBlockReason | null;
  /** 当前自动保存暂缓原因的失效时间戳。 */
  autoSaveBlockExpiresAt: number;
  /** 当前正在渲染的竖向对齐参考线。 */
  alignmentVerticalGuide: FabricAlignmentGuideLine | null;
  /** 当前正在渲染的横向对齐参考线。 */
  alignmentHorizontalGuide: FabricAlignmentGuideLine | null;
  /** 适配层向 UI 层抛出的右键菜单回调。 */
  onContextMenuRequest?: (payload: FabricEditorContextMenuRequest) => void;
}

/** 创建编辑器适配器默认运行时上下文。 */
export function createFabricEditorAdapterContext(
  options: FabricEditorAdapterOptions = {},
): FabricEditorAdapterContext {
  return {
    canvas: null,
    controller: options.controller ?? null,
    unsubscribeSnapshot: null,
    currentSlideId: options.slideId ?? null,
    objectMap: new Map<string, FabricNodeObject>(),
    isSyncing: false,
    syncVersion: 0,
    lastDocumentRef: null,
    lastRenderedSlideId: null,
    retainedSelectionNodeId: null,
    retainedSelectionExpiresAt: 0,
    selectionRestoreTimer: null,
    autoSaveBlockReason: null,
    autoSaveBlockExpiresAt: 0,
    alignmentVerticalGuide: null,
    alignmentHorizontalGuide: null,
    onContextMenuRequest: options.onContextMenuRequest,
  };
}
