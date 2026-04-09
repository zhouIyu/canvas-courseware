<script setup lang="ts">
import type {
  CoursewareDocument,
  EditorSnapshot,
  NodeAnimation,
  NodePatch,
  NodeTimelineSummary,
  ObjectFit,
  ReorderPosition,
  Slide,
  TimelineStep,
} from "@canvas-courseware/core";
import {
  cloneTimelineStep,
  createSlideNodeTimelineSummaryMap,
} from "@canvas-courseware/core";
import type { FabricEditorContextMenuRequest } from "@canvas-courseware/fabric";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  DEFAULT_BACKGROUND_IMAGE_FIT,
  DEFAULT_EDITOR_HEIGHT,
  normalizeBackgroundImageFit,
} from "../shared";
import BackgroundImageFitModal from "./BackgroundImageFitModal.vue";
import EditorToolbar from "./EditorToolbar.vue";
import FloatingLayerManager from "./FloatingLayerManager.vue";
import InspectorPanel from "./InspectorPanel.vue";
import LocalImageFileTrigger from "./LocalImageFileTrigger.vue";
import SlideRailPanel from "./SlideRailPanel.vue";
import SlideSettingsPanel from "./SlideSettingsPanel.vue";
import TimelinePanel from "./TimelinePanel.vue";
import type {
  LayerAlignMode,
  LayerDistributeMode,
} from "./useEditorBatchLayout";
import { useCoursewareEditor } from "./useCoursewareEditor";
/** 编辑器右侧管理区的标签名。 */
type EditorSideTab = "node" | "timeline";

/** 标签切换控件传回值的兼容类型。 */
type EditorSideTabValue = string | number;

/** 页面栏重命名事件的载荷。 */
interface SlideRailRenamePayload {
  /** 被重命名的 slide id。 */
  slideId: string;
  /** 更新后的页面名称。 */
  name: string;
}

/** 页面栏拖拽排序事件的载荷。 */
interface SlideRailReorderPayload {
  /** 被拖拽的 slide id。 */
  slideId: string;
  /** 放下后的最终索引。 */
  index: number;
}

/** 时间轴步骤排序事件的载荷。 */
interface TimelineStepReorderPayload {
  /** 需要移动的步骤 id。 */
  stepId: string;
  /** 排序后的目标索引。 */
  index: number;
}

/** 时间轴步骤复制事件的载荷。 */
interface TimelineStepDuplicatePayload {
  /** 需要复制的源步骤。 */
  step: TimelineStep;
  /** 源步骤当前所处的索引。 */
  index: number;
}

/** 时间轴发起预览请求时抛给 app 层的载荷。 */
interface TimelinePreviewRequestPayload {
  /** 需要对齐到的 slide id。 */
  slideId: string;
  /** 需要作为下一步焦点的步骤索引。 */
  stepIndex: number;
}

/** 浮层图层拖拽排序事件的载荷。 */
interface LayerReorderToIndexPayload {
  /** 被拖拽的节点 id。 */
  nodeId: string;
  /** 放下后的目标索引。 */
  index: number;
}

/** 编辑器向应用层抛出的 slide 缩略图截图结果。 */
interface SlideThumbnailCapturedPayload {
  /** 已完成截图的 slide id。 */
  slideId: string;
  /** 当前 slide 对应的缩略图 data URL。 */
  thumbnail: string;
}

/** 编辑区右键菜单在组件内维护的定位状态。 */
interface EditorContextMenuState {
  /** 菜单相对工作区的 X 坐标。 */
  x: number;
  /** 菜单相对工作区的 Y 坐标。 */
  y: number;
  /** 触发时命中的 slide id。 */
  slideId: string | null;
  /** 触发时命中的节点 id。 */
  nodeId: string | null;
}

/** “设为背景”流程中待确认的图片来源。 */
type PendingBackgroundImageAction =
  | {
      /** 待处理来源为本地图片文件。 */
      sourceKind: "file";
      /** 当前待写入页面背景的本地文件。 */
      file: File;
      /** 弹层中展示给用户的来源摘要。 */
      sourceLabel: string;
      /** 弹层打开时默认选中的填充方式。 */
      preferredFit: ObjectFit;
    }
  | {
      /** 待处理来源为当前画布中的图片节点。 */
      sourceKind: "node";
      /** 当前待转换为背景图的节点 id。 */
      nodeId: string;
      /** 弹层中展示给用户的来源摘要。 */
      sourceLabel: string;
      /** 弹层打开时默认选中的填充方式。 */
      preferredFit: ObjectFit;
    };

/** 右键菜单预估宽度，用于避免贴边溢出。 */
const CONTEXT_MENU_WIDTH = 188;

/** 右键菜单与边缘之间的安全距离。 */
const CONTEXT_MENU_SAFE_MARGIN = 12;

/** 右键菜单预估高度，用于首版定位。 */
const CONTEXT_MENU_ESTIMATED_HEIGHT = 312;

/** 编辑器组件的显示参数。 */
const props = withDefaults(
  defineProps<{
    /** 组件标题。 */
    title?: string;
    /** 工作区最小高度。 */
    height?: number;
    /** 是否展示组件内部头部。 */
    showHeader?: boolean;
    /** 外部传入的 slide 缩略图缓存，供左侧页面栏优先展示真实封面。 */
    slideThumbnailMap?: Record<string, string | null>;
  }>(),
  {
    title: "课件编辑工作台",
    height: DEFAULT_EDITOR_HEIGHT,
    showHeader: true,
    slideThumbnailMap: () => ({}),
  },
);

