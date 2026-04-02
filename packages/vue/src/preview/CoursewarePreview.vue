<script setup lang="ts">
import type { CoursewareDocument } from "@canvas-courseware/core";
import { computed, ref, watch } from "vue";
import {
  DEFAULT_PREVIEW_HEIGHT,
  formatPlaybackStatus,
  formatPlaybackSummary,
  formatTriggerLabel,
} from "../shared";
import { useCoursewarePreview } from "./useCoursewarePreview";

/** 预览器组件的展示参数。 */
const props = withDefaults(
  defineProps<{
    /** 外部传入的标准课件文档。 */
    document?: CoursewareDocument;
    /** 组件标题。 */
    title?: string;
    /** 工作区最小高度。 */
    height?: number;
    /** 初始预览页。 */
    slideId?: string | null;
    /** 是否展示组件内部头部。 */
    showHeader?: boolean;
  }>(),
  {
    title: "课件预览工作台",
    height: DEFAULT_PREVIEW_HEIGHT,
    slideId: null,
    showHeader: true,
  },
);

/** 从 composable 中取出预览器所需的响应式状态与操作。 */
const {
  activeSlide,
  activateSlide,
  playNextStep,
  previewCanvasRef,
  replaceDocument,
  resetPreview,
  state,
  stepCount,
} = useCoursewarePreview({
  document: props.document,
  slideId: props.slideId,
});

/** 外部文档变化时，替换底层播放文档。 */
watch(
  () => props.document,
  (document) => {
    void replaceDocument(document ?? null);
  },
);

/** 外部指定的 slide 变化时，同步切换预览页。 */
watch(
  () => props.slideId,
  (slideId) => {
    if (slideId === undefined) {
      return;
    }

    void activateSlide(slideId);
  },
);

/** 预览画布容器高度。 */
const stageStyle = computed(() => ({
  minHeight: `${props.height}px`,
}));

/** 预览 canvas 实际尺寸。 */
const canvasStyle = computed(() => {
  if (!activeSlide.value) {
    return {};
  }

  return {
    width: `${activeSlide.value.size.width}px`,
    height: `${activeSlide.value.size.height}px`,
  };
});

/** 播放状态摘要。 */
const playbackSummary = computed(() =>
  formatPlaybackSummary(state.value.stepIndex, stepCount.value, state.value.status),
);

/** 当前状态的中文标签。 */
const playbackStatusLabel = computed(() =>
  formatPlaybackStatus(state.value.status),
);

/** 播放状态对应的标签色值。 */
const playbackStatusTagColor = computed(() => {
  switch (state.value.status) {
    case "playing":
      return "#165dff";
    case "paused":
      return "#ea580c";
    case "completed":
      return "#0d9488";
    case "idle":
    default:
      return "#64748b";
  }
});

/** 下一步触发方式摘要。 */
const nextTriggerLabel = computed(() =>
  formatTriggerLabel(state.value.nextTrigger),
);

/** 当前步骤序号摘要。 */
const stepPositionLabel = computed(() => {
  if (stepCount.value === 0) {
    return "没有可播放的步骤";
  }

  const currentStep = Math.min(state.value.stepIndex + 1, stepCount.value);
  return `当前焦点：第 ${currentStep} / ${stepCount.value} 步`;
});

/** 当前页面的尺寸摘要。 */
const stageSizeLabel = computed(() => {
  if (!activeSlide.value) {
    return "未加载页面";
  }

  return `${activeSlide.value.size.width} × ${activeSlide.value.size.height}`;
});

/** 当前激活页在文档中的序号。 */
const activeSlideIndex = computed(() => {
  const slides = state.value.document?.slides ?? [];
  return slides.findIndex((slide) => slide.id === state.value.slideId);
});

/** 当前是否以内嵌工作台模式渲染。 */
const isEmbedded = computed(() => !props.showHeader);

/** 内嵌模式下的简要播放摘要。 */
const embeddedSummaryLabel = computed(() => {
  const activeSlideName = activeSlide.value?.name ?? "未选择页面";
  return `${playbackSummary.value} · ${activeSlideName} · ${nextTriggerLabel.value}`;
});

/** 当前左侧 slide 栏是否已收起。 */
const isSlideRailCollapsed = ref(false);

/** 当前右侧步骤栏是否已收起。 */
const isTimelineCollapsed = ref(false);

/** 预览三栏布局的动态 class。 */
const previewLayoutClass = computed(() => ({
  "is-left-collapsed": isSlideRailCollapsed.value,
  "is-right-collapsed": isTimelineCollapsed.value,
}));

