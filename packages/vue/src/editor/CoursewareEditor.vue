<script setup lang="ts">
import type {
  CoursewareDocument,
  DiagnosticLogger,
  EditorSnapshot,
  NodeAnimation,
  NodeTimelineSummary,
  ObjectFit,
  TextNode,
} from "@canvas-courseware/core";
import { createSlideNodeTimelineSummaryMap } from "@canvas-courseware/core";
import type { FabricEditorContextMenuRequest } from "@canvas-courseware/fabric";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import { DEFAULT_EDITOR_HEIGHT } from "../shared";
import BackgroundImageFitModal from "./BackgroundImageFitModal.vue";
import EditorCanvasWorkspace from "./EditorCanvasWorkspace.vue";
import EditorToolbar from "./EditorToolbar.vue";
import InspectorPanel from "./InspectorPanel.vue";
import SlideRailPanel from "./SlideRailPanel.vue";
import SlideSettingsDrawer from "./SlideSettingsDrawer.vue";
import TimelinePanel from "./TimelinePanel.vue";
import { provideCoursewareDiagnosticLogger } from "./diagnostics";
import { useCoursewareEditor } from "./useCoursewareEditor";
import { useCoursewareEditorShellActions } from "./useCoursewareEditorShellActions";
import { useSlideSettingsDrawer } from "./useSlideSettingsDrawer";
/** 编辑器右侧管理区的标签名。 */
type EditorSideTab = "node" | "timeline";

/** 标签切换控件传回值的兼容类型。 */
type EditorSideTabValue = string | number;

/** 时间轴发起预览请求时抛给 app 层的载荷。 */
interface TimelinePreviewRequestPayload {
  /** 需要对齐到的 slide id。 */
  slideId: string;
  /** 需要作为下一步焦点的步骤索引。 */
  stepIndex: number;
}

/** 编辑器向应用层抛出的 slide 缩略图截图结果。 */
interface SlideThumbnailCapturedPayload {
  /** 已完成截图的 slide id。 */
  slideId: string;
  /** 当前 slide 对应的缩略图 data URL。 */
  thumbnail: string;
}

/** 中央舞台壳层暴露给父层的最小能力。 */
interface EditorCanvasWorkspaceExposed {
  /** 供适配层把右键菜单请求转交给舞台壳层。 */
  openContextMenu: (payload: FabricEditorContextMenuRequest) => void;
}

/** 编辑器向应用壳层暴露的自动保存阻塞原因。 */
type EditorAutoSaveBlockReason = "inline-text-editing" | "canvas-transform";

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
    /** 外部注入的统一诊断 logger，供编辑器关键链路复用。 */
    diagnosticLogger?: DiagnosticLogger | null;
  }>(),
  {
    title: "课件编辑工作台",
    height: DEFAULT_EDITOR_HEIGHT,
    showHeader: true,
    slideThumbnailMap: () => ({}),
    diagnosticLogger: null,
  },
);

/** 在编辑器组件树内提供统一 logger，避免子组件各自维护独立日志入口。 */
provideCoursewareDiagnosticLogger(props.diagnosticLogger);

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

/** 中央舞台壳层引用，供 Fabric 适配器转发右键菜单请求。 */
const editorCanvasWorkspaceRef = ref<(ComponentPublicInstance & EditorCanvasWorkspaceExposed) | null>(null);

/** 接收子组件回传的真实 canvas 节点，供 Fabric 适配器挂载。 */
const handleEditorCanvasElementChange = (canvasElement: HTMLCanvasElement | null) => {
  editorCanvasRef.value = canvasElement;
};

/** 接收适配层发起的右键菜单请求。 */
const handleCanvasContextMenuRequest = (payload: FabricEditorContextMenuRequest) => {
  editorCanvasWorkspaceRef.value?.openContextMenu(payload);
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

/** 属性面板最近一次稳定选中的节点 id。 */
const retainedInspectorNodeId = ref<string | null>(null);

/** 工具条容器引用，用来计算剩余可用高度。 */
const toolbarShellRef = ref<HTMLElement | null>(null);

/** 当前工具条实际高度。 */
const toolbarHeight = ref(0);

/** 从 composable 中解出编辑器所需的状态与操作。 */
const {
  activeSlide,
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
  inlineTextEditingLayout,
  isInlineTextEditingActive,
  getAutoSaveBlockReason,
  removeTimelineAnimation,
  removeTimelineStep,
  removeSlide,
  removeSelected,
  redo,
  pasteClipboard,
  refreshInlineTextEditingLayout,
  setSlideBackgroundImageFromNode,
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
  diagnosticLogger: props.diagnosticLogger,
});