/** 编辑器对外暴露的事件。 */
const emit = defineEmits<{
  /** 向外同步最新编辑快照，供 app 层接管产品状态。 */
  "snapshot-change": [snapshot: EditorSnapshot];
  /** 通知外层某一页已经完成缩略图截图，可持久化到项目仓库。 */
  "slide-thumbnail-captured": [payload: SlideThumbnailCapturedPayload];
  /** 通知外层从某个时间轴步骤切入预览模式。 */
  "timeline-preview-request": [payload: TimelinePreviewRequestPayload];
}>();

/** 编辑器通过 v-model 接收并回传标准课件文档。 */
const documentModel = defineModel<CoursewareDocument | undefined>();

/** 标记当前是否正在把内部快照回写给外层 v-model，避免误判成外部导入。 */
const isSyncingDocumentModel = ref(false);

/** 工作区容器引用，用于挂载右键菜单。 */
const workspaceShellRef = ref<HTMLElement | null>(null);

/** 当前编辑区右键菜单状态。 */
const contextMenuState = ref<EditorContextMenuState | null>(null);

/** “设为背景”流程中暂存的待确认操作。 */
const pendingBackgroundImageAction = ref<PendingBackgroundImageAction | null>(null);

/** 当前“设为背景”确认动作是否正在提交。 */
const isApplyingBackgroundImageFit = ref(false);

/** 把数值约束到指定区间内，避免菜单超出容器。 */
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

/** 关闭当前右键菜单。 */
const closeContextMenu = () => {
  contextMenuState.value = null;
};

/** 关闭“设为背景”确认弹层，并清理暂存来源。 */
const closeBackgroundImageFitModal = () => {
  pendingBackgroundImageAction.value = null;
  isApplyingBackgroundImageFit.value = false;
};

/** 按工作区可用空间规整右键菜单坐标。 */
const normalizeContextMenuPosition = (clientX: number, clientY: number) => {
  const hostRect = workspaceShellRef.value?.getBoundingClientRect();
  if (!hostRect) {
    return null;
  }

  return {
    x: clamp(
      clientX - hostRect.left,
      CONTEXT_MENU_SAFE_MARGIN,
      Math.max(hostRect.width - CONTEXT_MENU_WIDTH - CONTEXT_MENU_SAFE_MARGIN, CONTEXT_MENU_SAFE_MARGIN),
    ),
    y: clamp(
      clientY - hostRect.top,
      CONTEXT_MENU_SAFE_MARGIN,
      Math.max(hostRect.height - CONTEXT_MENU_ESTIMATED_HEIGHT, CONTEXT_MENU_SAFE_MARGIN),
    ),
  };
};

/** 打开编辑区右键菜单。 */
const openContextMenu = (payload: FabricEditorContextMenuRequest) => {
  const normalizedPosition = normalizeContextMenuPosition(payload.clientX, payload.clientY);
  if (!normalizedPosition) {
    return;
  }

  contextMenuState.value = {
    ...normalizedPosition,
    slideId: payload.slideId,
    nodeId: payload.nodeId,
  };
};

/** 接收适配层发起的右键菜单请求。 */
const handleCanvasContextMenuRequest = (payload: FabricEditorContextMenuRequest) => {
  openContextMenu(payload);
};

/** 右侧标签列表，用于渲染管理区切换按钮。 */
const sideTabs = [
  {
    key: "node" as const,
    label: "组件属性",
  },
  {
    key: "timeline" as const,
    label: "时间轴",
  },
];

/** 当前右侧激活的管理标签。 */
const activeSideTab = ref<EditorSideTab>("node");

/** 当前左侧页面栏是否已收起。 */
const isSlideRailCollapsed = ref(false);

/** 当前右侧管理栏是否已收起。 */
const isEditorSideCollapsed = ref(true);

/** 当前页面设置抽屉是否打开。 */
const isSlideSettingsDrawerVisible = ref(false);

/** 属性面板最近一次稳定选中的节点 id。 */
const retainedInspectorNodeId = ref<string | null>(null);

/** 工具条容器引用，用来计算剩余可用高度。 */
const toolbarShellRef = ref<HTMLElement | null>(null);

/** 中间编辑区滚动容器的 DOM 引用。 */
const stageViewportRef = ref<HTMLDivElement | null>(null);

/** 中间编辑区当前可用尺寸。 */
const stageViewportSize = ref({
  width: 0,
  height: 0,
});

/** 当前工具条实际高度。 */
const toolbarHeight = ref(0);

