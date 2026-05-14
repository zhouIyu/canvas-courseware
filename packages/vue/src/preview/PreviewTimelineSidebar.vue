<script setup lang="ts">
import { computed } from "vue";
import { formatTriggerLabel } from "../shared";
import EmptyState from "../shared/EmptyState.vue";
import type { PlaybackState, TimelineStep } from "@canvas-courseware/core";

/** 右侧步骤栏的只读输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前页面的全部步骤列表。 */
    steps?: TimelineStep[];
    /** 当前播放器已经推进到的步骤索引。 */
    stepIndex?: number;
    /** 当前已经完成的步骤数量。 */
    completedStepCount?: number;
    /** 当前播放状态。 */
    playbackStatus?: PlaybackState["status"];
    /** 当前页是否就是预览焦点页。 */
    isActiveSlide?: boolean;
    /** 当前页在整份课件中的页码标签。 */
    slidePositionLabel?: string;
    /** 整份课件的页面级进度标签。 */
    coursewareProgressLabel?: string;
    /** 当前课件进度的补充说明。 */
    coursewareProgressCopy?: string;
    /** 当前页整体进度标签。 */
    slideProgressLabel?: string;
    /** 当前页卡片状态标签。 */
    slideStatusLabel?: string;
  }>(),
  {
    steps: () => [],
    stepIndex: 0,
    completedStepCount: 0,
    playbackStatus: "idle",
    isActiveSlide: false,
    slidePositionLabel: "未选择页面",
    coursewareProgressLabel: "暂无课件页面",
    coursewareProgressCopy: "切换页面后，这里会同步展示整份课件的播放进度。",
    slideProgressLabel: "0/0 步",
    slideStatusLabel: "未播放",
  },
);

/** 当前步骤数量的紧凑摘要。 */
const stepCountLabel = computed(() =>
  props.steps.length === 0 ? "无步骤" : `${props.steps.length} 个步骤`,
);

/** 顶部概览卡片的补充说明，完成态优先给出下一动作提示。 */
const timelineSummaryCopy = computed(() => {
  if (props.steps.length === 0) {
    return "当前页面还没有配置播放步骤。";
  }

  if (props.playbackStatus === "completed") {
    return "当前页已播放完成，可切换页面或重新开始。";
  }

  if (props.playbackStatus === "playing") {
    return "当前页正在自动推进。";
  }

  return "当前焦点页，按步骤推进预览。";
});

/** 判断某一步是否已经执行完成。 */
const isStepCompleted = (stepIndex: number) => stepIndex < props.completedStepCount;

/** 判断某一步是否是当前正在等待触发的焦点步骤。 */
const isStepCurrent = (stepIndex: number) =>
  stepIndex === props.completedStepCount && stepIndex < props.steps.length;

/** 生成某一步当前对应的状态文案。 */
const resolveStepStatusLabel = (stepIndex: number) => {
  if (isStepCompleted(stepIndex)) {
    return "已完成";
  }

  if (isStepCurrent(stepIndex)) {
    if (props.playbackStatus === "playing") {
      return "播放中";
    }

    if (props.steps[stepIndex]?.trigger.type === "auto") {
      return "自动触发";
    }

    return "待触发";
  }

  return "待执行";
};

/** 生成某一步状态标签使用的色值，保证当前焦点更容易识别。 */
const resolveStepStatusColor = (stepIndex: number) => {
  if (isStepCompleted(stepIndex)) {
    return "#00b42a";
  }

  if (isStepCurrent(stepIndex)) {
    return props.playbackStatus === "paused" ? "#ff7d00" : "#165dff";
  }

  return "#86909c";
};
</script>