/** 统一收口页面设置抽屉与“设为背景”快捷链路的状态。 */
const {
  backgroundImageFitModalInitialFit,
  backgroundImageFitModalSourceLabel,
  closeBackgroundImageFitModal,
  closeSlideSettingsDrawer,
  handleBackgroundImageFitConfirm,
  isApplyingBackgroundImageFit,
  isBackgroundImageFitModalVisible,
  isSlideSettingsDrawerVisible,
  openBackgroundImageFitModal,
  openSlideSettingsDrawer,
  resetSlideSettingsContext,
  slideSettingsFeedbackMessage,
  slideSettingsFeedbackTone,
  slideSettingsFocusToken,
  slideSettingsPreferredSection,
} = useSlideSettingsDrawer({
  activeSlide,
  setSlideBackgroundImageFromNode,
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
      closeSlideSettingsDrawer();
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
    resetSlideSettingsContext();
  },
);

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

/** 当前文本浮动工具条绑定的文本节点。 */
const editingTextToolNode = computed<TextNode | null>(() => {
  if (
    !activeSlide.value ||
    !inlineTextEditingLayout.value ||
    inlineTextEditingLayout.value.slideId !== activeSlide.value.id
  ) {
    return null;
  }

  const node = activeSlide.value.nodes.find(
    (candidate) => candidate.id === inlineTextEditingLayout.value?.nodeId,
  );
  return node?.type === "text" ? node : null;
});

/** 收敛编辑器父壳层中的页面、图层与时间轴动作。 */
const {
  activeSlideIndex,
  captureActiveSlideThumbnail,
  handleLayerAlign,
  handleLayerDistribute,
  handleLayerReorder,
  handleLayerReorderToIndex,
  handleLayerSelect,
  handleNodeUpdate,
  handleSlideActivate,
  handleSlideCreate,
  handleSlideCreateAfter,
  handleSlideDuplicate,
  handleSlideRemove,
  handleSlideRename,
  handleSlideReorder,
  handleSlideUpdate,
  handleTimelineAnimationRemove,
  handleTimelineAnimationUpsert,
  handleTimelinePreviewRequest,
  handleTimelineStepDuplicate,
  handleTimelineStepRemove,
  handleTimelineStepReorder,
  handleTimelineStepUpsert,
  slideCount,
} = useCoursewareEditorShellActions({
  activeSlide,
  snapshot,
  captureActiveSlideThumbnailDataUrl,
  emitSlideThumbnailCaptured: (payload) => {
    emit("slide-thumbnail-captured", payload);
  },
  emitTimelinePreviewRequest: (payload) => {
    emit("timeline-preview-request", payload);
  },
  updateSlide,
  activateSlide,
  addSlide,
  addSlideAfter,
  duplicateSlideById,
  removeSlide,
  reorderSlide,
  updateNode,
  selectNodes,
  reorderNode,
  alignSelectedNodes,
  distributeSelectedNodes,
  upsertTimelineStep,
  removeTimelineStep,
  reorderTimelineStep,
  upsertTimelineAnimation,
  removeTimelineAnimation,
});