/** 从 composable 中解出编辑器所需的状态与操作。 */
const {
  activeSlide,
  addImage,
  addImageFromFile,
  addRect,
  addSlide,
  addSlideAfter,
  addText,
  alignSelectedNodes,
  applyingExternalDocument,
  activateSlide,
  canRedo,
  canUndo,
  captureActiveSlideThumbnail: captureActiveSlideThumbnailDataUrl,
  clearSelection,
  copySelected,
  duplicateSelected,
  distributeSelectedNodes,
  editorCanvasRef,
  duplicateSlideById,
  removeTimelineAnimation,
  removeTimelineStep,
  removeSlide,
  removeSelected,
  redo,
  pasteClipboard,
  setSlideBackgroundImageFromNode,
  setSlideBackgroundImageFromFile,
  replaceImageFromFile,
  reorderNode,
  reorderSlide,
  reorderTimelineStep,
  replaceDocument,
  requestInlineTextEditingExit,
  selectedNode,
  selectedNodeId,
  selectNodes,
  snapshot,
  stats,
  undo,
  upsertTimelineAnimation,
  upsertTimelineStep,
  updateNode,
  updateSlide,
} = useCoursewareEditor({
  document: documentModel.value,
  onContextMenuRequest: handleCanvasContextMenuRequest,
});

/**
 * 外层 v-model 文档变化时，同步替换内部文档。
 * 这里显式跳过内部主动回写的那一轮，避免形成循环。
 */
watch(
  () => documentModel.value,
  (document) => {
    if (
      !document ||
      applyingExternalDocument.value ||
      isSyncingDocumentModel.value ||
      document === snapshot.value.document
    ) {
      return;
    }

    replaceDocument(document);
  },
);

/** 内部文档变化后，把最新 JSON 回写给外层。 */
watch(
  () => snapshot.value.document,
  (document) => {
    /**
     * 内部命令会先更新 snapshot，再通过 v-model 把最新文档抛给外层。
     * 如果不把这轮回写显式标记出来，外层响应式代理对象回传后会被误认为“外部新文档”，
     * 进而再次触发 `replaceDocument`，把撤销 / 重做历史栈重置掉。
     */
    isSyncingDocumentModel.value = true;
    documentModel.value = document;
    queueMicrotask(() => {
      isSyncingDocumentModel.value = false;
    });
  },
  { immediate: true },
);

/** 当前快照变化后，同步抛给外层联调页或正式 app 使用。 */
watch(
  () => snapshot.value,
  (nextSnapshot) => {
    emit("snapshot-change", nextSnapshot);
  },
  { immediate: true },
);

/**
 * 当选中对象变化时，尽量把右侧管理区保持在对象编辑语义中。
 * 如果用户当前停在时间轴，就尊重该上下文，不强制回跳到属性面板。
 */
watch(
  [
    () => snapshot.value.activeSlideId,
    () => snapshot.value.selection.nodeIds.length,
  ],
  ([activeSlideId, selectionCount], previousValues) => {
    /** `immediate` 首次执行时旧值为空，这里统一做一次安全展开。 */
    const [previousSlideId, previousSelectionCount] = previousValues ?? [];

    if (activeSlideId !== previousSlideId) {
      retainedInspectorNodeId.value = null;
      isSlideSettingsDrawerVisible.value = false;
      return;
    }

    /**
     * 只有选中数量真实变化时，才根据选中态自动切换标签。
     * 避免 timeline 编辑导致 snapshot 更新后，因为 watch 源值重新求值而错误回跳。
     */
    if (selectionCount === previousSelectionCount) {
      return;
    }

    if (selectionCount > 0 && activeSideTab.value !== "timeline") {
      activeSideTab.value = "node";
    }
  },
  { immediate: true },
);

/** 只要存在稳定单选，就记住它，供属性面板在交互过程里继续复用。 */
watch(
  () => snapshot.value.selection.nodeIds,
  (nodeIds) => {
    if (nodeIds.length === 1) {
      retainedInspectorNodeId.value = nodeIds[0];
    }
  },
  { immediate: true },
);

/** 切页后关闭旧位置的右键菜单，避免悬浮到错误页面。 */
watch(
  () => snapshot.value.activeSlideId,
  () => {
    closeContextMenu();
    closeBackgroundImageFitModal();
  },
);

/** 外层工作区的高度样式。 */
const stageStyle = computed(() => ({
  minHeight: `${paneHeight.value}px`,
}));

/** 三栏区复用同一份参考高度，让左右侧栏保持固定高度。 */
const editorLayoutStyle = computed(() => ({
  "--cw-editor-pane-height": `${paneHeight.value}px`,
}));

/** 内嵌工作台模式下固定组件总高度，避免把页面继续撑高。 */
const editorShellStyle = computed(() =>
  isEmbedded.value
    ? {
        height: `${props.height}px`,
      }
    : {},
);

/** 当前选中节点对应的动画资源列表。 */
const selectedNodeAnimations = computed<NodeAnimation[]>(() => {
  if (!activeSlide.value || !inspectorNode.value) {
    return [];
  }

  return activeSlide.value.timeline.animations.filter(
    (animation) => animation.targetId === inspectorNode.value?.id,
  );
});

/** 真正传给 canvas 容器的尺寸样式。 */
const canvasStyle = computed(() => {
  if (!activeSlide.value) {
    return {};
  }

  return {
    width: `${activeSlide.value.size.width}px`,
    height: `${activeSlide.value.size.height}px`,
  };
});