<template>
  <aside class="preview-side timeline-shell">
    <header class="section-head compact">
      <div class="timeline-heading">
        <h3>步骤状态</h3>
        <p>{{ props.coursewareProgressLabel }}</p>
      </div>
      <a-tag v-if="props.isActiveSlide" class="timeline-status-tag" bordered>
        {{ props.slideStatusLabel }}
      </a-tag>
      <span v-else class="timeline-status-text">{{ props.slideStatusLabel }}</span>
    </header>

    <div class="timeline-summary-card">
      <div class="timeline-summary-card__meta">
        <span>{{ props.slidePositionLabel }}</span>
        <span>{{ stepCountLabel }}</span>
      </div>
      <div class="timeline-summary-card__row">
        <span>当前页</span>
        <strong>{{ props.slideProgressLabel }}</strong>
      </div>
      <div class="timeline-summary-card__row">
        <span>课件进度</span>
        <span class="timeline-summary-card__value">{{ props.coursewareProgressLabel }}</span>
      </div>
      <p class="timeline-summary-card__copy">{{ timelineSummaryCopy }}</p>
    </div>

    <ol v-if="props.steps.length > 0" class="steps-list">
      <li
        v-for="(step, index) in props.steps"
        :key="step.id"
        class="preview-step-card"
        :class="{
          'is-done': isStepCompleted(index),
          'is-current': isStepCurrent(index),
        }"
      >
        <div class="preview-step-card__top">
          <div class="preview-step-card__headline">
            <span class="step-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <strong>{{ step.name }}</strong>
          </div>
          <a-tag class="preview-step-status" :color="resolveStepStatusColor(index)" bordered>
            {{ resolveStepStatusLabel(index) }}
          </a-tag>
        </div>
        <div class="preview-step-card__bottom">
          <span class="step-trigger">{{ formatTriggerLabel(step.trigger.type) }}</span>
          <small>{{ step.actions.length }} 个动作</small>
        </div>
      </li>
    </ol>
    <EmptyState
      v-else
      compact
      title="当前页面还没有播放步骤"
      description="回到编辑模式，点击“新建步骤”开始配置"
    >
      <template #icon>◎</template>
    </EmptyState>
  </aside>
</template>

<style scoped>
.timeline-heading {
  display: grid;
  gap: 2px;
}

.timeline-heading p {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cw-color-muted);
}

.timeline-status-tag,
.timeline-status-text {
  flex-shrink: 0;
}

.timeline-status-text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--cw-color-muted);
}

.timeline-summary-card {
  display: grid;
  gap: 6px;
  margin: 8px 12px 6px;
  padding: 8px 10px 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(255, 255, 255, 0.98));
}

.timeline-summary-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.timeline-summary-card__meta span,
.timeline-summary-card__row span,
.timeline-summary-card__copy {
  font-size: 12px;
  line-height: 1.45;
  color: var(--cw-color-muted);
}

.timeline-summary-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.timeline-summary-card strong {
  font-size: 13px;
  line-height: 1.3;
  color: var(--cw-color-text);
  white-space: nowrap;
}

.timeline-summary-card__value {
  font-size: 12px;
  line-height: 1.35;
  font-weight: 600;
  color: var(--cw-color-text);
  white-space: nowrap;
}

.timeline-summary-card__copy {
  margin: 0;
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-3);
  margin-bottom: 0;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--cw-color-border) 92%, #ffffff);
  background: rgba(255, 255, 255, 0.97);
}

.section-head h3 {
  margin: 0;
  font-size: 20px;
  line-height: 1.08;
}

.preview-side {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--cw-color-border) 90%, #ffffff);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
}

.steps-list {
  display: grid;
  align-content: start;
  gap: 6px;
  grid-auto-rows: var(--cw-preview-step-card-height, 84px);
  min-height: 0;
  margin: 0;
  overflow-y: auto;
  padding: 0 12px 12px;
  list-style: none;
}

.preview-step-card {
  position: relative;
  display: grid;
  gap: 6px;
  align-content: center;
  height: var(--cw-preview-step-card-height, 84px);
  padding: 10px 12px 10px 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: var(--cw-radius-md);
  background: rgba(255, 255, 255, 0.98);
  overflow: hidden;
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard);
}

.preview-step-card::before {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 999px;
  background: rgba(134, 144, 156, 0.22);
}

.preview-step-card.is-current {
  border-color: rgba(22, 93, 255, 0.3);
  background: rgba(240, 247, 255, 0.98);
  box-shadow: inset 0 0 0 1px rgba(22, 93, 255, 0.08);
}

.preview-step-card.is-current::before {
  background: #165dff;
}

.preview-step-card.is-done {
  opacity: 0.72;
}

.preview-step-card.is-done::before {
  background: #00b42a;
}

.preview-step-card__top,
.preview-step-card__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.preview-step-card__headline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.preview-step-card__headline strong {
  overflow: hidden;
  font-size: 13px;
  line-height: 1.35;
  color: var(--cw-color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-index {
  display: inline-grid;
  flex-shrink: 0;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--cw-radius-pill);
  font-size: 11px;
  font-weight: 700;
  color: var(--cw-color-primary);
  background: var(--cw-color-primary-soft);
}

.preview-step-card__bottom small {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--cw-color-muted);
}

.step-trigger {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--cw-color-muted);
  background: rgba(15, 23, 42, 0.05);
  white-space: nowrap;
}

.preview-step-status {
  flex-shrink: 0;
  margin-left: 8px;
}

.preview-side :deep(.cw-empty-state) {
  margin-top: 12px;
  max-width: none;
}
</style>
