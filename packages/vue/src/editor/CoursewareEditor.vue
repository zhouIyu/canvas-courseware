<script setup lang="ts">
import type {
  CoursewareDocument,
  EditorSnapshot,
  NodeAnimation,
  NodePatch,
  NodeTimelineSummary,
  ReorderPosition,
  Slide,
  TimelineStep,
} from "@canvas-courseware/core";
import { createSlideNodeTimelineSummaryMap } from "@canvas-courseware/core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { DEFAULT_EDITOR_HEIGHT } from "../shared";
import InspectorPanel from "./InspectorPanel.vue";
import LayerPanel from "./LayerPanel.vue";
import SlideSettingsPanel from "./SlideSettingsPanel.vue";
import TimelinePanel from "./TimelinePanel.vue";
import type {
  LayerAlignMode,
  LayerDistributeMode,
} from "./useEditorBatchLayout";
import { useCoursewareEditor } from "./useCoursewareEditor";

/** 编辑器右侧管理区的标签名。 */
type EditorSideTab = "slide" | "node" | "layers" | "timeline";

/** 标签切换控件传回值的兼容类型。 */
type EditorSideTabValue = string | number;

/** 编辑器组件的显示参数。 */
const props = withDefaults(
  defineProps<{
    /** 组件标题。 */
    title?: string;
    /** 工作区最小高度。 */
    height?: number;
    /** 是否展示组件内部头部。 */
    showHeader?: boolean;
  }>(),
  {
    title: "课件编辑工作台",
    height: DEFAULT_EDITOR_HEIGHT,
    showHeader: true,
  },
);

/** 编辑器对外暴露的事件。 */
const emit = defineEmits<{
  /** 向外同步最新编辑快照，供 app 层接管产品状态。 */
  "snapshot-change": [snapshot: EditorSnapshot];
}>();

/** 编辑器通过 v-model 接收并回传标准课件文档。 */
const documentModel = defineModel<CoursewareDocument | undefined>();

/** 标记当前是否正在把内部快照回写给外层 v-model，避免误判成外部导入。 */
const isSyncingDocumentModel = ref(false);

/** 右侧标签列表，用于渲染管理区切换按钮。 */
const sideTabs = [
  {
    key: "slide" as const,
    label: "页面设置",
  },
  {
    key: "node" as const,
    label: "组件属性",
  },
  {
    key: "layers" as const,
    label: "组件列表",
  },
  {
    key: "timeline" as const,
    label: "时间轴",
  },
];

/** 当前右侧激活的管理标签。 */
const activeSideTab = ref<EditorSideTab>("slide");

/** 当前左侧页面栏是否已收起。 */
const isSlideRailCollapsed = ref(false);

/** 当前右侧管理栏是否已收起。 */
const isEditorSideCollapsed = ref(false);

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
  addRect,
  addSlide,
  addText,
  alignSelectedNodes,
  applyingExternalDocument,
  activateSlide,
  canRedo,
  canUndo,
  distributeSelectedNodes,
  editorCanvasRef,
  removeTimelineAnimation,
  removeTimelineStep,
  redo,
  reorderNode,
  replaceDocument,
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
 * 当选中对象变化时，自动把右侧标签切换到对应区块。
 * 单选切到属性，多选切到组件列表，切页后回到页面设置。
 */
