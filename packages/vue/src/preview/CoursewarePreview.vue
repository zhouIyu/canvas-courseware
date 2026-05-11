<script setup lang="ts">
import type { CoursewareDocument } from "@canvas-courseware/core";
import { computed, ref, watch } from "vue";
import StageViewportControls from "../shared/StageViewportControls.vue";
import PreviewPlaybackControls from "./PreviewPlaybackControls.vue";
import PreviewTimelineSidebar from "./PreviewTimelineSidebar.vue";
import {
  DEFAULT_PREVIEW_HEIGHT,
  createSlideBackgroundStyle,
  resolveWorkspaceViewportDensity,
  type WorkspaceViewportDensity,
  useStageViewportFit,
} from "../shared";
import { useCoursewarePreview } from "./useCoursewarePreview";
import { usePreviewImmersivePlayback } from "./usePreviewImmersivePlayback";
import { usePreviewPlaybackProgress } from "./usePreviewPlaybackProgress";

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
    /** 外部传入的 slide 缩略图缓存，供左侧页面栏优先展示真实封面。 */
    slideThumbnailMap?: Record<string, string | null>;
  }>(),
  {
    title: "课件预览工作台",
    height: DEFAULT_PREVIEW_HEIGHT,
    slideId: null,
    previewRequest: null,
    showHeader: true,
    slideThumbnailMap: () => ({}),
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

/** 预览壳层根节点引用，供沉浸播放与全屏能力复用。 */
const previewShellRef = ref<HTMLElement | null>(null);

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

/** 预览区里真正承担画布适配职责的内容区 DOM 引用。 */
const previewFitViewportRef = ref<HTMLDivElement | null>(null);

/** 当前激活画布的原始尺寸，供共享 fit 逻辑消费。 */
const activeSlideSize = computed(() =>
  activeSlide.value
    ? {
        width: activeSlide.value.size.width,
        height: activeSlide.value.size.height,
      }
    : null,
);

/** 预览态复用共享的舞台适配逻辑，统一按真实内容区等比缩放。 */
const {
  canZoomIn,
  canZoomOut,
  canvasBackdropStyle,
  canvasFrameStyle,
  canvasSurfaceStyle,
  isActualSizeZoom,
  isFitZoom,
  scalePercent,
  shouldAllowViewportScroll,
  zoomIn,
  zoomOut,
  zoomToActualSize,
  zoomToFit,
} = useStageViewportFit({
  viewportRef: previewFitViewportRef,
  slideSize: activeSlideSize,
});

/** 当前预览态画布视图控制展示的缩放标签。 */
const previewZoomLabel = computed(() =>
  isFitZoom.value ? `适配 ${scalePercent.value}%` : `${scalePercent.value}%`,
);

/** 预览态统一消费的页面级 / 课件级播放进度与完成态。 */
const {
  activeSlideIndex,
  canActivateNextSlide,
  canActivatePreviousSlide,
  canPlayNextStep,
  canStepBackward,
  clearSlidePlaybackHistory,
  completedStepCount,
  coursewareProgressCopy,
  coursewareProgressLabel,
  coursewareProgressPercent,
  hasActiveSlide,
  isCoursewareCompleted,
  nextTriggerLabel,
  playbackHintCopy,
  playbackHintTitle,
  playbackStatusLabel,
  playbackStatusTagColor,
  playbackSummary,
  slideCount,
  slidePlaybackProgressMap,
  slidePositionLabel,
  stageSizeLabel,
  stepPositionLabel,
  stepProgressLabel,
  stepProgressPercent,
} = usePreviewPlaybackProgress({
  document: computed(() => state.value.document),
  activeSlide,
  state,
  stepCount,
});

/** 切换到相邻页面，供“上一页 / 下一页”复用。 */
const activateRelativeSlide = async (offset: number) => {
  const slides = state.value.document?.slides ?? [];
  const targetSlide = slides[activeSlideIndex.value + offset];

  if (!targetSlide) {
    return;
  }

  await activateSlide(targetSlide.id);
};

/** 从当前页起点重新播放，统一用“重播当前页”语义暴露给 UI。 */
const replayCurrentSlide = async () => {
  await resetPreview();
};

/** 从整份课件起点重新开始预览，并清空页面级播放进度历史。 */
const restartCourseware = async () => {
  const firstSlideId = state.value.document?.slides[0]?.id ?? null;
  clearSlidePlaybackHistory();
  await activateSlide(firstSlideId);
};

/** 手动回退到上一步，并停在该步等待用户再次触发。 */
const stepBackward = async () => {
  if (!activeSlide.value || !canStepBackward.value) {
    return;
  }

  await startPreviewFromStep(Math.max(state.value.stepIndex - 1, 0), activeSlide.value.id, {
    autoplayNextAutoStep: false,
  });
};

/** 生成预览侧栏缩略页背景样式，优先使用保存后的真实截图。 */
const resolveSlideThumbnailStyle = (slide: CoursewareDocument["slides"][number]) => {
  const thumbnail = props.slideThumbnailMap[slide.id];
  if (!thumbnail) {
    return createSlideBackgroundStyle(slide.background);
  }

  return {
    backgroundColor: slide.background.fill,
    backgroundImage: `url(${JSON.stringify(thumbnail)})`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  };
};

/** 判断某一页当前是否已经有真实缩略图。 */
const hasSlideThumbnail = (slideId: string) => Boolean(props.slideThumbnailMap[slideId]);

/** 当前是否以内嵌工作台模式渲染。 */
const isEmbedded = computed(() => !props.showHeader);

/** 当前工作区高度对应的视觉密度档位。 */
const previewViewportDensity = computed<WorkspaceViewportDensity>(() =>
  resolveWorkspaceViewportDensity(props.height),
);

/** 内嵌工作台里优先把中心区域让给课件本身，收起附加说明卡片。 */
const shouldShowInsightStrip = computed(
  () =>
    !isImmersivePlayback.value &&
    !isEmbedded.value &&
    previewViewportDensity.value === "spacious",
);

/** 当前画布区头部是否需要展示标题。 */
const shouldShowStageHeading = computed(
  () => !isEmbedded.value && !isImmersivePlayback.value,
);

/** 当前是否展示组件级顶部工具栏。 */
const shouldShowHeader = computed(
  () => props.showHeader && !isImmersivePlayback.value,
);

/** 当前是否在画布头部展示播放控制入口。 */
const shouldShowInlinePlaybackActions = computed(
  () => isEmbedded.value || isImmersivePlayback.value,
);

/**
 * 按高度密度返回预览壳层变量。
 * 不同屏幕下统一通过 CSS 变量压缩边栏、留白与步骤卡片高度。
 */
const resolvePreviewLayoutVariables = (
  density: WorkspaceViewportDensity,
): Record<string, string> => {
  if (density === "dense") {
    return {
      "--cw-preview-rail-width": "128px",
      "--cw-preview-side-width": "188px",
      "--cw-preview-layout-gap": "8px",
      "--cw-preview-layout-padding": "8px",
      "--cw-preview-stage-padding-block-start": "8px",
      "--cw-preview-stage-padding-inline": "8px",
      "--cw-preview-stage-padding-block-end": "10px",
      "--cw-preview-fit-padding-block-start": "4px",
      "--cw-preview-fit-padding-inline": "4px",
      "--cw-preview-fit-padding-block-end": "6px",
      "--cw-preview-step-card-height": "68px",
      "--cw-preview-slide-thumbnail-height": "40px",
    };
  }

  if (density === "compact") {
    return {
      "--cw-preview-rail-width": "136px",
      "--cw-preview-side-width": "200px",
      "--cw-preview-layout-gap": "8px",
      "--cw-preview-layout-padding": "8px",
      "--cw-preview-stage-padding-block-start": "10px",
      "--cw-preview-stage-padding-inline": "8px",
      "--cw-preview-stage-padding-block-end": "10px",
      "--cw-preview-fit-padding-block-start": "6px",
      "--cw-preview-fit-padding-inline": "6px",
      "--cw-preview-fit-padding-block-end": "8px",
      "--cw-preview-step-card-height": "74px",
      "--cw-preview-slide-thumbnail-height": "44px",
    };
  }

  return {
    "--cw-preview-rail-width": "140px",
    "--cw-preview-side-width": "204px",
    "--cw-preview-layout-gap": "8px",
    "--cw-preview-layout-padding": "8px",
    "--cw-preview-stage-padding-block-start": "10px",
    "--cw-preview-stage-padding-inline": "8px",
    "--cw-preview-stage-padding-block-end": "10px",
    "--cw-preview-fit-padding-block-start": "8px",
    "--cw-preview-fit-padding-inline": "6px",
    "--cw-preview-fit-padding-block-end": "10px",
    "--cw-preview-step-card-height": "84px",
    "--cw-preview-slide-thumbnail-height": "48px",
  };
};

/** 内嵌模式下固定预览器总高度，避免把页面继续撑高。 */
const previewShellStyle = computed(() =>
  ({
    ...resolvePreviewLayoutVariables(previewViewportDensity.value),
    ...(isEmbedded.value
      ? {
          height: `${props.height}px`,
        }
      : {}),
  }),
);

/** 当前左侧 slide 栏是否已收起。 */
const isSlideRailCollapsed = ref(false);

/** 当前右侧步骤栏是否已收起。 */
const isTimelineCollapsed = ref(false);

/** 当前左侧栏在沉浸播放下会被强制收起，但不覆盖用户原始开关状态。 */
const effectiveSlideRailCollapsed = computed(
  () => isImmersivePlayback.value || isSlideRailCollapsed.value,
);

/** 当前右侧栏在沉浸播放下会被强制收起，但不覆盖用户原始开关状态。 */
const effectiveTimelineCollapsed = computed(
  () => isImmersivePlayback.value || isTimelineCollapsed.value,
);

/** 预览三栏布局的动态 class。 */
const previewLayoutClass = computed(() => ({
  "is-left-collapsed": effectiveSlideRailCollapsed.value,
  "is-right-collapsed": effectiveTimelineCollapsed.value,
  "is-immersive-layout": isImmersivePlayback.value,
}));

/** 当前画布壳层是否处于“只保留课件主体”的紧凑模式。 */
const previewStageShellClass = computed(() => ({
  "is-stage-only": !shouldShowInsightStrip.value,
  "is-embedded-stage": isEmbedded.value,
  "is-immersive-stage": isImmersivePlayback.value,
}));

/** 切换左侧 slide 栏显隐。 */
const toggleSlideRail = () => {
  isSlideRailCollapsed.value = !isSlideRailCollapsed.value;
};

/** 切换右侧时间轴栏显隐。 */
const toggleTimelinePanel = () => {
  isTimelineCollapsed.value = !isTimelineCollapsed.value;
};

/** 判断当前预览壳层是否处于可响应全局快捷键的可见状态。 */
const isPreviewShellVisible = () => {
  const element = previewShellRef.value;
  if (!element) {
    return false;
  }

  if (element.offsetParent !== null) {
    return true;
  }

  const documentWithFullscreen = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement === element ||
    documentWithFullscreen.webkitFullscreenElement === element
  );
};