/** 根据中间区域宽高等比缩放画布，保证始终完整显示且不放大。 */
const canvasScale = computed(() => {
  if (
    !activeSlide.value ||
    stageViewportSize.value.width <= 0 ||
    stageViewportSize.value.height <= 0
  ) {
    return 1;
  }

  /** 预留滚动容器与画布包裹层的水平留白，保证边缘不贴死。 */
  const availableWidth = Math.max(stageViewportSize.value.width - 88, 180);
  /** 预留上下留白，保证缩放后画布仍完整可见。 */
  const availableHeight = Math.max(stageViewportSize.value.height - 80, 160);
  const widthScale = availableWidth / activeSlide.value.size.width;
  const heightScale = availableHeight / activeSlide.value.size.height;

  return Math.min(1, widthScale, heightScale);
});

/** 缩放后的画布外框尺寸，保证布局高度与展示尺寸一致。 */
const canvasFrameStyle = computed(() => {
  if (!activeSlide.value) {
    return {};
  }

  return {
    width: `${activeSlide.value.size.width * canvasScale.value}px`,
    height: `${activeSlide.value.size.height * canvasScale.value}px`,
  };
});

/** 实际渲染画布仍保持原始尺寸，只通过 transform 缩放。 */
const canvasSurfaceStyle = computed(() => {
  if (!activeSlide.value) {
    return {};
  }

  return {
    ...canvasStyle.value,
    transform: `scale(${canvasScale.value})`,
    transformOrigin: "top left",
  };
});

/** 三栏区真正可用的高度，扣掉工具条后再分给左右侧栏和中间区。 */
const paneHeight = computed(() => Math.max(props.height - toolbarHeight.value, 320));

/** 当前三栏布局的动态 class。 */
const editorLayoutClass = computed(() => ({
  "is-left-collapsed": isSlideRailCollapsed.value,
  "is-right-collapsed": isEditorSideCollapsed.value,
}));

/** 当前是否以内嵌工作台模式渲染。 */
const isEmbedded = computed(() => !props.showHeader);

/** 当前页面内全部节点的步骤归属摘要。 */
const nodeTimelineSummaryMap = computed<Record<string, NodeTimelineSummary>>(() =>
  activeSlide.value ? createSlideNodeTimelineSummaryMap(activeSlide.value) : {},
);

/** 属性面板优先使用当前单选节点，若交互过程中临时失焦则回退到最近一次稳定单选。 */
const inspectorNode = computed(() => {
  if (!activeSlide.value) {
    return null;
  }

  const nodeId =
    snapshot.value.selection.nodeIds.length === 1
      ? snapshot.value.selection.nodeIds[0]
      : snapshot.value.selection.nodeIds.length === 0
        ? retainedInspectorNodeId.value
        : null;

  return nodeId ? activeSlide.value.nodes.find((node) => node.id === nodeId) ?? null : null;
});

/** 属性面板展示用的选中数量；若处于失焦保留态，仍按单选渲染。 */
const inspectorSelectedCount = computed(() =>
  snapshot.value.selection.nodeIds.length > 1
    ? snapshot.value.selection.nodeIds.length
    : inspectorNode.value
      ? 1
      : 0,
);

/** 当前属性面板节点的步骤归属摘要。 */
const selectedNodeTimelineSummary = computed<NodeTimelineSummary | null>(() =>
  inspectorNode.value ? nodeTimelineSummaryMap.value[inspectorNode.value.id] ?? null : null,
);

/** 当前右键菜单的定位样式。 */
const contextMenuStyle = computed(() =>
  contextMenuState.value
    ? {
        left: `${contextMenuState.value.x}px`,
        top: `${contextMenuState.value.y}px`,
      }
    : {},
);

/** 当前右键菜单是否应显示“所选对象”快捷操作。 */
const contextMenuHasSelection = computed(() => snapshot.value.selection.nodeIds.length > 0);

/** 当前右键菜单命中的是否为一张已导入资源的图片节点。 */
const contextMenuTargetImageNode = computed(() => {
  if (!contextMenuState.value?.nodeId || !activeSlide.value) {
    return null;
  }

  const node = activeSlide.value.nodes.find((candidate) => candidate.id === contextMenuState.value?.nodeId);
  if (!node || node.type !== "image" || node.props.src.trim().length === 0) {
    return null;
  }

  return node;
});

/** 当前右键菜单是否可以展示“设为背景”快捷入口。 */
const contextMenuCanSetBackground = computed(() => Boolean(contextMenuTargetImageNode.value));

/** 当前“设为背景”确认弹层是否展示。 */
const isBackgroundImageFitModalVisible = computed(() => Boolean(pendingBackgroundImageAction.value));

/** 当前“设为背景”确认弹层中的来源说明。 */
const backgroundImageFitModalSourceLabel = computed(
  () => pendingBackgroundImageAction.value?.sourceLabel ?? "当前图片",
);

/** 当前“设为背景”确认弹层中的默认填充方式。 */
const backgroundImageFitModalInitialFit = computed(
  () => pendingBackgroundImageAction.value?.preferredFit ?? DEFAULT_BACKGROUND_IMAGE_FIT,
);

/** 当前 slide 的更新入口。 */
const handleSlideUpdate = (patch: Partial<Pick<Slide, "name" | "size" | "background">>) => {
  if (!activeSlide.value) {
    return;
  }

  updateSlide(activeSlide.value.id, patch);
};

