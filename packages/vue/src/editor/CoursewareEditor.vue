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
  clearSelection,
  editorCanvasRef,
  removeSelected,
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
        <p class="section-kicker">Editor Workbench</p>
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
          <span class="stat-label">Slides</span>
          <strong>{{ stats.slideCount }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Nodes</span>
          <strong>{{ stats.nodeCount }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">Timeline</span>
          <strong>{{ stats.stepCount }}</strong>
        </article>
      </div>
    </header>

    <main class="editor-workbench">
      <section class="toolbar-shell panel-shell">
        <div class="toolbar-group">
          <span class="toolbar-label">基础组件</span>
          <button class="primary-button" type="button" @click="addText">文本</button>
          <button class="primary-button" type="button" @click="addRect">矩形</button>
          <button class="primary-button" type="button" @click="addImage">图片</button>
        </div>

        <div class="toolbar-group">
          <span class="toolbar-label">页面管理</span>
          <button class="secondary-button" type="button" @click="addSlide">新增页面</button>
          <button class="secondary-button" type="button" @click="clearSelection">清空选择</button>
          <button class="danger-button" type="button" @click="removeSelected">删除选中</button>
        </div>
      </section>

      <div class="editor-layout" :class="editorLayoutClass">
        <aside class="slide-rail panel-shell" :class="{ 'is-collapsed': isSlideRailCollapsed }">
          <div class="panel-head">
            <div>
              <p class="section-kicker">Slides</p>
              <h3>{{ isSlideRailCollapsed ? "页面" : "页面列表" }}</h3>
            </div>
            <div class="panel-actions">
              <button
                v-if="!isSlideRailCollapsed"
                class="secondary-button compact"
                type="button"
                @click="addSlide"
              >
                新增
              </button>
              <button
                class="secondary-button compact"
                type="button"
                @click="toggleSlideRail"
              >
                {{ isSlideRailCollapsed ? "展开" : "收起" }}
              </button>
            </div>
          </div>

          <div v-if="!isSlideRailCollapsed" class="slide-list">
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
                <span class="slide-node-count">{{ slide.nodes.length }} 个对象</span>
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
              <small>{{ slide.timeline.steps.length }} 个播放步骤</small>
            </button>
          </div>
          <div v-else class="collapsed-rail-summary">
            <span class="collapsed-count">{{ snapshot.document.slides.length }}</span>
            <small>页</small>
            <button class="collapsed-rail-button" type="button" @click="addSlide">+</button>
          </div>
        </aside>

        <section class="workspace-shell panel-shell">
          <header class="workspace-head">
            <div>
              <p class="section-kicker">Canvas Stage</p>
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

        <aside class="editor-side" :class="{ 'is-collapsed': isEditorSideCollapsed }">
          <div class="side-tabs panel-shell" :class="{ 'is-collapsed': isEditorSideCollapsed }">
            <div v-if="!isEditorSideCollapsed" class="side-tab-list">
              <button
                v-for="tab in sideTabs"
                :key="tab.key"
                class="side-tab-button"
                :class="{ 'is-active': activeSideTab === tab.key }"
                type="button"
                :aria-pressed="activeSideTab === tab.key"
                @click="activateSideTab(tab.key)"
              >
                {{ tab.label }}
              </button>
            </div>
            <button
              class="secondary-button compact side-toggle-button"
              type="button"
              @click="toggleEditorSide"
            >
              {{ isEditorSideCollapsed ? "展开" : "收起" }}
            </button>
          </div>

          <div v-if="isEditorSideCollapsed" class="collapsed-side-shell panel-shell">
            <span class="collapsed-side-label">{{ sideTabs.find((tab) => tab.key === activeSideTab)?.label }}</span>
            <small>右侧管理区</small>
            <button class="secondary-button compact" type="button" @click="toggleEditorSide">
              展开
            </button>
          </div>

          <SlideSettingsPanel
            v-else-if="activeSideTab === 'slide'"
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

<style scoped>
.editor-shell {
  display: grid;
  gap: var(--cw-space-5);
  min-width: 0;
  color: var(--cw-color-text);
}

.editor-shell.is-embedded {
  gap: var(--cw-space-4);
}

.panel-shell,
.editor-topbar {
  border: 1px solid var(--cw-color-border);
  border-radius: var(--cw-radius-xl);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.84)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-medium);
}

.editor-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 420px);
  gap: var(--cw-space-5);
  align-items: end;
  padding: 28px;
}

.section-kicker,
.toolbar-label,
.slide-index {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cw-color-primary);
}

.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cw-space-3);
  margin-top: var(--cw-space-2);
}