/** 从工具条导入一张本地图片，并在失败时给出明确反馈。 */
const handleLocalImageImport = async (file: File) => {
  try {
    await addImageFromFile(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片导入失败，请重试";
    window.alert(message);
  }
};

/** 从属性面板直接替换当前图片节点，并保留节点布局和当前选中态。 */
const handleImageReplace = async (nodeId: string, file: File) => {
  try {
    await replaceImageFromFile(nodeId, file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片替换失败，请重试";
    window.alert(message);
  }
};

/** 中央舞台请求把某张图片直接转换成页面背景。 */
const handleStageSetImageAsBackground = (payload: {
  nodeId: string;
  sourceLabel: string;
  preferredFit?: ObjectFit;
}) => {
  openBackgroundImageFitModal({
    nodeId: payload.nodeId,
    sourceLabel: payload.sourceLabel,
    preferredFit: payload.preferredFit,
  });
};

/** 中央舞台请求替换某张图片节点资源。 */
const handleStageImageReplace = async (payload: {
  nodeId: string;
  file: File;
}) => {
  await handleImageReplace(payload.nodeId, payload.file);
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

/** 切换左侧页面栏显隐。 */
const toggleSlideRail = () => {
  isSlideRailCollapsed.value = !isSlideRailCollapsed.value;
};

/** 切换右侧管理区显隐。 */
const toggleEditorSide = () => {
  isEditorSideCollapsed.value = !isEditorSideCollapsed.value;
};

/** 读取当前工具条的真实高度。 */
const updateToolbarHeight = () => {
  toolbarHeight.value = toolbarShellRef.value?.offsetHeight ?? 0;
};

/** 监听工具条尺寸变化，让三栏高度分配及时同步。 */
let toolbarResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  updateToolbarHeight();

  if (toolbarShellRef.value) {
    toolbarResizeObserver = new ResizeObserver(() => {
      updateToolbarHeight();
    });
    toolbarResizeObserver.observe(toolbarShellRef.value);
  }
});

onBeforeUnmount(() => {
  toolbarResizeObserver?.disconnect();
  toolbarResizeObserver = null;
});

/** 暴露给应用壳层的组件方法。 */
defineExpose({
  captureActiveSlideThumbnail,
  getAutoSaveBlockReason: (): EditorAutoSaveBlockReason | null => getAutoSaveBlockReason(),
  isInlineTextEditingActive,
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
          @add-rect="addRect"
          @add-text="addText"
          @import-image="handleLocalImageImport"
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

        <EditorCanvasWorkspace
          ref="editorCanvasWorkspaceRef"
          :active-slide="activeSlide ?? null"
          :editing-text-tool-node="editingTextToolNode"
          :inline-text-editing-layout="inlineTextEditingLayout"
          :node-timeline-summary-map="nodeTimelineSummaryMap"
          :pane-height="paneHeight"
          :selected-node-ids="snapshot.selection.nodeIds"
          :set-canvas-element="handleEditorCanvasElementChange"
          :slide-index="activeSlideIndex"
          @add-rect="addRect"
          @add-text="addText"
          @align-layers="handleLayerAlign"
          @clear-selection="clearSelection"
          @copy-selection="copySelected"
          @delete-selection="removeSelected"
          @distribute-layers="handleLayerDistribute"
          @duplicate-selection="duplicateSelected"
          @import-image="handleLocalImageImport"
          @open-inspector="activateSideTab('node')"
          @open-slide-settings="openSlideSettingsDrawer"
          @open-timeline="activateSideTab('timeline')"
          @paste-selection="pasteClipboard"
          @refresh-inline-text-layout="refreshInlineTextEditingLayout"
          @replace-image="handleStageImageReplace"
          @reorder-layer="handleLayerReorder"
          @reorder-layer-to-index="handleLayerReorderToIndex"
          @request-inline-text-editing-exit="requestInlineTextEditingExit"
          @select-layer="handleLayerSelect"
          @set-image-as-background="handleStageSetImageAsBackground"
          @update-node="handleNodeUpdate"
        />

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

    <SlideSettingsDrawer
      :feedback-message="slideSettingsFeedbackMessage"
      :feedback-tone="slideSettingsFeedbackTone"
      :focus-token="slideSettingsFocusToken"
      :preferred-section="slideSettingsPreferredSection"
      :slide="activeSlide ?? null"
      :slide-count="slideCount"
      :slide-index="activeSlideIndex"
      :visible="isSlideSettingsDrawerVisible"
      @close="closeSlideSettingsDrawer"
      @update-slide="handleSlideUpdate"
    />
  </section>
</template>

<style scoped src="./CoursewareEditor.css"></style>