/** 切换左侧 slide 栏显隐。 */
const toggleSlideRail = () => {
  isSlideRailCollapsed.value = !isSlideRailCollapsed.value;
};

/** 切换右侧时间轴栏显隐。 */
const toggleTimelinePanel = () => {
  isTimelineCollapsed.value = !isTimelineCollapsed.value;
};
</script>

<template>
  <section class="preview-shell" :class="{ 'is-embedded': isEmbedded }">
    <header v-if="showHeader" class="preview-topbar">
      <div class="preview-heading">
        <p class="section-kicker">Preview Workbench</p>
        <div class="title-row">
          <h2>{{ title }}</h2>
          <a-tag :color="playbackStatusTagColor" bordered>{{ playbackStatusLabel }}</a-tag>
        </div>
        <p class="preview-copy">
          预览器只消费同一份通用 JSON，并把页面点击、自动触发、对象点击等 step 状态翻译成可理解的播放反馈。
        </p>
      </div>
    </header>

    <main class="preview-layout" :class="previewLayoutClass">
      <aside class="preview-rail slide-shell" :class="{ 'is-collapsed': isSlideRailCollapsed }">
        <header class="section-head compact">
          <div>
            <p class="section-kicker">Slides</p>
            <h3>{{ isSlideRailCollapsed ? "页面" : "快速切换" }}</h3>
          </div>
          <a-button class="compact-button" size="small" type="outline" @click="toggleSlideRail">
            {{ isSlideRailCollapsed ? "展开" : "收起" }}
          </a-button>
        </header>

        <div v-if="!isSlideRailCollapsed" class="slide-chip-list">
          <button
            v-for="(slide, index) in state.document?.slides ?? []"
            :key="slide.id"
            class="slide-chip"
            :class="{ 'is-active': slide.id === state.slideId }"
            type="button"
            :aria-pressed="slide.id === state.slideId"
            @click="activateSlide(slide.id)"
          >
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <strong>{{ slide.name }}</strong>
            <small>{{ slide.timeline.steps.length }} 个步骤</small>
          </button>
        </div>
        <div v-else class="collapsed-side-shell">
          <span class="collapsed-count">{{ state.document?.slides.length ?? 0 }}</span>
          <small>{{ activeSlideIndex >= 0 ? `当前第 ${activeSlideIndex + 1} 页` : "未选择页面" }}</small>
          <a-button class="compact-button" size="small" type="outline" @click="toggleSlideRail">
            展开
          </a-button>
        </div>
      </aside>

      <section class="preview-stage-shell">
        <header class="section-head stage-head">
          <div>
            <p class="section-kicker">Canvas Preview</p>
            <h3>当前画布</h3>
          </div>
          <div class="stage-head-actions">
            <div class="status-badges">
              <a-tag :color="playbackStatusTagColor" bordered>{{ playbackStatusLabel }}</a-tag>
              <a-tag bordered>{{ stepPositionLabel }}</a-tag>
              <a-tag v-if="!isEmbedded" bordered>{{ nextTriggerLabel }}</a-tag>
              <a-tag v-if="!isEmbedded" bordered>{{ stageSizeLabel }}</a-tag>
            </div>
            <div class="preview-actions">
              <a-button type="outline" @click="resetPreview">重置播放</a-button>
              <a-button type="primary" @click="playNextStep">播放下一步</a-button>
            </div>
          </div>
        </header>

        <p v-if="isEmbedded" class="preview-inline-summary">
          {{ embeddedSummaryLabel }}
        </p>
        <div v-else class="inline-status-strip">
          <a-card :bordered="false" class="status-card primary compact-card">
            <div class="status-card-body">
              <span class="status-label">播放概览</span>
              <strong>{{ playbackSummary }}</strong>
            </div>
          </a-card>
          <a-card :bordered="false" class="status-card compact-card">
            <div class="status-card-body">
              <span class="status-label">当前页面</span>
              <strong>{{ activeSlide?.name ?? "未选择页面" }}</strong>
              <small>{{ activeSlideIndex >= 0 ? `第 ${activeSlideIndex + 1} 页` : "未定位" }}</small>
            </div>
          </a-card>
        </div>

        <div class="preview-stage" :style="stageStyle">
          <div class="preview-stage-scroll">
            <div v-if="activeSlide" class="preview-stage-surface" :style="canvasStyle">
              <canvas ref="previewCanvasRef" />
            </div>
            <div v-else class="empty-state">
              <strong>还没有可预览的页面</strong>
              <p>编辑器新增页面后，这里会自动同步同一份文档内容。</p>
            </div>
          </div>
        </div>
      </section>

      <aside class="preview-side timeline-shell" :class="{ 'is-collapsed': isTimelineCollapsed }">
        <header class="section-head compact">
          <div>
            <p class="section-kicker">Timeline</p>
            <h3>{{ isTimelineCollapsed ? "步骤" : "步骤状态" }}</h3>
          </div>
          <a-button class="compact-button" size="small" type="outline" @click="toggleTimelinePanel">
            {{ isTimelineCollapsed ? "展开" : "收起" }}
          </a-button>
        </header>

        <ol
          v-if="!isTimelineCollapsed && (activeSlide?.timeline.steps.length ?? 0) > 0"
          class="steps-list"
        >
          <li
            v-for="(step, index) in activeSlide?.timeline.steps ?? []"
            :key="step.id"
            class="step-card"
            :class="{
              'is-done': index < state.stepIndex,
              'is-current': index === state.stepIndex,
            }"
          >
            <div class="step-index">{{ String(index + 1).padStart(2, '0') }}</div>
            <div class="step-copy">
              <div class="step-row">
                <strong>{{ step.name }}</strong>
                <span>{{ formatTriggerLabel(step.trigger.type) }}</span>
              </div>
              <small>{{ step.actions.length }} 个动作</small>
            </div>
          </li>
        </ol>
        <div v-else-if="!isTimelineCollapsed" class="empty-state compact">
          <strong>当前页面还没有步骤</strong>
          <p>后续 timeline 配置完成后，这里会直接展示页面点击、自动触发与对象点击的执行顺序。</p>
        </div>
        <div v-else class="collapsed-side-shell">
          <span class="collapsed-count">{{ stepCount }}</span>
          <small>{{ playbackSummary }}</small>
          <a-button class="compact-button" size="small" type="outline" @click="toggleTimelinePanel">
            展开
          </a-button>
        </div>
      </aside>
    </main>
  </section>
