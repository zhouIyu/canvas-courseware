<script setup lang="ts">
import type { CoursewareDocument } from "@canvas-courseware/core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  DEFAULT_PREVIEW_HEIGHT,
  formatPlaybackStatus,
  formatPlaybackSummary,
  formatTriggerLabel,
} from "../shared";
import { useCoursewarePreview } from "./useCoursewarePreview";

/** 外部触发预览跳转时使用的请求结构。 */
interface PreviewPlaybackRequest {
  /** 用来区分同一步骤的重复请求。 */
  key: number;
  /** 需要对齐到的目标 slide。 */
  slideId: string | null;
  /** 需要作为下一步焦点的步骤索引。 */
  stepIndex: number;
}

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
    /** 外部触发的预览跳转请求。 */
    previewRequest?: PreviewPlaybackRequest | null;
    /** 是否展示组件内部头部。 */
    showHeader?: boolean;
  }>(),
  {
    title: "课件预览工作台",
    height: DEFAULT_PREVIEW_HEIGHT,
    slideId: null,
    previewRequest: null,
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
  startPreviewFromStep,
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

/** 外部请求从指定步骤开始预览时，直接同步到底层播放器。 */
watch(
  () => props.previewRequest?.key,
  () => {
    if (!props.previewRequest) {
      return;
    }

    void startPreviewFromStep(
      props.previewRequest.stepIndex,
      props.previewRequest.slideId,
    );
  },
);

/** 预览画布容器高度。 */
const stageStyle = computed(() => ({
  minHeight: `${props.height}px`,
}));

/** 预览区滚动容器引用，用来计算可用宽高。 */
const previewStageRef = ref<HTMLDivElement | null>(null);

/** 预览区当前可用尺寸。 */
const previewStageSize = ref({
  width: 0,
  height: 0,
});

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

/** 预览态按容器宽高等比缩放，保证整张画布始终完整显示。 */
const canvasScale = computed(() => {
  if (
    !activeSlide.value ||
    previewStageSize.value.width <= 0 ||
    previewStageSize.value.height <= 0
  ) {
    return 1;
  }

  const availableWidth = Math.max(previewStageSize.value.width - 88, 180);
  const availableHeight = Math.max(previewStageSize.value.height - 80, 160);
  const widthScale = availableWidth / activeSlide.value.size.width;
  const heightScale = availableHeight / activeSlide.value.size.height;

  return Math.min(1, widthScale, heightScale);
});

/** 缩放后的预览画布外框尺寸。 */
const canvasFrameStyle = computed(() => {
  if (!activeSlide.value) {
    return {};
  }

  return {
    width: `${activeSlide.value.size.width * canvasScale.value}px`,
    height: `${activeSlide.value.size.height * canvasScale.value}px`,
  };
});

/** 预览画布保持原始尺寸渲染，只通过 transform 做缩放。 */
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

/** 内嵌模式下固定预览器总高度，避免把页面继续撑高。 */
const previewShellStyle = computed(() =>
  isEmbedded.value
    ? {
        height: `${props.height}px`,
      }
    : {},
);

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

/** 读取预览区当前可用尺寸，用于画布自适应缩放。 */
const updatePreviewStageSize = () => {
  previewStageSize.value = {
    width: previewStageRef.value?.clientWidth ?? 0,
    height: previewStageRef.value?.clientHeight ?? 0,
  };
};

/** 监听预览区尺寸变化。 */
let previewStageResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  updatePreviewStageSize();

  if (previewStageRef.value) {
    previewStageResizeObserver = new ResizeObserver(() => {
      updatePreviewStageSize();
    });
    previewStageResizeObserver.observe(previewStageRef.value);
  }
});

onBeforeUnmount(() => {
  previewStageResizeObserver?.disconnect();
  previewStageResizeObserver = null;
});
</script>