.title-row h2,
.panel-head h3,
.workspace-head h3 {
  margin: 0;
  font-size: clamp(28px, 3.4vw, 42px);
  line-height: 1.1;
}

.editor-copy {
  max-width: 62ch;
  margin: var(--cw-space-3) 0 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--cw-color-muted);
}

.mode-pill {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 var(--cw-space-3);
  border-radius: var(--cw-radius-pill);
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-color-primary);
  background: rgba(13, 148, 136, 0.12);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cw-space-3);
}

.stat-card {
  display: grid;
  gap: var(--cw-space-2);
  padding: 18px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-md);
  background:
    linear-gradient(180deg, rgba(20, 184, 166, 0.1), rgba(255, 255, 255, 0.96)),
    var(--cw-color-surface);
}

.stat-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cw-color-muted);
}

.stat-card strong {
  font-size: clamp(28px, 2.4vw, 36px);
  line-height: 1;
}

.editor-workbench {
  display: grid;
  gap: var(--cw-space-4);
  min-width: 0;
}

.toolbar-shell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-4);
  padding: var(--cw-space-5);
}

.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cw-space-2);
}

.editor-layout {
  display: grid;
  grid-template-columns:
    var(--cw-editor-rail-width)
    minmax(0, 1fr)
    var(--cw-editor-side-width);
  gap: var(--cw-space-5);
  align-items: start;
  min-width: 0;
}

.editor-layout > * {
  min-width: 0;
}

.editor-layout.is-left-collapsed {
  grid-template-columns: 88px minmax(0, 1fr) var(--cw-editor-side-width);
}

.editor-layout.is-right-collapsed {
  grid-template-columns: var(--cw-editor-rail-width) minmax(0, 1fr) 96px;
}

.editor-layout.is-left-collapsed.is-right-collapsed {
  grid-template-columns: 88px minmax(0, 1fr) 96px;
}

.slide-rail,
.workspace-shell,
.side-tabs {
  padding: var(--cw-space-5);
}

.slide-rail,
.editor-side {
  display: grid;
  gap: var(--cw-space-4);
  min-width: 0;
}

.slide-rail.is-collapsed,
.editor-side.is-collapsed {
  align-content: start;
}

.panel-head,
.workspace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-4);
}

.panel-actions,
.side-tab-list {
  display: flex;
  align-items: center;
  gap: var(--cw-space-2);
}

.panel-head h3,
.workspace-head h3 {
  font-size: 24px;
}

.slide-list {
  display: grid;
  gap: var(--cw-space-3);
}

.collapsed-rail-summary,
.collapsed-side-shell {
  display: grid;
  gap: var(--cw-space-3);
  justify-items: center;
  padding: var(--cw-space-4);
  border: 1px dashed rgba(13, 148, 136, 0.22);
  border-radius: var(--cw-radius-lg);
  text-align: center;
  background: rgba(255, 255, 255, 0.86);
}

.collapsed-count {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  color: var(--cw-color-primary);
}

.collapsed-rail-summary small,
.collapsed-side-shell small {
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.collapsed-rail-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(13, 148, 136, 0.18);
  border-radius: var(--cw-radius-pill);
  font-size: 24px;
  line-height: 1;
  color: var(--cw-color-primary);
  cursor: pointer;
  background: rgba(255, 255, 255, 0.92);
}

.slide-card {
  display: grid;
  gap: var(--cw-space-2);
  width: 100%;
  padding: 16px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-md);
  text-align: left;
  cursor: pointer;
  color: var(--cw-color-text);
  background: rgba(255, 255, 255, 0.92);
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard);
}

.slide-card:hover {
  transform: translateY(-1px);
  border-color: rgba(13, 148, 136, 0.28);
}

.slide-card.is-active {
  border-color: rgba(13, 148, 136, 0.42);
  background:
    linear-gradient(180deg, rgba(20, 184, 166, 0.12), rgba(255, 255, 255, 0.96)),
    var(--cw-color-surface);
  box-shadow: inset 0 0 0 1px rgba(20, 184, 166, 0.18);
}

.slide-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-2);
}

.slide-thumbnail {
  display: grid;
  gap: 10px;
  justify-items: center;
  min-height: 92px;
  padding: 16px 14px;
  border: 1px dashed rgba(19, 78, 74, 0.16);
  border-radius: var(--cw-radius-md);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.68);
}

.thumb-line {
  display: block;
  height: 8px;
  border-radius: var(--cw-radius-pill);
  background: rgba(82, 112, 168, 0.78);
}

.thumb-line.long {
  width: 72px;
}

.thumb-line.short {
  width: 48px;
  opacity: 0.62;
}

.thumb-dots {
  display: flex;
  gap: 6px;
}

.thumb-dots i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(82, 112, 168, 0.7);
}