</template>

<style scoped>
.preview-shell {
  display: grid;
  gap: var(--cw-space-5);
  min-width: 0;
  color: var(--cw-color-text);
}

.preview-shell.is-embedded {
  gap: var(--cw-space-4);
}

.preview-layout {
  display: grid;
  grid-template-columns: var(--cw-editor-rail-width) minmax(0, 1fr) var(--cw-editor-side-width);
  gap: var(--cw-space-5);
  min-width: 0;
  align-items: start;
}

.preview-layout > * {
  min-width: 0;
}

.preview-layout.is-left-collapsed {
  grid-template-columns: 88px minmax(0, 1fr) var(--cw-editor-side-width);
}

.preview-layout.is-right-collapsed {
  grid-template-columns: var(--cw-editor-rail-width) minmax(0, 1fr) 96px;
}

.preview-layout.is-left-collapsed.is-right-collapsed {
  grid-template-columns: 88px minmax(0, 1fr) 96px;
}

.preview-topbar,
.status-card,
.preview-stage-shell,
.timeline-shell,
.slide-shell {
  border: 1px solid var(--cw-color-border);
  border-radius: var(--cw-radius-xl);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.88)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-medium);
}

.preview-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--cw-space-4);
  align-items: end;
  padding: var(--cw-space-5);
}

.section-kicker,
.status-label {
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
.section-head h3 {
  margin: 0;
  font-size: clamp(28px, 3vw, 40px);
  line-height: 1.1;
}

.preview-copy {
  margin: var(--cw-space-3) 0 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--cw-color-muted);
}

.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cw-space-2);
}

.compact-button {
  min-height: 38px;
  padding: 0 14px;
  border-radius: var(--cw-radius-pill);
  font-size: 14px;
  font-weight: 600;
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard);
}

.preview-actions :deep(.arco-btn) {
  min-height: 44px;
  padding: 0 var(--cw-space-4);
  border-radius: var(--cw-radius-pill);
  font-size: 14px;
  font-weight: 600;
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard);
}

.preview-actions :deep(.arco-btn:hover),
.compact-button:hover,
.slide-chip:hover {
  transform: translateY(-1px);
}

.status-card {
  border-radius: var(--cw-radius-xl);
  box-shadow: none;
}

.status-card :deep(.arco-card-body) {
  padding: var(--cw-space-4);
}

.status-card-body {
  display: grid;
  gap: var(--cw-space-2);
}

.status-card.primary {
  background:
    linear-gradient(180deg, rgba(20, 184, 166, 0.12), rgba(255, 255, 255, 0.96)),
    var(--cw-color-surface);
}

.status-card strong {
  font-size: 20px;
  line-height: 1.35;
}

