import {
  createId,
  createCoursewareDocument,
  createImageNode,
  createRectNode,
  createSlide,
  createTextNode,
  EditorController,
  type CoursewareNode,
  type CoursewareDocument,
  type EditorSnapshot,
  type NodeAnimation,
  type NodePatch,
  type ReorderPosition,
  type Slide,
  type TimelineStep,
} from "@canvas-courseware/core";
import { FabricEditorAdapter } from "@canvas-courseware/fabric";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

/**
 * 编辑器 composable 的输入参数。
 * 当前只允许外部传入初始文档，后续可以继续扩展更多壳层配置。
 */
export interface UseCoursewareEditorOptions {
  /** 外部注入的初始课件文档。 */
  document?: CoursewareDocument;
}

/** 快捷键中的微调步长。 */
const KEYBOARD_NUDGE_DISTANCE = 1;

/** 快捷键中的大步移动步长。 */
const KEYBOARD_LARGE_NUDGE_DISTANCE = 10;

/** 复制粘贴时每次新增的默认偏移量。 */
const KEYBOARD_PASTE_OFFSET = 24;

/** 画布快捷键可复用的复制数据结构。 */
interface EditorClipboardState {
  /** 复制来源页面 id。 */
  sourceSlideId: string;
  /** 复制得到的节点快照。 */
  nodes: CoursewareNode[];
}

/**
 * 封装 Vue 编辑器所需的 controller、Fabric 适配器和交互命令。
 * 这个 composable 负责把 UI 事件转成标准命令，但不直接操作 Fabric 对象。
 */