/** 导出当前激活页缩略图，并在成功后同步抛给应用层。 */
const captureAndEmitActiveSlideThumbnail = async (): Promise<SlideThumbnailCapturedPayload | null> => {
  if (!activeSlide.value) {
    return null;
  }

  const thumbnail = await captureActiveSlideThumbnailDataUrl();
  if (!thumbnail) {
    return null;
  }

  const payload = {
    slideId: activeSlide.value.id,
    thumbnail,
  };
  emit("slide-thumbnail-captured", payload);
  return payload;
};

/** 对外暴露当前激活页的截图接口，供工作台在保存前主动同步缩略图。 */
const captureActiveSlideThumbnail = async (): Promise<SlideThumbnailCapturedPayload | null> => {
  if (!activeSlide.value) {
    return null;
  }

  const thumbnail = await captureActiveSlideThumbnailDataUrl();
  if (!thumbnail) {
    return null;
  }

  return {
    slideId: activeSlide.value.id,
    thumbnail,
  };
};

/** 页面栏内快速重命名 slide。 */
const handleSlideRename = (payload: SlideRailRenamePayload) => {
  updateSlide(payload.slideId, {
    name: payload.name,
  });
};

/** 切页前先截取当前页封面，再切到目标页面。 */
const handleSlideActivate = async (slideId: string) => {
  if (slideId === activeSlide.value?.id) {
    return;
  }

  await captureAndEmitActiveSlideThumbnail();
  activateSlide(slideId);
};

/** 从左侧页面栏新增一页前，先同步当前页面封面。 */
const handleSlideCreate = async () => {
  await captureAndEmitActiveSlideThumbnail();
  addSlide();
};

/** 从指定页面后快速新增下一页。 */
const handleSlideCreateAfter = async (slideId: string) => {
  await captureAndEmitActiveSlideThumbnail();
  addSlideAfter(slideId);
};

/** 复制指定页面。 */
const handleSlideDuplicate = async (slideId: string) => {
  await captureAndEmitActiveSlideThumbnail();
  duplicateSlideById(slideId);
};

/** 删除指定页面。 */
const handleSlideRemove = (slideId: string) => {
  removeSlide(slideId);
};

/** 更新页面列表中的拖拽排序结果。 */
const handleSlideReorder = (payload: SlideRailReorderPayload) => {
  reorderSlide(payload.slideId, payload.index);
};

/** 当前单选节点的更新入口。 */
const handleNodeUpdate = (nodeId: string, patch: NodePatch) => {
  const slideId = snapshot.value.selection.slideId ?? activeSlide.value?.id;
  if (!slideId) {
    return;
  }

  updateNode(slideId, nodeId, patch);
};

/** 图层面板选中节点时，把选择同步回标准 snapshot。 */
const handleLayerSelect = (nodeId: string) => {
  if (!activeSlide.value) {
    return;
  }

  selectNodes(activeSlide.value.id, [nodeId]);
};

/** 图层面板层级按钮的派发入口。 */
const handleLayerReorder = (nodeId: string, position: ReorderPosition) => {
  if (!activeSlide.value) {
    return;
  }

  reorderNode(activeSlide.value.id, nodeId, position);
};

/** 独立浮层拖拽排序后的统一写回入口。 */
const handleLayerReorderToIndex = (payload: LayerReorderToIndexPayload) => {
  if (!activeSlide.value) {
    return;
  }

  reorderNode(activeSlide.value.id, payload.nodeId, "index", payload.index);
};

/** 图层面板批量对齐按钮的派发入口。 */
const handleLayerAlign = (mode: LayerAlignMode) => {
  alignSelectedNodes(mode);
};

/** 图层面板批量分布按钮的派发入口。 */
const handleLayerDistribute = (mode: LayerDistributeMode) => {
  distributeSelectedNodes(mode);
};

/** 时间轴步骤的新增与更新统一从这里进入标准命令层。 */
const handleTimelineStepUpsert = (step: TimelineStep) => {
  if (!activeSlide.value) {
    return;
  }

  upsertTimelineStep(activeSlide.value.id, step);
};

/** 删除当前页面中的某个时间轴步骤。 */
const handleTimelineStepRemove = (stepId: string) => {
  if (!activeSlide.value) {
    return;
  }

  removeTimelineStep(activeSlide.value.id, stepId);
};

/** 调整当前页面中某个时间轴步骤的顺序。 */
const handleTimelineStepReorder = (payload: TimelineStepReorderPayload) => {
  if (!activeSlide.value) {
    return;
  }

  reorderTimelineStep(activeSlide.value.id, payload.stepId, payload.index);
};

/** 复制一个时间轴步骤，并把副本插入到原步骤后面。 */
const handleTimelineStepDuplicate = (payload: TimelineStepDuplicatePayload) => {
  if (!activeSlide.value) {
    return;
  }

  const duplicatedStep = cloneTimelineStep(payload.step);
  upsertTimelineStep(activeSlide.value.id, duplicatedStep, payload.index + 1);
};

/** 请求外层切换到预览模式，并从当前步骤开始播放。 */
const handleTimelinePreviewRequest = (stepIndex: number) => {
  if (!activeSlide.value) {
    return;
  }

  emit("timeline-preview-request", {
    slideId: activeSlide.value.id,
    stepIndex,
  });
};