.status-card small,
.step-row span,
.step-copy small,
.slide-chip small {
  font-size: 13px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.preview-stage-shell,
.timeline-shell,
.slide-shell {
  min-width: 0;
  padding: var(--cw-space-5);
}

.preview-rail,
.preview-side {
  display: grid;
  gap: var(--cw-space-4);
}

.preview-rail.is-collapsed,
.preview-side.is-collapsed {
  align-content: start;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-4);
  margin-bottom: var(--cw-space-4);
}

.section-head.compact {
  margin-bottom: 0;
}

.stage-head {
  align-items: start;
}

.stage-head-actions {
  display: grid;
  justify-items: end;
  gap: var(--cw-space-3);
}

.status-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--cw-space-2);
}

.section-head h3 {
  font-size: 24px;
}

.title-row :deep(.arco-tag),
.status-badges :deep(.arco-tag) {
  min-height: 32px;
  padding-inline: 12px;
  border-radius: var(--cw-radius-pill);
  font-size: 13px;
}

.preview-inline-summary {
  margin: 0 0 var(--cw-space-4);
  font-size: 13px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.inline-status-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-3);
  margin-bottom: var(--cw-space-4);
}

.compact-card {
  min-height: 0;
  padding: 14px 16px;
}

.preview-stage {
  overflow-x: auto;
  overflow-y: visible;
  max-width: 100%;
  border-radius: var(--cw-radius-lg);
  background:
    linear-gradient(180deg, rgba(153, 246, 228, 0.55), rgba(240, 253, 250, 0.96)),
    var(--cw-color-stage);
}

.preview-stage-scroll {
  display: grid;
  place-items: center;
  width: max-content;
  min-width: 100%;
  min-height: 100%;
  padding: var(--cw-space-5);
}

.preview-stage-surface {
  box-shadow: var(--cw-shadow-strong);
}

.preview-stage-surface canvas {
  display: block;
}

.steps-list,
.slide-chip-list {
  display: grid;
  gap: var(--cw-space-3);
}

.steps-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.step-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--cw-space-3);
  align-items: center;
  padding: 14px 16px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-md);
  background: rgba(255, 255, 255, 0.92);
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard);
}

.step-card.is-current {
  border-color: rgba(13, 148, 136, 0.42);
  background: rgba(20, 184, 166, 0.08);
}

.step-card.is-done {
  opacity: 0.7;
}

.step-index {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--cw-radius-pill);
  font-size: 13px;
  font-weight: 700;
  color: var(--cw-color-primary);
  background: rgba(13, 148, 136, 0.12);
}

.step-copy {
  display: grid;
  gap: var(--cw-space-1);
}

.step-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-3);
}

.slide-chip {
  display: grid;
  gap: var(--cw-space-1);
  width: 100%;
  min-height: 72px;
  padding: 14px 16px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-md);
  text-align: left;
  cursor: pointer;
  color: var(--cw-color-text);
  background: rgba(255, 255, 255, 0.92);
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard);
}

.slide-chip.is-active {
  border-color: rgba(13, 148, 136, 0.42);
  background:
    linear-gradient(180deg, rgba(20, 184, 166, 0.12), rgba(255, 255, 255, 0.96)),
    var(--cw-color-surface);
}

.slide-chip span {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cw-color-primary);
}

.slide-chip strong {
  font-size: 16px;
  line-height: 1.5;
}

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

.collapsed-side-shell small {
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.empty-state {
  display: grid;
  gap: var(--cw-space-2);
  justify-items: center;
  max-width: 28rem;
  margin: 0 auto;
  padding: var(--cw-space-6);
  border: 1px dashed rgba(13, 148, 136, 0.24);
  border-radius: var(--cw-radius-lg);
  color: var(--cw-color-muted);
  background: rgba(255, 255, 255, 0.82);
  text-align: center;
}

.empty-state.compact {
  padding: var(--cw-space-5);
}

.empty-state strong {
  font-size: 18px;
  color: var(--cw-color-text);
}

.preview-shell.is-embedded .preview-stage-shell,
.preview-shell.is-embedded .timeline-shell,
.preview-shell.is-embedded .slide-shell {
  padding: var(--cw-space-4);
}

@media (max-width: 1100px) {
  .preview-topbar,
  .preview-layout,
  .inline-status-strip {
    grid-template-columns: 1fr;
  }

  .preview-layout.is-left-collapsed,
  .preview-layout.is-right-collapsed,
  .preview-layout.is-left-collapsed.is-right-collapsed {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .preview-topbar,
  .preview-stage-shell,
  .timeline-shell,
  .slide-shell {
    padding: var(--cw-space-4);
  }

  .section-head,
  .step-row,
  .stage-head {
    align-items: flex-start;
  }

  .stage-head-actions,
  .status-badges {
    justify-items: start;
    justify-content: flex-start;
  }
}
</style>
