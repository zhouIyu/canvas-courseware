import {
  COMMAND_TYPES,
  createId,
  type CoursewareNode,
  type EditorController,
  type EditorSnapshot,
  type NodePatch,
  type Slide,
} from "@canvas-courseware/core";
import { shallowRef, type ComputedRef, type ShallowRef } from "vue";

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

/** 编辑器剪贴板与快捷键初始化参数。 */
interface UseEditorClipboardKeyboardOptions {
  /** 编辑器当前快照。 */
  snapshot: ShallowRef<EditorSnapshot>;
  /** 当前激活页面。 */
  activeSlide: ComputedRef<Slide | undefined>;
  /** 命令控制器，用于派发标准命令。 */
  controller: EditorController;
}

/** 组合编辑器复制粘贴、重复、方向键微调与快捷键处理能力。 */
export function useEditorClipboardKeyboard(options: UseEditorClipboardKeyboardOptions) {
  /** 当前编辑器内部复制缓冲区。 */
  const clipboardState = shallowRef<EditorClipboardState | null>(null);

  /** 当前粘贴次数，用于让每次粘贴都产生可见位移。 */
  const pasteCount = shallowRef(0);

  /** 读取当前选中节点所在页面。 */
  const resolveSelectionSlide = () => {
    const slideId = options.snapshot.value.selection.slideId ?? options.snapshot.value.activeSlideId;
    if (!slideId) {
      return null;
    }

    const slide = options.snapshot.value.document.slides.find((item) => item.id === slideId);
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
    if (!selectionContext || options.snapshot.value.selection.nodeIds.length === 0) {
      return [];
    }

    return options.snapshot.value.selection.nodeIds
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
    const activeSlideId = options.snapshot.value.activeSlideId;
    const clipboard = clipboardState.value;
    if (!activeSlideId || !clipboard || clipboard.nodes.length === 0) {
      return;
    }

    const isSameSlidePaste = clipboard.sourceSlideId === activeSlideId;
    const pasteIteration = isSameSlidePaste ? pasteCount.value + 1 : 1;
    const nextOffset = KEYBOARD_PASTE_OFFSET * pasteIteration;
    const activeNodesLength = options.activeSlide.value?.nodes.length ?? 0;
    const createdNodeIds: string[] = [];

    for (let index = 0; index < clipboard.nodes.length; index += 1) {
      const sourceNode = clipboard.nodes[index];
      const pastedNode = createNodeFromClipboard(sourceNode, nextOffset);

      options.controller.execute({
        type: COMMAND_TYPES.NODE_CREATE,
        slideId: activeSlideId,
        node: pastedNode,
        index: activeNodesLength + index,
      });

      createdNodeIds.push(pastedNode.id);
    }

    pasteCount.value = isSameSlidePaste ? pasteCount.value + 1 : 0;
    options.controller.execute({
      type: COMMAND_TYPES.SELECTION_SET,
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
    if (!selectionContext || options.snapshot.value.selection.nodeIds.length === 0) {
      return;
    }

    for (const nodeId of options.snapshot.value.selection.nodeIds) {
      const targetNode = selectionContext.slide.nodes.find((node) => node.id === nodeId);
      if (!targetNode || targetNode.locked) {
        continue;
      }

      options.controller.execute({
        type: COMMAND_TYPES.NODE_UPDATE,
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
  const removeSelectedByShortcut = () => {
    const selectionContext = resolveSelectionSlide();
    if (!selectionContext || options.snapshot.value.selection.nodeIds.length === 0) {
      return;
    }

    options.controller.execute({
      type: COMMAND_TYPES.NODE_BATCH_DELETE,
      slideId: selectionContext.slideId,
      nodeIds: options.snapshot.value.selection.nodeIds,
    });
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
        options.controller.redo();
        return true;
      }

      options.controller.undo();
      return true;
    }

    if (lowerCaseKey === "y") {
      event.preventDefault();
      options.controller.redo();
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
    removeSelectedByShortcut();
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

  return {
    copySelected,
    duplicateSelected,
    nudgeSelectedNodes,
    pasteClipboard,
    handleEditorKeydown,
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