<template>
  <section class="preview-shell" :class="{ 'is-embedded': isEmbedded }" :style="previewShellStyle">
    <header v-if="showHeader" class="preview-topbar">
      <div class="preview-heading">
        <div class="title-row">
          <h2>{{ title }}</h2>
          <a-tag :color="playbackStatusTagColor" bordered>{{ playbackStatusLabel }}</a-tag>
        </div>
        <p class="preview-copy">
          {{ playbackSummary }} · {{ nextTriggerLabel }} · {{ activeSlide?.name ?? "未选择页面" }}
        </p>
      </div>
      <div class="preview-topbar-actions">
        <div class="status-badges topbar-badges">
          <a-tag bordered>{{ stepPositionLabel }}</a-tag>
          <a-tag bordered>{{ stageSizeLabel }}</a-tag>
        </div>
        <div class="preview-actions">
          <a-button class="preview-text-button" type="text" @click="resetPreview">重置播放</a-button>
          <a-button type="primary" @click="playNextStep">播放下一步</a-button>
        </div>
      </div>
    </header>

    <main class="preview-layout" :class="previewLayoutClass">
      <a-button
        class="preview-side-badge preview-side-badge-left"
        type="text"
        :aria-label="isSlideRailCollapsed ? '展开左侧页面栏' : '收起左侧页面栏'"
        @click="toggleSlideRail"
      >
        {{ isSlideRailCollapsed ? "›" : "‹" }}
      </a-button>
      <a-button
        class="preview-side-badge preview-side-badge-right"
        type="text"
        :aria-label="isTimelineCollapsed ? '展开右侧步骤栏' : '收起右侧步骤栏'"
        @click="toggleTimelinePanel"
      >
        {{ isTimelineCollapsed ? "‹" : "›" }}
      </a-button>

      <aside class="preview-rail slide-shell" :class="{ 'is-collapsed': isSlideRailCollapsed }">
        <header class="section-head compact">
          <div>
            <h3>{{ isSlideRailCollapsed ? "页面" : "快速切换" }}</h3>
          </div>
        </header>

        <div v-if="!isSlideRailCollapsed" class="slide-chip-list">
          <a-button
            v-for="(slide, index) in state.document?.slides ?? []"
            :key="slide.id"
            class="slide-card"
            :class="{ 'is-active': slide.id === state.slideId }"
            type="text"
            :aria-pressed="slide.id === state.slideId"
            @click="activateSlide(slide.id)"
          >
            <div class="slide-card-top">
              <span class="slide-index">{{ String(index + 1).padStart(2, '0') }}</span>
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
        <div v-else class="collapsed-side-shell">
          <span class="collapsed-count">{{ state.document?.slides.length ?? 0 }}</span>
          <small>{{ activeSlideIndex >= 0 ? `当前第 ${activeSlideIndex + 1} 页` : "未选择页面" }}</small>
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
              <a-tag bordered>{{ nextTriggerLabel }}</a-tag>
            </div>
          </div>
        </header>

        <div ref="previewStageRef" class="preview-stage" :style="stageStyle">
          <div class="preview-stage-scroll">
            <div v-if="activeSlide" class="preview-stage-frame" :style="canvasFrameStyle">
              <div class="preview-stage-surface" :style="canvasSurfaceStyle">
                <canvas ref="previewCanvasRef" />
              </div>
            </div>
            <div v-else class="empty-state">
              <strong>还没有可预览的页面</strong>
              <p>编辑器新增页面后，这里会自动同步同一份文档内容。</p>
            </div>
          </div>
        </div>
      </section>

      <aside v-show="!isTimelineCollapsed" class="preview-side timeline-shell">
        <header class="section-head compact">
          <div>
            <h3>步骤状态</h3>
          </div>
        </header>

        <ol
          v-if="!isTimelineCollapsed && (activeSlide?.timeline.steps.length ?? 0) > 0"
          class="steps-list"
        >
          <li
            v-for="(step, index) in activeSlide?.timeline.steps ?? []"
            :key="step.id"
            class="preview-step-card"
            :class="{
              'is-done': index < state.stepIndex,
              'is-current': index === state.stepIndex,
            }"
          >
            <div class="preview-step-marker">
              <div class="step-index">{{ String(index + 1).padStart(2, '0') }}</div>
            </div>
            <div class="step-copy">
              <div class="step-row">
                <strong>{{ step.name }}</strong>
                <span class="step-trigger">{{ formatTriggerLabel(step.trigger.type) }}</span>
              </div>
              <small>{{ step.actions.length }} 个动作</small>
            </div>
          </li>
        </ol>
        <div v-else-if="!isTimelineCollapsed" class="empty-state compact">
          <strong>当前页面还没有步骤</strong>
          <p>后续 timeline 配置完成后，这里会直接展示页面点击、自动触发与对象点击的执行顺序。</p>
        </div>
      </aside>
    </main>
  </section>
</template>

<style scoped src="./CoursewarePreview.css"></style>