watch(
  [
    () => snapshot.value.activeSlideId,
    () => snapshot.value.selection.nodeIds.length,
  ],
  ([activeSlideId, selectionCount], previousValues) => {
    /** `immediate` 首次执行时旧值为空，这里统一做一次安全展开。 */
    const [previousSlideId, previousSelectionCount] = previousValues ?? [];

    /**
     * 只有真正切页时，才强制回到“页面设置”。
     * 这样时间轴步骤、动画等与选中态无关的更新，就不会把用户手动停留的标签覆盖掉。
     */
    if (activeSlideId !== previousSlideId) {
      retainedInspectorNodeId.value = null;
      activeSideTab.value = "slide";
      return;
    }

    /**
     * 只有选中数量真实变化时，才根据选中态自动切换标签。
     * 避免 timeline 编辑导致 snapshot 更新后，因为 watch 源值重新求值而错误回跳。
     */
    if (selectionCount === previousSelectionCount) {
      return;
    }

    if (selectionCount > 1) {
      activeSideTab.value = "layers";
      return;
    }

    if (selectionCount === 1 && activeSideTab.value === "slide") {
      activeSideTab.value = "node";
      return;
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

/** 当前 slide 的更新入口。 */
const handleSlideUpdate = (patch: Partial<Pick<Slide, "name" | "size" | "background">>) => {
  if (!activeSlide.value) {
    return;
  }

  updateSlide(activeSlide.value.id, patch);
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

/** 切换右侧管理区标签。 */
const activateSideTab = (tab: EditorSideTab) => {
  activeSideTab.value = tab;
  isEditorSideCollapsed.value = false;
};

/** 判断当前值是否为受支持的右侧标签 key。 */
const isEditorSideTab = (value: EditorSideTabValue): value is EditorSideTab =>
  value === "slide" || value === "node" || value === "layers" || value === "timeline";

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
  toolbarResizeObserver?.disconnect();
  toolbarResizeObserver = null;
  stageViewportResizeObserver?.disconnect();
  stageViewportResizeObserver = null;
});
</script>

<template>
  <section class="editor-shell" :class="{ 'is-embedded': isEmbedded }" :style="editorShellStyle">
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
      <section ref="toolbarShellRef" class="toolbar-shell panel-shell">
        <div class="toolbar-group toolbar-group-insert">
          <span class="toolbar-caption">插入</span>
          <a-button class="toolbar-action-button" type="text" @click="addText">文本</a-button>
          <a-button class="toolbar-action-button" type="text" @click="addRect">矩形</a-button>
          <a-button class="toolbar-action-button" type="text" @click="addImage">图片</a-button>
        </div>

        <div class="toolbar-group toolbar-group-history">
          <span class="toolbar-caption">历史</span>
          <a-button
            class="toolbar-action-button"
            type="text"
            :disabled="!canUndo"
            @click="undo"
          >
            撤销
          </a-button>
          <a-button
            class="toolbar-action-button"
            type="text"
            :disabled="!canRedo"
            @click="redo"
          >
            重做
          </a-button>
        </div>
      </section>

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

        <aside v-show="!isSlideRailCollapsed" class="slide-rail panel-shell">
          <div class="rail-toolbar">
            <a-button
              class="secondary-button rail-create-button"
              size="small"
              type="outline"
              @click="addSlide"
            >
              + 新建页面
            </a-button>
          </div>

          <div class="slide-list">
            <a-button
              v-for="(slide, index) in snapshot.document.slides"
              :key="slide.id"
              class="slide-card"
              :class="{ 'is-active': slide.id === snapshot.activeSlideId }"
              type="text"
              :aria-pressed="slide.id === snapshot.activeSlideId"
              @click="activateSlide(slide.id)"
            >
              <div class="slide-card-top">
                <span class="slide-index">{{ String(index + 1).padStart(2, "0") }}</span>
              </div>

              <div class="slide-thumbnail" :style="{ background: slide.background.fill }">
                <span class="thumb-line long" />
                <span class="thumb-line short" />
                <span class="thumb-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </a-button>
          </div>
        </aside>

        <section class="workspace-shell panel-shell">
          <div ref="stageViewportRef" class="stage-scroll" :style="stageStyle">
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
            <SlideSettingsPanel
              v-if="activeSideTab === 'slide'"
              :slide="activeSlide ?? null"
              @update-slide="handleSlideUpdate"
            />
            <InspectorPanel
              v-else-if="activeSideTab === 'node'"
              :selected-count="inspectorSelectedCount"
              :selected-node="inspectorNode"
              :selected-animations="selectedNodeAnimations"
              :timeline-summary="selectedNodeTimelineSummary"
              @update-node="handleNodeUpdate"
              @upsert-animation="handleTimelineAnimationUpsert"
              @remove-animation="handleTimelineAnimationRemove"
            />
            <LayerPanel
              v-else-if="activeSideTab === 'layers'"
              :nodes="activeSlide?.nodes ?? []"
              :node-timeline-summary-map="nodeTimelineSummaryMap"
              :selected-node-ids="snapshot.selection.nodeIds"
              @select="handleLayerSelect"
              @align="handleLayerAlign"
              @distribute="handleLayerDistribute"
              @reorder="handleLayerReorder"
            />
            <TimelinePanel
              v-else
              :slide="activeSlide ?? null"
              :selected-node-id="selectedNodeId"
              @upsert-step="handleTimelineStepUpsert"
              @remove-step="handleTimelineStepRemove"
            />
          </div>
        </aside>
      </div>
    </main>
  </section>
</template>

<style scoped src="./CoursewareEditor.css"></style>