export function useCoursewareEditor(options: UseCoursewareEditorOptions = {}) {
  /** 编辑器 canvas 的模板引用。 */
  const editorCanvasRef = useTemplateRef<HTMLCanvasElement>("editorCanvasRef");

  /** 编辑器控制器，统一收口所有标准命令。 */
  const controller = new EditorController();

  /** Fabric 编辑态适配器，用于把 snapshot 同步到画布。 */
  const adapter = new FabricEditorAdapter({ controller });

  /** 当前快照，UI 只订阅这份标准状态。 */
  const snapshot = shallowRef<EditorSnapshot>(controller.getSnapshot());

  /** 标记当前是否正在应用外部文档，避免 v-model 回写时形成循环。 */
  const applyingExternalDocument = shallowRef(false);

  /** 当前编辑器内部复制缓冲区。 */
  const clipboardState = shallowRef<EditorClipboardState | null>(null);

  /** 当前粘贴次数，用于让每次粘贴都产生可见位移。 */
  const pasteCount = shallowRef(0);

  /** 初始化文档，若外部未传则自动创建一份空白课件。 */
  const initialDocument =
    options.document ??
    createCoursewareDocument({
      title: "Canvas Courseware Editor",
    });

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

  /** 当前是否允许执行撤销。 */
  const canUndo = computed(() => historyState.value.canUndo);

  /** 当前是否允许执行重做。 */
  const canRedo = computed(() => historyState.value.canRedo);

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

  /** 订阅 controller 快照变化，让 Vue 层保持响应式同步。 */
  const unsubscribe = controller.subscribe((nextSnapshot) => {
    snapshot.value = nextSnapshot;
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
      void adapter.setSlideId(slideId);
    },
  );

  /** 组件挂载后再真正连接画布。 */
  onMounted(() => {
    void mountAdapter();
    window.addEventListener("keydown", handleEditorKeydown);
  });

  /** 组件卸载时销毁适配器和订阅，避免内存泄漏。 */
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleEditorKeydown);
    unsubscribe();
    unsubscribeHistoryState();
    void adapter.dispose();
  });

  /** 新增 slide，并自动切换到新页。 */
  const addSlide = () => {
    const slide = createSlide({
      name: `Slide ${snapshot.value.document.slides.length + 1}`,
      backgroundFill: "#FFFFFF",
    });

    controller.execute({
      type: "slide.create",
      slide,
    });
    controller.execute({
      type: "slide.activate",
      slideId: slide.id,
    });
  };

  /** 在当前 slide 中新增文本节点。 */
  const addText = () => {
    const slideId = snapshot.value.activeSlideId;
    if (!slideId) {
      return;
    }

    const node = createTextNode({
      x: 110,
      y: 110,
      width: 420,
      text: "新建文本",
    });

    controller.execute({
      type: "node.create",
      slideId,
      node,
      index: activeSlide.value?.nodes.length,
    });
    controller.execute({
      type: "selection.set",
      slideId,
      nodeIds: [node.id],
    });
  };

  /** 在当前 slide 中新增矩形节点。 */
  const addRect = () => {
    const slideId = snapshot.value.activeSlideId;
    if (!slideId) {
      return;
    }

    const node = createRectNode({
      x: 160,
      y: 180,
      width: 280,
      height: 180,
      fill: "#99F6E4",
    });

    controller.execute({
      type: "node.create",
      slideId,
      node,
      index: activeSlide.value?.nodes.length,
    });
    controller.execute({
      type: "selection.set",
      slideId,
      nodeIds: [node.id],
    });
  };

  /** 在当前 slide 中新增图片节点。 */
  const addImage = () => {
    const slideId = snapshot.value.activeSlideId;
    if (!slideId) {
      return;
    }

    const node = createImageNode({
      x: 220,
      y: 140,
      width: 260,
      height: 220,
      src: "",
    });

    controller.execute({
      type: "node.create",
      slideId,
      node,
      index: activeSlide.value?.nodes.length,
    });
    controller.execute({
      type: "selection.set",
      slideId,
      nodeIds: [node.id],
    });
  };

  /** 读取当前选中节点所在页面。 */
  const resolveSelectionSlide = () => {
    const slideId = snapshot.value.selection.slideId ?? snapshot.value.activeSlideId;
    if (!slideId) {
      return null;
    }

    const slide = snapshot.value.document.slides.find((item) => item.id === slideId);
    if (!slide) {
      return null;
    }

    return {
      slideId,
      slide,
    };
  };

  /** 读取当前选中的节点对象列表。 */
  const resolveSelectedNodes = (): CoursewareNode[] => {
    const selectionContext = resolveSelectionSlide();
    if (!selectionContext || snapshot.value.selection.nodeIds.length === 0) {
      return [];
    }

    return snapshot.value.selection.nodeIds
      .map((nodeId) =>
        selectionContext.slide.nodes.find((node) => node.id === nodeId),
      )
      .filter((node): node is CoursewareNode => Boolean(node));
  };

  /** 复制当前选中节点到编辑器内部缓冲区。 */
  const copySelected = () => {
    const selectionContext = resolveSelectionSlide();
    if (!selectionContext) {
      return;
    }

    const selectedNodes = resolveSelectedNodes();
    if (selectedNodes.length === 0) {
      return;
    }

    clipboardState.value = {
      sourceSlideId: selectionContext.slideId,
      nodes: selectedNodes.map((node) => cloneNodeForClipboard(node)),
    };
    pasteCount.value = 0;
  };

  /** 按当前页面上下文粘贴剪贴板节点。 */
  const pasteClipboard = () => {
    const activeSlideId = snapshot.value.activeSlideId;
    const clipboard = clipboardState.value;
    if (!activeSlideId || !clipboard || clipboard.nodes.length === 0) {
      return;
    }

    const isSameSlidePaste = clipboard.sourceSlideId === activeSlideId;
    const pasteIteration = isSameSlidePaste ? pasteCount.value + 1 : 1;
    const nextOffset = KEYBOARD_PASTE_OFFSET * pasteIteration;
    const activeNodesLength = activeSlide.value?.nodes.length ?? 0;
    const createdNodeIds: string[] = [];

    for (let index = 0; index < clipboard.nodes.length; index += 1) {
      const sourceNode = clipboard.nodes[index];
      const pastedNode = createNodeFromClipboard(sourceNode, nextOffset);

      controller.execute({
        type: "node.create",
        slideId: activeSlideId,
        node: pastedNode,
        index: activeNodesLength + index,
      });

      createdNodeIds.push(pastedNode.id);
    }

    pasteCount.value = isSameSlidePaste ? pasteCount.value + 1 : 0;
    controller.execute({
      type: "selection.set",
      slideId: activeSlideId,
      nodeIds: createdNodeIds,
    });
  };

  /** 复制并立即粘贴当前选中节点。 */
  const duplicateSelected = () => {
    copySelected();
    pasteClipboard();
  };

  /** 通过方向键微调当前选中节点。 */
  const nudgeSelectedNodes = (deltaX: number, deltaY: number) => {
    const selectionContext = resolveSelectionSlide();
    if (!selectionContext || snapshot.value.selection.nodeIds.length === 0) {
      return;
    }

    for (const nodeId of snapshot.value.selection.nodeIds) {
      const targetNode = selectionContext.slide.nodes.find((node) => node.id === nodeId);
      if (!targetNode || targetNode.locked) {
        continue;
      }

      controller.execute({
        type: "node.update",
        slideId: selectionContext.slideId,
        nodeId,
        patch: {
          x: targetNode.x + deltaX,
          y: targetNode.y + deltaY,
        } satisfies NodePatch,
      });
    }
  };

  /** 删除当前选中的所有节点。 */
  const removeSelected = () => {
    const slideId = snapshot.value.selection.slideId ?? snapshot.value.activeSlideId;
    if (!slideId || snapshot.value.selection.nodeIds.length === 0) {
      return;
    }

    for (const nodeId of snapshot.value.selection.nodeIds) {
      controller.execute({
        type: "node.delete",
        slideId,
        nodeId,
      });
    }
  };

  /** 切换当前激活的 slide。 */
  const activateSlide = (slideId: string) => {
    controller.execute({
      type: "slide.activate",
      slideId,
    });
  };

  /** 通过标准命令显式设置当前选中节点。 */
  const selectNodes = (slideId: string, nodeIds: string[]) => {
    controller.execute({
      type: "selection.set",
      slideId,
      nodeIds,
    });
  };

  /** 清空当前页面的选中状态。 */
  const clearSelection = () => {
    controller.execute({
      type: "selection.clear",
      slideId: snapshot.value.activeSlideId ?? undefined,
    });
  };

  /** 执行一次撤销。 */
  const undo = () => {
    controller.undo();
  };

  /** 执行一次重做。 */
  const redo = () => {
    controller.redo();
  };

  /** 处理组合键相关的编辑器快捷键。 */
  const handleMetaShortcut = (
    event: KeyboardEvent,
    isMetaPressed: boolean,
    lowerCaseKey: string,
  ): boolean => {
    if (!isMetaPressed) {
      return false;
    }

    if (lowerCaseKey === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
        return true;
      }

      undo();
      return true;
    }

    if (lowerCaseKey === "y") {
      event.preventDefault();
      redo();
      return true;
    }

    if (lowerCaseKey === "c") {
      event.preventDefault();
      copySelected();
      return true;
    }

    if (lowerCaseKey === "v") {
      event.preventDefault();
      pasteClipboard();
      return true;
    }

    if (lowerCaseKey === "d") {
      event.preventDefault();
      duplicateSelected();
      return true;
    }

    return false;
  };

  /** 处理删除快捷键。 */
  const handleDeleteShortcut = (event: KeyboardEvent): boolean => {
    if (event.key !== "Delete" && event.key !== "Backspace") {
      return false;
    }

    event.preventDefault();
    removeSelected();
    return true;
  };

  /** 处理方向键微调快捷键。 */
  const handleNudgeShortcut = (event: KeyboardEvent): boolean => {
    const moveDistance = event.shiftKey
      ? KEYBOARD_LARGE_NUDGE_DISTANCE
      : KEYBOARD_NUDGE_DISTANCE;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        nudgeSelectedNodes(0, -moveDistance);
        return true;
      case "ArrowDown":
        event.preventDefault();
        nudgeSelectedNodes(0, moveDistance);
        return true;
      case "ArrowLeft":
        event.preventDefault();
        nudgeSelectedNodes(-moveDistance, 0);
        return true;
      case "ArrowRight":
        event.preventDefault();
        nudgeSelectedNodes(moveDistance, 0);
        return true;
      default:
        return false;
    }
  };

  /** 统一处理编辑器快捷键。 */
  const handleEditorKeydown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    const isMetaPressed = event.metaKey || event.ctrlKey;
    const lowerCaseKey = event.key.toLowerCase();

    if (handleMetaShortcut(event, isMetaPressed, lowerCaseKey)) {
      return;
    }

    if (handleDeleteShortcut(event)) {
      return;
    }

    handleNudgeShortcut(event);
  };

  /** 更新当前页面元信息，例如名称、尺寸和背景色。 */
  const updateSlide = (
    slideId: string,
    patch: Partial<Pick<Slide, "name" | "size" | "background">>,
  ) => {
    controller.execute({
      type: "slide.update",
      slideId,
      patch,
    });
  };

  /** 更新某个节点的标准属性。 */
  const updateNode = (slideId: string, nodeId: string, patch: NodePatch) => {
    controller.execute({
      type: "node.update",
      slideId,
      nodeId,
      patch,
    });
  };

  /** 调整节点层级顺序，图层面板只需要传入位置语义。 */
  const reorderNode = (slideId: string, nodeId: string, position: ReorderPosition) => {
    controller.execute({
      type: "node.reorder",
      slideId,
      nodeId,
      position,
    });
  };

  /** 新增或更新某个时间轴步骤。 */
  const upsertTimelineStep = (slideId: string, step: TimelineStep) => {
    controller.execute({
      type: "timeline.step.upsert",
      slideId,
      step,
    });
  };

  /** 删除某个时间轴步骤。 */
  const removeTimelineStep = (slideId: string, stepId: string) => {
    controller.execute({
      type: "timeline.step.remove",
      slideId,
      stepId,
    });
  };

  /** 新增或更新某个动画资源。 */
  const upsertTimelineAnimation = (slideId: string, animation: NodeAnimation) => {
    controller.execute({
      type: "timeline.animation.upsert",
      slideId,
      animation,
    });
  };

  /** 删除某个动画资源。 */
  const removeTimelineAnimation = (slideId: string, animationId: string) => {
    controller.execute({
      type: "timeline.animation.remove",
      slideId,
      animationId,
    });
  };

  /**
   * 用一份新的文档替换当前编辑状态。
   * 这个方法主要给外层 `v-model` 或导入流程使用。
   */
  const replaceDocument = (document: CoursewareDocument) => {
    applyingExternalDocument.value = true;
    controller.replaceDocument(document);
    queueMicrotask(() => {
      applyingExternalDocument.value = false;
    });
  };

  return {
    activeSlide,
    adapter,
    addImage,
    addRect,
    addSlide,
    addText,
    applyingExternalDocument,
    canRedo,
    canUndo,
    controller,
    clearSelection,
    copySelected,
    duplicateSelected,
    editorCanvasRef,
    mountAdapter,
    nudgeSelectedNodes,
    pasteClipboard,
    redo,
    reorderNode,
    removeSelected,
    removeTimelineAnimation,
    removeTimelineStep,
    replaceDocument,
    selectedNode,
    selectedNodeId,
    selectNodes,
    snapshot,
    stats,
    undo,
    activateSlide,
    upsertTimelineAnimation,
    upsertTimelineStep,
    updateNode,
    updateSlide,
  };
}

/** 把节点复制成可安全复用的缓冲区结构。 */
function cloneNodeForClipboard(node: CoursewareNode): CoursewareNode {
  switch (node.type) {
    case "text":
      return {
        ...node,
        props: {
          ...node.props,
        },
      };
    case "image":
      return {
        ...node,
        props: {
          ...node.props,
        },
      };
    case "rect":
      return {
        ...node,
        props: {
          ...node.props,
        },
      };
    default:
      return node;
  }
}

/** 基于复制节点创建新的粘贴节点，并补齐位移和新 id。 */
function createNodeFromClipboard(node: CoursewareNode, offset: number): CoursewareNode {
  return {
    ...cloneNodeForClipboard(node),
    id: createId("node"),
    x: node.x + offset,
    y: node.y + offset,
  };
}

/** 判断当前快捷键事件是否来自可编辑输入区域。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const editableSelector = [
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
  ].join(",");

  return Boolean(target.closest(editableSelector));
}
