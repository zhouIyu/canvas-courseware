<script setup lang="ts">
import { formatTriggerLabel } from "../shared";
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
    slideProgressLabel: "0/0 步",
    slideStatusLabel: "未播放",
  },
);

/** 生成某一步当前对应的状态文案。 */
const resolveStepStatusLabel = (stepIndex: number) => {
  if (stepIndex < props.completedStepCount) {
    return "已完成";
  }

  if (stepIndex === props.stepIndex && stepIndex < props.steps.length) {
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
  if (stepIndex < props.completedStepCount) {
    return "#00b42a";
  }

  if (stepIndex === props.stepIndex && stepIndex < props.steps.length) {
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
        <p>{{ props.slidePositionLabel }} · {{ props.slideProgressLabel }}</p>
      </div>
      <a-tag v-if="props.isActiveSlide" class="timeline-status-tag" bordered>
        {{ props.slideStatusLabel }}
      </a-tag>
      <span v-else class="timeline-status-text">{{ props.slideStatusLabel }}</span>
    </header>

    <div v-if="props.steps.length > 0" class="timeline-summary-card">
      <strong>{{ props.slideProgressLabel }}</strong>
      <small>
        {{ props.playbackStatus === "completed" ? "当前页播放完成" : "按步骤推进当前页预览" }}
      </small>
    </div>

    <ol v-if="props.steps.length > 0" class="steps-list">
      <li
        v-for="(step, index) in props.steps"
        :key="step.id"
        class="preview-step-card"
        :class="{
          'is-done': index < props.stepIndex,
          'is-current': index === props.stepIndex,
        }"
      >
        <div class="preview-step-marker">
          <div class="step-index">{{ String(index + 1).padStart(2, '0') }}</div>
        </div>
        <div class="step-copy">
          <div class="step-row">
            <strong>{{ step.name }}</strong>
            <a-tag class="preview-step-status" :color="resolveStepStatusColor(index)" bordered>
              {{ resolveStepStatusLabel(index) }}
            </a-tag>
          </div>
          <div class="step-row step-row-meta">
            <span class="step-trigger">{{ formatTriggerLabel(step.trigger.type) }}</span>
            <small>{{ step.actions.length }} 个动作</small>
          </div>
        </div>
      </li>
    </ol>
    <div v-else class="empty-state compact">
      <strong>当前页面还没有步骤</strong>
      <p>后续 timeline 配置完成后，这里会直接展示页面点击、自动触发与对象点击的执行顺序。</p>
    </div>
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
  gap: 4px;
  margin: 12px 12px 10px;
  padding: 10px 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(255, 255, 255, 0.98));
}

.timeline-summary-card strong {
  font-size: 14px;
  line-height: 1.3;
  color: var(--cw-color-text);
}

.timeline-summary-card small {
  font-size: 12px;
  line-height: 1.45;
  color: var(--cw-color-muted);
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
  gap: 8px;
  grid-auto-rows: var(--cw-preview-step-card-height, 84px);
  min-height: 0;
  margin: 0;
  overflow-y: auto;
  padding: 0 12px 12px;
  list-style: none;
}

.preview-step-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--cw-space-3);
  align-items: center;
  height: var(--cw-preview-step-card-height, 84px);
  padding: 10px 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: var(--cw-radius-md);
  background: rgba(255, 255, 255, 0.98);
  overflow: hidden;
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard);
}

.preview-step-card.is-current {
  border-color: rgba(22, 93, 255, 0.3);
  background: rgba(240, 247, 255, 0.98);
  box-shadow: inset 0 0 0 1px rgba(22, 93, 255, 0.08);
}

.preview-step-card.is-done {
  opacity: 0.72;
}

.preview-step-marker {
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-index {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--cw-radius-pill);
  font-size: 12px;
  font-weight: 700;
  color: var(--cw-color-primary);
  background: var(--cw-color-primary-soft);
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

.step-row span,
.step-copy small {
  font-size: 13px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.step-row-meta {
  align-items: center;
}

.step-trigger {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--cw-color-muted);
  background: rgba(15, 23, 42, 0.05);
  white-space: nowrap;
}

.preview-step-status {
  flex-shrink: 0;
}

.empty-state {
  display: grid;
  gap: var(--cw-space-2);
  justify-items: center;
  max-width: 28rem;
  margin: 12px auto;
  padding: var(--cw-space-6);
  border: 1px dashed color-mix(in srgb, var(--cw-color-primary) 28%, transparent);
  border-radius: var(--cw-radius-lg);
  color: var(--cw-color-muted);
  background: rgba(255, 255, 255, 0.9);
  text-align: center;
}

.empty-state.compact {
  padding: var(--cw-space-5);
}

.empty-state strong {
  font-size: 18px;
  color: var(--cw-color-text);
}
</style>