/** 预览壳层复用的沉浸播放、全屏与键盘控制能力。 */
const {
  immersiveToggleLabel,
  isImmersivePlayback,
  toggleImmersivePlayback,
} = usePreviewImmersivePlayback({
  shellRef: previewShellRef,
  hasActiveSlide,
  canStepBackward,
  canActivatePreviousSlide,
  canActivateNextSlide,
  isKeyboardScopeActive: isPreviewShellVisible,
  onPlayNextStep: playNextStep,
  onStepBackward: stepBackward,
  onReplayCurrentSlide: replayCurrentSlide,
  onRestartCourseware: restartCourseware,
  onActivatePreviousSlide: () => activateRelativeSlide(-1),
  onActivateNextSlide: () => activateRelativeSlide(1),
});

/** 沉浸播放下展示的轻量键盘提示。 */
const immersivePlaybackHint = computed(
  () => "快捷键：← 上一步 · →/空格 下一步 · R 重播 · Shift+R 重新开始 · F / Esc 退出",
);

</script>

<template>
  <section
    ref="previewShellRef"
    class="preview-shell"
    :class="{ 'is-embedded': isEmbedded, 'is-immersive': isImmersivePlayback }"
    :style="previewShellStyle"
  >
    <header v-if="shouldShowHeader" class="preview-topbar">
      <div class="preview-heading">
        <div class="title-row">
          <h2>{{ title }}</h2>
          <a-tag class="playback-status-tag" :color="playbackStatusTagColor" bordered>
            {{ playbackStatusLabel }}
          </a-tag>
        </div>
        <p class="preview-copy">
          {{ playbackSummary }} · {{ nextTriggerLabel }} · {{ activeSlide?.name ?? "未选择页面" }}
        </p>
      </div>
      <div class="preview-topbar-actions">
        <div class="status-badges topbar-badges">
          <a-tag class="preview-slide-position-tag" bordered>{{ slidePositionLabel }}</a-tag>
          <a-tag class="preview-step-position-tag" bordered>{{ stepPositionLabel }}</a-tag>
          <a-tag class="preview-stage-size-tag" bordered>{{ stageSizeLabel }}</a-tag>
        </div>
        <PreviewPlaybackControls
          class="preview-actions"
          :can-activate-next-slide="canActivateNextSlide"
          :can-activate-previous-slide="canActivatePreviousSlide"
          :can-play-next-step="canPlayNextStep"
          :can-step-backward="canStepBackward"
          :has-active-slide="hasActiveSlide"
          :immersive-toggle-label="immersiveToggleLabel"
          :is-courseware-completed="isCoursewareCompleted"
          :is-immersive-playback="isImmersivePlayback"
          @activate-next-slide="activateRelativeSlide(1)"
          @activate-previous-slide="activateRelativeSlide(-1)"
          @play-next-step="playNextStep"
          @replay-current-slide="replayCurrentSlide"
          @restart-courseware="restartCourseware"
          @step-backward="stepBackward"
          @toggle-immersive-playback="toggleImmersivePlayback"
        />
      </div>
    </header>

    <main class="preview-layout" :class="previewLayoutClass">
      <a-button
        v-if="!isImmersivePlayback"
        class="preview-side-badge preview-side-badge-left"
        type="text"
        :aria-label="effectiveSlideRailCollapsed ? '展开左侧页面栏' : '收起左侧页面栏'"
        @click="toggleSlideRail"
      >
        {{ effectiveSlideRailCollapsed ? "›" : "‹" }}
      </a-button>
      <a-button
        v-if="!isImmersivePlayback"
        class="preview-side-badge preview-side-badge-right"
        type="text"
        :aria-label="effectiveTimelineCollapsed ? '展开右侧步骤栏' : '收起右侧步骤栏'"
        @click="toggleTimelinePanel"
      >
        {{ effectiveTimelineCollapsed ? "‹" : "›" }}
      </a-button>

      <aside v-show="!effectiveSlideRailCollapsed" class="preview-rail slide-shell">
        <header class="section-head compact">
          <div>
            <h3>快速切换</h3>
            <p class="slide-rail-summary">{{ coursewareProgressLabel }}</p>
          </div>
        </header>

        <div class="slide-chip-list">
          <a-button
            v-for="(slide, index) in state.document?.slides ?? []"
            :key="slide.id"
            class="slide-card"
            :class="{
              'is-active': slide.id === state.slideId,
              'is-completed': slidePlaybackProgressMap[slide.id]?.isCompleted,
            }"
            type="text"
            :aria-pressed="slide.id === state.slideId"
            @click="activateSlide(slide.id)"
          >
            <div class="slide-card-top">
              <span class="slide-index">{{ String(index + 1).padStart(2, '0') }}</span>
            </div>

            <div class="slide-card-body">
              <div class="slide-thumbnail" :style="resolveSlideThumbnailStyle(slide)">
                <template v-if="!hasSlideThumbnail(slide.id)">
                  <span class="thumb-line long" />
                  <span class="thumb-line short" />
                  <span class="thumb-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </template>
              </div>
              <div class="slide-meta">
                <strong>{{ slide.name }}</strong>
                <div class="slide-meta-row">
                  <span class="slide-progress-text">
                    {{ slidePlaybackProgressMap[slide.id]?.progressLabel ?? "0/0 步" }}
                  </span>
                  <span class="slide-status-text">
                    {{ slidePlaybackProgressMap[slide.id]?.statusLabel ?? "未播放" }}
                  </span>
                </div>
              </div>
            </div>
          </a-button>
        </div>
      </aside>

      <section class="preview-stage-shell" :class="previewStageShellClass">
        <header class="section-head stage-head">
          <div v-if="shouldShowStageHeading">
            <h3>当前画布</h3>
          </div>
          <div class="stage-head-actions">
            <div v-if="shouldShowInlinePlaybackActions" class="embedded-preview-actions">
              <PreviewPlaybackControls
                class="preview-actions preview-actions-compact"
                :can-activate-next-slide="canActivateNextSlide"
                :can-activate-previous-slide="canActivatePreviousSlide"
                :can-play-next-step="canPlayNextStep"
                :can-step-backward="canStepBackward"
                :has-active-slide="hasActiveSlide"
                :immersive-toggle-label="immersiveToggleLabel"
                :is-courseware-completed="isCoursewareCompleted"
                :is-immersive-playback="isImmersivePlayback"
                @activate-next-slide="activateRelativeSlide(1)"
                @activate-previous-slide="activateRelativeSlide(-1)"
                @play-next-step="playNextStep"
                @replay-current-slide="replayCurrentSlide"
                @restart-courseware="restartCourseware"
                @step-backward="stepBackward"
                @toggle-immersive-playback="toggleImmersivePlayback"
              />
            </div>
            <StageViewportControls
              :can-zoom-in="canZoomIn"
              :can-zoom-out="canZoomOut"
              :is-actual-size-zoom="isActualSizeZoom"
              :is-fit-zoom="isFitZoom"
              :zoom-label="previewZoomLabel"
              @zoom-in="zoomIn"
              @zoom-out="zoomOut"
              @zoom-to-actual-size="zoomToActualSize"
              @zoom-to-fit="zoomToFit"
            />
            <div v-if="!isImmersivePlayback" class="status-badges">
              <a-tag class="playback-status-tag" :color="playbackStatusTagColor" bordered>
                {{ playbackStatusLabel }}
              </a-tag>
              <a-tag class="preview-slide-position-tag" bordered>{{ slidePositionLabel }}</a-tag>
              <a-tag class="preview-next-trigger-tag" bordered>{{ nextTriggerLabel }}</a-tag>
            </div>
            <div
              v-if="!shouldShowInsightStrip && !isImmersivePlayback"
              class="preview-stage-summary-inline"
            >
              <div class="preview-stage-summary-topline">
                <strong class="courseware-progress-value">{{ coursewareProgressLabel }}</strong>
                <span class="courseware-progress-copy">{{ coursewareProgressCopy }}</span>
              </div>
              <div class="preview-stage-summary-bottomline">
                <strong class="playback-hint-title">{{ playbackHintTitle }}</strong>
                <small class="playback-hint-copy">{{ playbackHintCopy }}</small>
              </div>
            </div>
            <div v-else class="immersive-playback-hint">
              <a-tag :color="playbackStatusTagColor" bordered>{{ playbackStatusLabel }}</a-tag>
              <span>{{ immersivePlaybackHint }}</span>
            </div>
          </div>
        </header>

        <div v-if="shouldShowInsightStrip" class="playback-insight-strip">
          <article class="playback-insight-card">
            <span class="playback-insight-label">课件进度</span>
            <strong class="preview-slide-position courseware-progress-value">
              {{ coursewareProgressLabel }}
            </strong>
            <small class="courseware-progress-copy">{{ coursewareProgressCopy }}</small>
            <div class="playback-progress-track" aria-hidden="true">
              <span
                class="playback-progress-fill"
                :style="{ width: `${coursewareProgressPercent}%` }"
              />
            </div>
          </article>
          <article class="playback-insight-card">
            <span class="playback-insight-label">步骤进度</span>
            <strong class="preview-step-progress">{{ stepProgressLabel }}</strong>
            <small>{{ stepPositionLabel }}</small>
            <div class="playback-progress-track" aria-hidden="true">
              <span
                class="playback-progress-fill"
                :style="{ width: `${stepProgressPercent}%` }"
              />
            </div>
          </article>
          <article class="playback-insight-card is-emphasis">
            <span class="playback-insight-label">当前提示</span>
            <strong class="playback-hint-title">{{ playbackHintTitle }}</strong>
            <small class="playback-hint-copy">{{ playbackHintCopy }}</small>
          </article>
        </div>

        <div class="preview-stage">
          <div
            ref="previewFitViewportRef"
            class="preview-stage-viewport"
            :class="{ 'is-scrollable': shouldAllowViewportScroll }"
          >
            <div class="preview-stage-scroll" :style="canvasBackdropStyle">
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
        </div>
      </section>

      <PreviewTimelineSidebar
        v-show="!effectiveTimelineCollapsed"
        :completed-step-count="completedStepCount"
        :is-active-slide="hasActiveSlide"
        :playback-status="state.status"
        :slide-position-label="slidePositionLabel"
        :slide-progress-label="
          activeSlide ? slidePlaybackProgressMap[activeSlide.id]?.progressLabel ?? '0/0 步' : '0/0 步'
        "
        :slide-status-label="
          activeSlide ? slidePlaybackProgressMap[activeSlide.id]?.statusLabel ?? '未播放' : '未播放'
        "
        :step-index="state.stepIndex"
        :steps="activeSlide?.timeline.steps ?? []"
      />
    </main>
  </section>
</template>

<style scoped src="./CoursewarePreview.css"></style>
