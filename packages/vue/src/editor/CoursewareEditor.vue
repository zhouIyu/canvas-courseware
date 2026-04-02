<script setup lang="ts">
import type {
  CoursewareDocument,
  EditorSnapshot,
  NodeTimelineSummary,
  NodeAnimation,
  NodePatch,
  ReorderPosition,
  Slide,
  TimelineStep,
} from "@canvas-courseware/core";
import { createSlideNodeTimelineSummaryMap } from "@canvas-courseware/core";
import { computed, ref, watch } from "vue";
import { DEFAULT_EDITOR_HEIGHT, formatSelectionLabel } from "../shared";
import InspectorPanel from "./InspectorPanel.vue";
import LayerPanel from "./LayerPanel.vue";
import SlideSettingsPanel from "./SlideSettingsPanel.vue";
import TimelinePanel from "./TimelinePanel.vue";
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

/** 从 composable 中解出编辑器所需的状态与操作。 */
const {
  activeSlide,
  addImage,
  addRect,
  addSlide,
  addText,
  applyingExternalDocument,
  activateSlide,
  editorCanvasRef,
  removeTimelineAnimation,
  removeTimelineStep,
  reorderNode,
  replaceDocument,
  selectedNode,
  selectedNodeId,
  selectNodes,
  snapshot,
  stats,
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
    if (!document || applyingExternalDocument.value || document === snapshot.value.document) {
      return;
    }

    replaceDocument(document);
  },
);

/** 内部文档变化后，把最新 JSON 回写给外层。 */
watch(
  () => snapshot.value.document,
  (document) => {
    documentModel.value = document;
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

    if (selectionCount === 1) {
      activeSideTab.value = "node";
      return;
    }

    if (selectionCount > 1) {
      activeSideTab.value = "layers";
      return;
    }

    activeSideTab.value = "slide";
  },
  { immediate: true },
);

/** 当前激活页在整个文档中的索引。 */
const activeSlideIndex = computed(() =>
  snapshot.value.document.slides.findIndex((slide) => slide.id === snapshot.value.activeSlideId),
);

/** 外层工作区的高度样式。 */
const stageStyle = computed(() => ({
  minHeight: `${props.height}px`,
}));

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

/** 当前选中信息的摘要文案。 */
const selectionLabel = computed(() =>
  formatSelectionLabel(snapshot.value.selection.nodeIds.length),
);

/** 当前页面的步骤数量摘要。 */
const stepSummary = computed(() => `${activeSlide.value?.timeline.steps.length ?? 0} 个步骤`);

/** 当前页面的节点数量摘要。 */
const nodeSummary = computed(() => `${activeSlide.value?.nodes.length ?? 0} 个对象`);

/** 当前页面对象数和步骤数的合并摘要。 */
const workspaceSummaryLabel = computed(() => `${nodeSummary.value} · ${stepSummary.value}`);

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

/** 当前选中节点的步骤归属摘要。 */
const selectedNodeTimelineSummary = computed<NodeTimelineSummary | null>(() =>
  selectedNode.value ? nodeTimelineSummaryMap.value[selectedNode.value.id] ?? null : null,
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
</script>

<template>
  <section class="editor-shell" :class="{ 'is-embedded': isEmbedded }">
    <header v-if="showHeader" class="editor-topbar">
      <div class="editor-heading">
        <p class="section-kicker">编辑工作台</p>
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
      <section class="toolbar-shell panel-shell">
        <div class="toolbar-group">
          <span class="toolbar-label">基础组件</span>
          <a-button class="primary-button" type="primary" @click="addText">文本</a-button>
          <a-button class="primary-button" type="primary" @click="addRect">矩形</a-button>
          <a-button class="primary-button" type="primary" @click="addImage">图片</a-button>
        </div>
      </section>

      <div class="editor-layout" :class="editorLayoutClass">
        <aside v-show="!isSlideRailCollapsed" class="slide-rail panel-shell">
          <div class="panel-head">
            <div>
              <p class="section-kicker">页面</p>
              <h3>页面列表</h3>
            </div>
            <div class="panel-actions">
              <a-button
                class="secondary-button compact"
                size="small"
                type="outline"
                @click="addSlide"
              >
                新增
              </a-button>
            </div>
          </div>

          <div class="slide-list">
            <button
              v-for="(slide, index) in snapshot.document.slides"
              :key="slide.id"
              class="slide-card"
              :class="{ 'is-active': slide.id === snapshot.activeSlideId }"
              type="button"
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

              <strong>{{ slide.name }}</strong>
            </button>
          </div>
        </aside>

        <section class="workspace-shell panel-shell">
          <button
            class="stage-side-badge stage-side-badge-left"
            type="button"
            :aria-label="isSlideRailCollapsed ? '展开左侧页面栏' : '收起左侧页面栏'"
            @click="toggleSlideRail"
          >
            {{ isSlideRailCollapsed ? "›" : "‹" }}
          </button>
          <button
            class="stage-side-badge stage-side-badge-right"
            type="button"
            :aria-label="isEditorSideCollapsed ? '展开右侧管理栏' : '收起右侧管理栏'"
            @click="toggleEditorSide"
          >
            {{ isEditorSideCollapsed ? "‹" : "›" }}
          </button>

          <header class="workspace-head">
            <div>
              <p class="section-kicker">画布</p>
              <h3>
                第 {{ activeSlideIndex + 1 > 0 ? activeSlideIndex + 1 : 0 }} 页
                <span v-if="activeSlide">· {{ activeSlide.name }}</span>
              </h3>
            </div>

            <div class="workspace-badges" :class="{ 'is-embedded': isEmbedded }">
              <span class="badge">{{ selectionLabel }}</span>
              <span class="badge subtle">
                {{ isEmbedded ? workspaceSummaryLabel : nodeSummary }}
              </span>
              <span v-if="!isEmbedded" class="badge subtle">{{ stepSummary }}</span>
            </div>
          </header>

          <div class="stage-scroll" :style="stageStyle">
            <div class="stage-backdrop">
              <div v-if="activeSlide" class="stage-surface" :style="canvasStyle">
                <canvas ref="editorCanvasRef" />
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

          <SlideSettingsPanel
            v-if="activeSideTab === 'slide'"
            :slide="activeSlide ?? null"
            @update-slide="handleSlideUpdate"
          />
          <InspectorPanel
            v-else-if="activeSideTab === 'node'"
            :selected-count="snapshot.selection.nodeIds.length"
            :selected-node="selectedNode ?? null"
            :timeline-summary="selectedNodeTimelineSummary"
            @update-node="handleNodeUpdate"
          />
          <LayerPanel
            v-else-if="activeSideTab === 'layers'"
            :nodes="activeSlide?.nodes ?? []"
            :node-timeline-summary-map="nodeTimelineSummaryMap"
            :selected-node-ids="snapshot.selection.nodeIds"
            @select="handleLayerSelect"
            @reorder="handleLayerReorder"
          />
          <TimelinePanel
            v-else
            :slide="activeSlide ?? null"
            :selected-node-id="selectedNodeId"
            @upsert-step="handleTimelineStepUpsert"
            @remove-step="handleTimelineStepRemove"
            @upsert-animation="handleTimelineAnimationUpsert"
            @remove-animation="handleTimelineAnimationRemove"
          />
        </aside>
      </div>
    </main>
  </section>
</template>

<style scoped src="./CoursewareEditor.css"></style>
