import {
  COMMAND_TYPES,
  createCoursewareDocument,
  describeEditorCommand,
  type DiagnosticLogContext,
  type DiagnosticLogLevel,
  type DiagnosticLogger,
  EditorController,
  type CoursewareDocument,
  type EditorSnapshot,
} from "@canvas-courseware/core";
import {
  FabricEditorAdapter,
  type FabricEditorContextMenuRequest,
  type FabricInlineTextEditingLayout,
} from "@canvas-courseware/fabric";
import { useEditorBatchLayout } from "./useEditorBatchLayout";
import { useEditorClipboardKeyboard } from "./useEditorClipboardKeyboard";
import { useEditorLocalImage } from "./useEditorLocalImage";
import { useEditorSlideManagement } from "./useEditorSlideManagement";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
} from "vue";
import { useCoursewareEditorCommandApi } from "./useCoursewareEditorCommandApi";

/** slide 缩略图导出时使用的缩放倍率，控制 data URL 体积。 */
const THUMBNAIL_CAPTURE_SCALE = 0.24;

/** slide 缩略图导出时使用的 JPEG 质量。 */
const THUMBNAIL_CAPTURE_QUALITY = 0.78;

/**
 * 编辑器 composable 的输入参数。
 * 当前只允许外部传入初始文档，后续可以继续扩展更多壳层配置。
 */
export interface UseCoursewareEditorOptions {
  /** 外部注入的初始课件文档。 */
  document?: CoursewareDocument;
  /** 当编辑区请求打开右键菜单时，向外层抛出菜单定位与命中信息。 */
  onContextMenuRequest?: (payload: FabricEditorContextMenuRequest) => void;
  /** 外部注入的统一诊断 logger。 */
  diagnosticLogger?: DiagnosticLogger | null;
}

/**
 * 封装 Vue 编辑器所需的 controller、Fabric 适配器和交互命令。
 * 这个 composable 负责把 UI 事件转成标准命令，但不直接操作 Fabric 对象。
 */