/** 时间轴动画资源的新增与更新统一从这里进入标准命令层。 */
const handleTimelineAnimationUpsert = (animation: NodeAnimation) => {
  if (!activeSlide.value) {
    return;
  }

  upsertTimelineAnimation(activeSlide.value.id, animation);
};

/** 删除当前页面中的某个动画资源。 */
const handleTimelineAnimationRemove = (animationId: string) => {
  if (!activeSlide.value) {
    return;
  }

  removeTimelineAnimation(activeSlide.value.id, animationId);
};

/** 从工具条导入一张本地图片，并在失败时给出明确反馈。 */
const handleLocalImageImport = async (file: File) => {
  try {
    await addImageFromFile(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片导入失败，请重试";
    window.alert(message);
    console.error(error);
  }
};

/** 从工具条上传图片后，先打开填充方式确认弹层。 */
const handleBackgroundImageImport = (file: File) => {
  closeContextMenu();
  pendingBackgroundImageAction.value = {
    sourceKind: "file",
    file,
    sourceLabel: `本地图片 · ${file.name}`,
    preferredFit: normalizeBackgroundImageFit(
      activeSlide.value?.background.image?.fit,
      DEFAULT_BACKGROUND_IMAGE_FIT,
    ),
  };
};

/** 从属性面板直接替换当前图片节点，并保留节点布局和当前选中态。 */
const handleImageReplace = async (nodeId: string, file: File) => {
  try {
    await replaceImageFromFile(nodeId, file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片替换失败，请重试";
    window.alert(message);
    console.error(error);
  }
};

/** 右键菜单中从当前点击位置快速插入文本。 */
const handleContextMenuAddText = () => {
  closeContextMenu();
  addText();
};

/** 右键菜单中快速插入矩形。 */
const handleContextMenuAddRect = () => {
  closeContextMenu();
  addRect();
};

/** 右键菜单中快速插入空图片框。 */
const handleContextMenuAddImageFrame = () => {
  closeContextMenu();
  addImage();
};

/** 右键菜单中直接从本地插入图片。 */
const handleContextMenuImageImport = async (file: File) => {
  closeContextMenu();
  await handleLocalImageImport(file);
};

/** 右键菜单中复制当前选区。 */
const handleContextMenuCopy = () => {
  closeContextMenu();
  copySelected();
};

/** 右键菜单中快速重复当前选区。 */
const handleContextMenuDuplicate = () => {
  closeContextMenu();
  duplicateSelected();
};

/** 右键菜单中把当前图片节点直接转换成页面背景。 */
const handleContextMenuSetImageAsBackground = () => {
  const imageNode = contextMenuTargetImageNode.value;
  if (!imageNode) {
    return;
  }

  closeContextMenu();
  pendingBackgroundImageAction.value = {
    sourceKind: "node",
    nodeId: imageNode.id,
    sourceLabel: `画布图片 · ${imageNode.name}`,
    preferredFit: normalizeBackgroundImageFit(
      imageNode.props.objectFit ?? activeSlide.value?.background.image?.fit,
      DEFAULT_BACKGROUND_IMAGE_FIT,
    ),
  };
};

/** 根据弹层确认结果，真正执行“设为背景”写入。 */
const handleBackgroundImageFitConfirm = async (fit: ObjectFit) => {
  const pendingAction = pendingBackgroundImageAction.value;
  if (!pendingAction) {
    return;
  }

  isApplyingBackgroundImageFit.value = true;

  try {
    if (pendingAction.sourceKind === "file") {
      await setSlideBackgroundImageFromFile(pendingAction.file, fit);
    } else {
      const backgroundSource = setSlideBackgroundImageFromNode(pendingAction.nodeId, fit);
      if (!backgroundSource) {
        throw new Error("当前图片还没有可用资源，暂时不能设为背景");
      }
    }

    isSlideSettingsDrawerVisible.value = true;
    closeBackgroundImageFitModal();
  } catch (error) {
    isApplyingBackgroundImageFit.value = false;
    const message = error instanceof Error ? error.message : "背景图设置失败，请重试";
    window.alert(message);
    console.error(error);
  }
};

/** 右键菜单中删除当前选区。 */
const handleContextMenuDelete = () => {
  closeContextMenu();
  removeSelected();
};

/** 右键菜单中执行一次粘贴。 */
const handleContextMenuPaste = () => {
  closeContextMenu();
  pasteClipboard();
};

/** 切换右侧管理区标签。 */
const activateSideTab = (tab: EditorSideTab) => {
  activeSideTab.value = tab;
  isEditorSideCollapsed.value = false;
};

/** 判断当前值是否为受支持的右侧标签 key。 */
const isEditorSideTab = (value: EditorSideTabValue): value is EditorSideTab =>
  value === "node" || value === "timeline";

/** 处理 Arco Tabs 标签切换。 */
const handleSideTabChange = (key: EditorSideTabValue) => {
  if (isEditorSideTab(key)) {
    activateSideTab(key);
  }
};

/** 打开当前页面的设置抽屉。 */
const openSlideSettingsDrawer = () => {
  isSlideSettingsDrawerVisible.value = true;
};

/** 关闭当前页面的设置抽屉。 */
const closeSlideSettingsDrawer = () => {
  isSlideSettingsDrawerVisible.value = false;
};
/** 切换左侧页面栏显隐。 */
const toggleSlideRail = () => {
  isSlideRailCollapsed.value = !isSlideRailCollapsed.value;
};

/** 切换右侧管理区显隐。 */
const toggleEditorSide = () => {
  isEditorSideCollapsed.value = !isEditorSideCollapsed.value;
};

/** 在非画布区域右键时，仍然展示空白态编辑区菜单。 */
const handleStageViewportContextMenu = (event: MouseEvent) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("canvas")) {
    return;
  }

  clearSelection();
  openContextMenu({
    clientX: event.clientX,
    clientY: event.clientY,
    slideId: activeSlide.value?.id ?? null,
    nodeId: null,
  });
};