.slide-node-count,
.slide-card small {
  font-size: 13px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.slide-card strong {
  font-size: 16px;
  line-height: 1.5;
}

.workspace-shell {
  display: grid;
  gap: var(--cw-space-4);
  min-width: 0;
}

.workspace-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cw-space-2);
}

.workspace-badges.is-embedded {
  gap: 6px;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 var(--cw-space-3);
  border-radius: var(--cw-radius-pill);
  font-size: 13px;
  color: var(--cw-color-primary);
  background: rgba(13, 148, 136, 0.12);
}

.badge.subtle {
  color: var(--cw-color-muted);
  background: rgba(100, 116, 139, 0.12);
}

.stage-scroll {
  overflow-x: auto;
  overflow-y: visible;
  max-width: 100%;
  padding: var(--cw-space-3);
  border-radius: var(--cw-radius-lg);
  background:
    linear-gradient(180deg, rgba(153, 246, 228, 0.55), rgba(240, 253, 250, 0.96)),
    var(--cw-color-stage);
}

.stage-backdrop {
  display: grid;
  place-items: center;
  width: max-content;
  min-width: 100%;
  min-height: 100%;
  padding: var(--cw-space-5);
}

.stage-surface {
  position: relative;
  box-shadow: var(--cw-shadow-strong);
}

.stage-surface canvas {
  display: block;
}

.empty-stage {
  display: grid;
  gap: var(--cw-space-2);
  justify-items: center;
  max-width: 28rem;
  padding: var(--cw-space-6);
  border: 1px dashed rgba(13, 148, 136, 0.24);
  border-radius: var(--cw-radius-lg);
  color: var(--cw-color-muted);
  background: rgba(255, 255, 255, 0.82);
  text-align: center;
}

.empty-stage strong {
  font-size: 18px;
  color: var(--cw-color-text);
}

.side-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-2);
}

.side-tabs.is-collapsed {
  justify-content: center;
}

.side-toggle-button {
  flex-shrink: 0;
}

.collapsed-side-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--cw-color-text);
}

.side-tab-button,
.primary-button,
.secondary-button,
.danger-button {
  min-height: 44px;
  padding: 0 var(--cw-space-4);
  border-radius: var(--cw-radius-pill);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard);
}

.side-tab-button {
  flex: 1;
  border: 1px solid rgba(13, 148, 136, 0.1);
  color: var(--cw-color-muted);
  background: rgba(255, 255, 255, 0.92);
}

.side-tab-button.is-active {
  color: var(--cw-color-primary);
  border-color: rgba(13, 148, 136, 0.28);
  background: rgba(13, 148, 136, 0.08);
}

.primary-button {
  border: 1px solid transparent;
  color: #ffffff;
  background: linear-gradient(135deg, var(--cw-color-primary), var(--cw-color-primary-2));
}

.secondary-button {
  border: 1px solid rgba(13, 148, 136, 0.18);
  color: var(--cw-color-text);
  background: rgba(255, 255, 255, 0.92);
}

.secondary-button.compact {
  min-height: 38px;
  padding: 0 14px;
}

.danger-button {
  border: 1px solid rgba(220, 38, 38, 0.16);
  color: var(--cw-color-danger);
  background: var(--cw-color-danger-soft);
}

.side-tab-button:hover,
.primary-button:hover,
.secondary-button:hover,
.danger-button:hover {
  transform: translateY(-1px);
}

.editor-shell.is-embedded .toolbar-shell,
.editor-shell.is-embedded .slide-rail,
.editor-shell.is-embedded .workspace-shell,
.editor-shell.is-embedded .side-tabs {
  padding: var(--cw-space-4);
}

@media (max-width: 1240px) {
  .editor-layout {
    grid-template-columns: var(--cw-editor-rail-width) minmax(0, 1fr);
  }

  .editor-side {
    grid-column: 1 / -1;
  }

  .editor-layout.is-left-collapsed {
    grid-template-columns: 88px minmax(0, 1fr);
  }

  .editor-layout.is-right-collapsed,
  .editor-layout.is-left-collapsed.is-right-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 1100px) {
  .editor-topbar,
  .editor-layout,
  .stat-grid {
    grid-template-columns: 1fr;
  }

  .toolbar-shell,
  .workspace-head,
  .panel-head {
    align-items: flex-start;
  }
}

@media (max-width: 768px) {
  .toolbar-shell,
  .slide-rail,
  .workspace-shell,
  .side-tabs {
    padding: var(--cw-space-4);
  }

  .workspace-badges,
  .toolbar-group,
  .side-tabs,
  .side-tab-list {
    width: 100%;
  }

  .side-tabs {
    flex-wrap: wrap;
  }
}
</style>