export function useCoursewareEditor(options: UseCoursewareEditorOptions = {}) {
  /** 编辑器 canvas 的模板引用。 */
  const editorCanvasRef = shallowRef<HTMLCanvasElement | null>(null);

  /** 编辑器控制器，统一收口所有标准命令。 */
  const controller = new EditorController();

  /** Fabric 编辑态适配器，用于把 snapshot 同步到画布。 */
  const adapter = new FabricEditorAdapter({
    controller,
    onContextMenuRequest: options.onContextMenuRequest,
  });

  /** 当前快照，UI 只订阅这份标准状态。 */
  const snapshot = shallowRef<EditorSnapshot>(controller.getSnapshot());

  /** 当前内联文本编辑态对应的浮层定位信息。 */
  const inlineTextEditingLayout = shallowRef<FabricInlineTextEditingLayout | null>(null);

  /** 标记当前是否正在应用外部文档，避免 v-model 回写时形成循环。 */
  const applyingExternalDocument = shallowRef(false);

  /** 初始化文档，若外部未传则自动创建一份空白课件。 */
  const initialDocument =
    options.document ??
    createCoursewareDocument({
      title: "Canvas Courseware Editor",
    });

  /** 组合当前命令日志需要的最小上下文，避免每条记录手工拼接。 */
  const buildDiagnosticContext = (
    nextSnapshot: EditorSnapshot,
    context: DiagnosticLogContext = {},
  ): DiagnosticLogContext => ({
    projectId: nextSnapshot.document.meta.id,
    activeSlideId: nextSnapshot.activeSlideId ?? null,
    ...context,
  });

  /** 按级别把一条结构化日志统一写入外部注入的 logger。 */
  const writeDiagnosticLog = (
    level: DiagnosticLogLevel,
    payload: {
      event: string;
      message: string;
      context?: DiagnosticLogContext;
    },
  ) => {
    if (!options.diagnosticLogger) {
      return;
    }

    switch (level) {
      case "debug":
        options.diagnosticLogger.debug(payload);
        break;
      case "warn":
        options.diagnosticLogger.warn(payload);
        break;
      case "error":
        options.diagnosticLogger.error(payload);
        break;
      case "info":
      default:
        options.diagnosticLogger.info(payload);
        break;
    }
  };

  controller.replaceDocument(initialDocument);
  snapshot.value = controller.getSnapshot();

  /** 当前激活的 slide，供画布和工具栏展示。 */
  const activeSlide = computed(() =>
    snapshot.value.document.slides.find((slide) => slide.id === snapshot.value.activeSlideId),
  );

  /** 当前首个选中的节点 id，属性面板和图层面板都会基于它展开。 */
  const selectedNodeId = computed(() => snapshot.value.selection.nodeIds[0] ?? null);

  /** 当前首个选中的节点对象。 */
  const selectedNode = computed(() =>
    activeSlide.value?.nodes.find((node) => node.id === selectedNodeId.value),
  );

  /** 顶部统计信息，方便 UI 直接读取。 */
  const stats = computed(() => ({
    slideCount: snapshot.value.document.slides.length,
    nodeCount: snapshot.value.document.slides.reduce(
      (sum, slide) => sum + slide.nodes.length,
      0,
    ),
    stepCount: snapshot.value.document.slides.reduce(
      (sum, slide) => sum + slide.timeline.steps.length,
      0,
    ),
  }));

  /** 当前撤销/重做可用状态摘要。 */
  const historyState = shallowRef(controller.getHistoryState());

  /** 开发态调试面板暴露给浏览器脚本的最小编辑器能力集合。 */
  type CoursewareEditorDebugBridge = {
    /** 读取当前 Fabric 编辑态画布实例，便于自动化定位真实控制点。 */
    getCanvas: () => ReturnType<FabricEditorAdapter["getCanvas"]>;
    /** 读取标准命令类型常量，供自动化脚本复用统一协议值。 */
    getCommandTypes: () => typeof COMMAND_TYPES;
    /** 读取最新标准快照，便于自动化和调试核对文档状态。 */
    getSnapshot: () => EditorSnapshot;
    /** 读取编辑态适配器实例，便于开发态核对同步状态。 */
    getAdapter: () => FabricEditorAdapter;
    /** 读取标准控制器实例，便于开发态跟踪命令回写。 */
    getController: () => EditorController;
  };

  /** 浏览器开发态下挂到 `window` 的调试入口键名。 */
  const EDITOR_DEBUG_KEY = "__CW_EDITOR_DEBUG__" as const;

  /** 仅在开发态暴露最小调试桥，避免生产环境泄漏内部实现。 */
  const attachEditorDebugBridge = () => {
    if (!import.meta.env.DEV || typeof window === "undefined") {
      return;
    }

    const debugBridge: CoursewareEditorDebugBridge = {
      getCanvas: () => adapter.getCanvas(),
      getCommandTypes: () => COMMAND_TYPES,
      getSnapshot: () => snapshot.value,
      getAdapter: () => adapter,
      getController: () => controller,
    };

    (window as Window & {
      [EDITOR_DEBUG_KEY]?: CoursewareEditorDebugBridge;
    })[EDITOR_DEBUG_KEY] = debugBridge;
  };

  /** 组件卸载时同步回收开发态调试桥，避免跨页面残留旧实例。 */
  const detachEditorDebugBridge = () => {
    if (!import.meta.env.DEV || typeof window === "undefined") {
      return;
    }

    delete (window as Window & {
      [EDITOR_DEBUG_KEY]?: CoursewareEditorDebugBridge;
    })[EDITOR_DEBUG_KEY];
  };

  /** 当前是否允许执行撤销。 */
  const canUndo = computed(() => historyState.value.canUndo);

  /** 当前是否允许执行重做。 */
  const canRedo = computed(() => historyState.value.canRedo);

  /** 组合标准命令派发能力，避免壳层文件继续堆积细碎的命令封装。 */
  const {
    activateSlide,
    addRect,
    addText,
    clearSelection,
    redo,
    removeSelected,
    removeTimelineAnimation,
    removeTimelineStep,
    reorderNode,
    reorderTimelineStep,
    replaceDocument,
    selectNodes,
    undo,
    updateNode,
    updateSlide,
    upsertTimelineAnimation,
    upsertTimelineStep,
  } = useCoursewareEditorCommandApi({
    controller,
    snapshot,
    activeSlide,
    applyingExternalDocument,
  });

  /** 组合复制粘贴、重复、方向键微调与快捷键处理能力。 */
  const {
    copySelected,
    duplicateSelected,
    handleEditorKeydown,
    nudgeSelectedNodes,
    pasteClipboard,
  } = useEditorClipboardKeyboard({
    snapshot,
    activeSlide,
    controller,
  });

  /** 组合多选后的批量排版能力。 */
  const {
    alignSelectedNodes,
    distributeSelectedNodes,
  } = useEditorBatchLayout({
    snapshot,
    activeSlide,
    controller,
  });

  /**
   * 在 canvas DOM 可用之后挂载 Fabric 适配器。
   * 这一步只做挂载，不直接改动业务文档。
   */
  const mountAdapter = async () => {
    if (!editorCanvasRef.value) {
      return;
    }

    await adapter.mount({
      canvasElement: editorCanvasRef.value,
      slideId: snapshot.value.activeSlideId ?? undefined,
    });
  };

  /** 请求适配层结束当前画布内的文本编辑态，供外层点击非画布区域时复用。 */
  const requestInlineTextEditingExit = () => {
    adapter.exitActiveTextEditing();
  };

  /** 重新读取当前文本内联工具条的定位信息，供布局变化后复用。 */
  const refreshInlineTextEditingLayout = () => {
    inlineTextEditingLayout.value = adapter.getInlineTextEditingLayout();
  };

  /** 导出当前激活页的缩略图 data URL，供应用层持久化页面封面。 */
  const captureActiveSlideThumbnail = async (): Promise<string | null> => {
    if (!activeSlide.value) {
      return null;
    }

    /**
     * 截图前先强制把当前 snapshot 同步到 Fabric 画布，
     * 避免“刚完成编辑就立即保存”时导出的仍是旧内容。
     */
    await adapter.sync();
    const canvas = adapter.getCanvas();
    if (!canvas) {
      return null;
    }

    return canvas.toDataURL({
      format: "jpeg",
      quality: THUMBNAIL_CAPTURE_QUALITY,
      multiplier: THUMBNAIL_CAPTURE_SCALE,
    });
  };

  /** 订阅 controller 快照变化，让 Vue 层保持响应式同步。 */
  const unsubscribe = controller.subscribe((nextSnapshot, envelope) => {
    snapshot.value = nextSnapshot;

    const commandDiagnostic = describeEditorCommand(envelope.command);
    if (!commandDiagnostic) {
      return;
    }

    writeDiagnosticLog(commandDiagnostic.level, {
      event: commandDiagnostic.event,
      message: commandDiagnostic.message,
      context: buildDiagnosticContext(nextSnapshot, {
        commandId: envelope.id,
        commandType: envelope.command.type,
        commandSource: envelope.source,
        ...commandDiagnostic.context,
      }),
    });
  });

  /** 订阅适配层事件，统一刷新文本内联工具条的显隐与定位。 */
  const unsubscribeAdapterEvent = controller.subscribeAdapterEvent((event) => {
    switch (event.type) {
      case "adapter.text.editing.entered":
      case "adapter.text.editing.exited":
        refreshInlineTextEditingLayout();
        break;
      default:
        break;
    }
  });

  /** 订阅撤销/重做历史状态变化，供工具栏按钮直接消费。 */
  const unsubscribeHistoryState = controller.subscribeHistoryState((nextHistoryState) => {
    historyState.value = nextHistoryState;
  });

  /**
   * 当激活 slide 变化时，通知 Fabric 适配器切页。
   * 这样 UI 层不需要持有任何 Fabric 画布对象。
   */
  watch(
    () => snapshot.value.activeSlideId,
    (slideId) => {
      inlineTextEditingLayout.value = null;
      void adapter.setSlideId(slideId);
    },
  );

  /** 当文本样式在编辑中被调整后，重新计算浮层位置，避免字号变化后错位。 */
  watch(
    () => snapshot.value.document,
    () => {
      if (!inlineTextEditingLayout.value) {
        return;
      }

      queueMicrotask(() => {
        refreshInlineTextEditingLayout();
      });
    },
  );

  /** 组件挂载后再真正连接画布。 */
  onMounted(() => {
    void mountAdapter();
    attachEditorDebugBridge();
    window.addEventListener("keydown", handleEditorKeydown);
  });

  /** 组件卸载时销毁适配器和订阅，避免内存泄漏。 */
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleEditorKeydown);
    detachEditorDebugBridge();
    unsubscribe();
    unsubscribeAdapterEvent();
    unsubscribeHistoryState();
    void adapter.dispose();
  });

  /** 组合页面新增、复制、删除和拖拽排序能力。 */
  const {
    addSlide,
    addSlideAfter,
    duplicateSlideById,
    removeSlide,
    reorderSlide,
  } = useEditorSlideManagement({
    controller,
    snapshot,
    activeSlide,
  });

  /** 组合本地图片导入能力，统一转换成标准图片节点命令。 */
  const {
    addImageFromFile,
    replaceImageFromFile,
    setSlideBackgroundImageFromNode,
  } = useEditorLocalImage({
    snapshot,
    controller,
    activeSlide,
    diagnosticLogger: options.diagnosticLogger,
  });

  return {
    activeSlide,
    adapter,
    addImageFromFile,
    setSlideBackgroundImageFromNode,
    replaceImageFromFile,
    addRect,
    addSlide,
    addSlideAfter,
    addText,
    alignSelectedNodes,
    applyingExternalDocument,
    canRedo,
    canUndo,
    captureActiveSlideThumbnail,
    controller,
    clearSelection,
    copySelected,
    duplicateSelected,
    editorCanvasRef,
    inlineTextEditingLayout,
    mountAdapter,
    nudgeSelectedNodes,
    pasteClipboard,
    redo,
    refreshInlineTextEditingLayout,
    removeSlide,
    reorderNode,
    reorderSlide,
    removeSelected,
    removeTimelineAnimation,
    removeTimelineStep,
    reorderTimelineStep,
    requestInlineTextEditingExit,
    replaceDocument,
    selectedNode,
    selectedNodeId,
    selectNodes,
    snapshot,
    stats,
    undo,
    duplicateSlideById,
    distributeSelectedNodes,
    activateSlide,
    upsertTimelineAnimation,
    upsertTimelineStep,
    updateNode,
    updateSlide,
  };
}
