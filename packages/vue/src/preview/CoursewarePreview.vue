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
      return "#ff7d00";
    case "completed":
      return "#00b42a";
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
              <strong>{{ playbackSummary }}</strong>
            </div>
          </a-card>
          <a-card :bordered="false" class="status-card compact-card">
            <div class="status-card-body">
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

<style scoped src="./CoursewarePreview.css"></style>