/** 点击菜单外区域时关闭右键菜单。 */
const handleGlobalPointerDown = (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.closest("canvas")) {
    requestInlineTextEditingExit();
  }

  if (!contextMenuState.value) {
    return;
  }

  if (target instanceof HTMLElement && target.closest(".stage-context-menu")) {
    return;
  }

  closeContextMenu();
};

/** 支持通过 Escape 关闭右键菜单。 */
const handleContextMenuKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    closeContextMenu();
  }
};

/** 读取当前工具条的真实高度。 */
const updateToolbarHeight = () => {
  toolbarHeight.value = toolbarShellRef.value?.offsetHeight ?? 0;
};

/** 读取中间编辑区当前可用尺寸，用于画布等比缩放。 */
const updateStageViewportSize = () => {
  stageViewportSize.value = {
    width: stageViewportRef.value?.clientWidth ?? 0,
    height: stageViewportRef.value?.clientHeight ?? 0,
  };
};
/** 监听工具条和编辑区尺寸变化，让布局与画布缩放及时同步。 */
let toolbarResizeObserver: ResizeObserver | null = null;
let stageViewportResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  updateToolbarHeight();
  updateStageViewportSize();
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("keydown", handleContextMenuKeydown);

  if (toolbarShellRef.value) {
    toolbarResizeObserver = new ResizeObserver(() => {
      updateToolbarHeight();
    });
    toolbarResizeObserver.observe(toolbarShellRef.value);
  }

  if (stageViewportRef.value) {
    stageViewportResizeObserver = new ResizeObserver(() => {
      updateStageViewportSize();
    });
    stageViewportResizeObserver.observe(stageViewportRef.value);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("keydown", handleContextMenuKeydown);
  toolbarResizeObserver?.disconnect();
  toolbarResizeObserver = null;
  stageViewportResizeObserver?.disconnect();
  stageViewportResizeObserver = null;
});

/** 暴露给应用壳层的组件方法。 */
defineExpose({
  captureActiveSlideThumbnail,
});
</script>

<template>
  <section class="editor-shell" :class="{ 'is-embedded': isEmbedded }" :style="editorShellStyle">
    <BackgroundImageFitModal
      :confirm-loading="isApplyingBackgroundImageFit"
      :initial-fit="backgroundImageFitModalInitialFit"
      :source-label="backgroundImageFitModalSourceLabel"
      :visible="isBackgroundImageFitModalVisible"
      @cancel="closeBackgroundImageFitModal"
      @confirm="handleBackgroundImageFitConfirm"
    />

    <header v-if="showHeader" class="editor-topbar">
      <div class="editor-heading">
        <div class="title-row">
          <h2>{{ title }}</h2>
          <span class="mode-pill">编辑模式</span>
        </div>
        <p class="editor-copy">
          当前壳层只消费标准 snapshot，并把所有操作继续下沉为 controller 命令，保持 UI 与事件层解耦。
        </p>
      </div>

      <div class="stat-grid">
        <article class="stat-card">
          <span class="stat-label">页面</span>
          <strong>{{ stats.slideCount }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">对象</span>
          <strong>{{ stats.nodeCount }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">时间轴</span>
          <strong>{{ stats.stepCount }}</strong>
        </article>
      </div>
    </header>

    <main class="editor-workbench">
      <div ref="toolbarShellRef">
        <EditorToolbar
          :can-redo="canRedo"
          :can-undo="canUndo"
          @add-image="addImage"
          @add-rect="addRect"
          @add-text="addText"
          @import-image="handleLocalImageImport"
          @set-background-image="handleBackgroundImageImport"
          @redo="redo"
          @undo="undo"
        />
      </div>

      <div class="editor-layout" :class="editorLayoutClass" :style="editorLayoutStyle">
        <a-button
          class="stage-side-badge stage-side-badge-left"
          type="text"
          :aria-label="isSlideRailCollapsed ? '展开左侧页面栏' : '收起左侧页面栏'"
          @click="toggleSlideRail"
        >
          {{ isSlideRailCollapsed ? "›" : "‹" }}
        </a-button>
        <a-button
          class="stage-side-badge stage-side-badge-right"
          type="text"
          :aria-label="isEditorSideCollapsed ? '展开右侧管理栏' : '收起右侧管理栏'"
          @click="toggleEditorSide"
        >
          {{ isEditorSideCollapsed ? "‹" : "›" }}
        </a-button>

        <aside v-show="!isSlideRailCollapsed" class="slide-rail-host">
          <SlideRailPanel
            :active-slide-id="snapshot.activeSlideId"
            :slide-thumbnail-map="props.slideThumbnailMap"
            :slides="snapshot.document.slides"
            @activate="handleSlideActivate"
            @create="handleSlideCreate"
            @create-after="handleSlideCreateAfter"
            @duplicate="handleSlideDuplicate"
            @remove="handleSlideRemove"
            @rename="handleSlideRename"
            @reorder="handleSlideReorder"
          />
        </aside>

        <section ref="workspaceShellRef" class="workspace-shell panel-shell">
          <div class="stage-floating-tools">
            <a-button
              class="stage-floating-button"
              aria-label="打开页面设置"
              shape="circle"
              size="small"
              type="outline"
              @click="openSlideSettingsDrawer"
            >
              <template #icon>
                <icon-settings />
              </template>
            </a-button>
            <FloatingLayerManager
              :nodes="activeSlide?.nodes ?? []"
              :node-timeline-summary-map="nodeTimelineSummaryMap"
              :selected-node-ids="snapshot.selection.nodeIds"
              @select="handleLayerSelect"
              @update-node="handleNodeUpdate"
              @reorder="handleLayerReorder"
              @reorder-to-index="handleLayerReorderToIndex"
              @align="handleLayerAlign"
              @distribute="handleLayerDistribute"
              @open-inspector="activateSideTab('node')"
              @open-timeline="activateSideTab('timeline')"
            />
          </div>

          <div
            ref="stageViewportRef"
            class="stage-scroll"
            :style="stageStyle"
            @contextmenu.prevent="handleStageViewportContextMenu"
          >
            <div class="stage-backdrop">
              <div v-if="activeSlide" class="stage-scale-frame" :style="canvasFrameStyle">
                <div class="stage-surface" :style="canvasSurfaceStyle">
                  <canvas ref="editorCanvasRef" />
                </div>
              </div>
              <div v-else class="empty-stage">
                <strong>还没有可编辑的页面</strong>
                <p>先新增一个 slide，再开始插入文本、矩形或图片。</p>
              </div>
            </div>
          </div>

          <div
            v-if="contextMenuState"
            class="stage-context-menu"
            :style="contextMenuStyle"
            @contextmenu.prevent
          >
            <div class="stage-context-menu__group">
              <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuAddText">
                插入文本
              </a-button>
              <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuAddRect">
                插入矩形
              </a-button>
              <LocalImageFileTrigger
                aria-label="从右键菜单插入图片"
                label="插入图片"
                variant="menu"
                @select="handleContextMenuImageImport"
              />
              <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuAddImageFrame">
                插入图片框
              </a-button>
            </div>

            <template v-if="contextMenuHasSelection">
              <div class="stage-context-menu__divider" />
              <div class="stage-context-menu__group">
                <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuCopy">
                  复制所选
                </a-button>
                <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuDuplicate">
                  重复所选
                </a-button>
                <a-button
                  v-if="contextMenuCanSetBackground"
                  class="stage-context-menu__item"
                  type="text"
                  @click="handleContextMenuSetImageAsBackground"
                >
                  设为背景
                </a-button>
                <a-button class="stage-context-menu__item danger" type="text" @click="handleContextMenuDelete">
                  删除所选
                </a-button>
              </div>
            </template>

            <div class="stage-context-menu__divider" />
            <div class="stage-context-menu__group">
              <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuPaste">
                粘贴
              </a-button>
            </div>
          </div>
        </section>

        <aside v-show="!isEditorSideCollapsed" class="editor-side">
          <div class="side-tabs panel-shell">
            <a-tabs
              :active-key="activeSideTab"
              class="side-tabs-nav"
              @change="handleSideTabChange"
            >
              <a-tab-pane
                v-for="tab in sideTabs"
                :key="tab.key"
                :title="tab.label"
              />
            </a-tabs>
          </div>

          <div class="editor-side-body">
            <InspectorPanel
              v-if="activeSideTab === 'node'"
              :selected-count="inspectorSelectedCount"
              :selected-node="inspectorNode"
              :selected-animations="selectedNodeAnimations"
              :timeline-summary="selectedNodeTimelineSummary"
              @replace-image="handleImageReplace"
              @update-node="handleNodeUpdate"
              @upsert-animation="handleTimelineAnimationUpsert"
              @remove-animation="handleTimelineAnimationRemove"
            />
            <TimelinePanel
              v-else
              :slide="activeSlide ?? null"
              :selected-node-id="selectedNodeId"
              @duplicate-step="handleTimelineStepDuplicate"
              @preview-step="handleTimelinePreviewRequest"
              @reorder-step="handleTimelineStepReorder"
              @upsert-step="handleTimelineStepUpsert"
              @remove-step="handleTimelineStepRemove"
            />
          </div>
        </aside>
      </div>
    </main>

    <a-drawer
      :closable="true"
      :footer="false"
      :mask="false"
      :visible="isSlideSettingsDrawerVisible"
      class="slide-settings-drawer"
      placement="right"
      title="页面设置"
      width="360px"
      @cancel="closeSlideSettingsDrawer"
    >
      <div class="slide-settings-drawer__body">
        <SlideSettingsPanel
          :slide="activeSlide ?? null"
          @update-slide="handleSlideUpdate"
        />
      </div>
    </a-drawer>
  </section>
</template>

<style scoped src="./CoursewareEditor.css"></style>
