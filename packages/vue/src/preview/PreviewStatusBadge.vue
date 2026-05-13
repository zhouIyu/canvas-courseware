<script setup lang="ts">
import { ref, watch } from "vue";

/** 预览画布右上角状态 Badge 的展示参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前播放状态的中文标签。 */
    playbackStatusLabel?: string;
    /** 当前播放状态标签的主色。 */
    playbackStatusTagColor?: string;
    /** 当前页码位置摘要。 */
    slidePositionLabel?: string;
    /** 当前步骤位置摘要。 */
    stepPositionLabel?: string;
    /** 整份课件的完成进度摘要。 */
    coursewareProgressLabel?: string;
    /** 当前课件进度的补充说明。 */
    coursewareProgressCopy?: string;
    /** 当前页提示标题。 */
    playbackHintTitle?: string;
    /** 当前页提示补充文案。 */
    playbackHintCopy?: string;
    /** 外部状态变化时用于重置展开态的键值。 */
    resetKey?: string | number;
  }>(),
  {
    playbackStatusLabel: "未播放",
    playbackStatusTagColor: "#86909c",
    slidePositionLabel: "未选择页面",
    stepPositionLabel: "当前页无步骤",
    coursewareProgressLabel: "暂无课件页面",
    coursewareProgressCopy: "切换页面后，这里会同步展示整份课件的播放进度。",
    playbackHintTitle: "未加载预览页面",
    playbackHintCopy: "切换页面后，这里会自动同步同一份课件文档与预览状态。",
    resetKey: "initial",
  },
);

/** 当前是否展开为详细态。 */
const isExpanded = ref(false);

/** 展开详细态，供查看课件进度与提示信息。 */
const expandBadge = () => {
  isExpanded.value = true;
};

/** 收起详细态，恢复为只读摘要。 */
const collapseBadge = () => {
  isExpanded.value = false;
};

/** 预览进度切换时自动收起，避免旧状态残留在下一页。 */
watch(
  () => props.resetKey,
  () => {
    collapseBadge();
  },
);
</script>

<template>
  <div class="preview-status-badge" :class="{ 'is-expanded': isExpanded }">
    <button
      v-if="!isExpanded"
      type="button"
      class="preview-status-badge__compact"
      aria-label="展开预览状态详情"
      @click="expandBadge"
    >
      <a-tag class="preview-status-badge__tag" :color="props.playbackStatusTagColor" bordered>
        {{ props.playbackStatusLabel }}
      </a-tag>
      <div class="preview-status-badge__summary">
        <strong>{{ props.slidePositionLabel }}</strong>
        <span>{{ props.stepPositionLabel }}</span>
      </div>
    </button>

    <div v-else class="preview-status-badge__expanded">
      <div class="preview-status-badge__header">
        <a-tag class="preview-status-badge__tag" :color="props.playbackStatusTagColor" bordered>
          {{ props.playbackStatusLabel }}
        </a-tag>
        <a-button
          class="preview-status-badge__close"
          type="text"
          size="mini"
          aria-label="收起预览状态详情"
          @click="collapseBadge"
        >
          <template #icon>
            <icon-close />
          </template>
        </a-button>
      </div>

      <div class="preview-status-badge__body">
        <div class="preview-status-badge__row">
          <span>课件进度</span>
          <strong>{{ props.coursewareProgressLabel }}</strong>
        </div>
        <small class="preview-status-badge__meta">{{ props.coursewareProgressCopy }}</small>

        <div class="preview-status-badge__row">
          <span>当前页</span>
          <strong>{{ props.slidePositionLabel }}</strong>
        </div>
        <small class="preview-status-badge__meta">{{ props.stepPositionLabel }}</small>

        <div class="preview-status-badge__hint">
          <span>当前提示</span>
          <strong>{{ props.playbackHintTitle }}</strong>
          <small>{{ props.playbackHintCopy }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-status-badge {
  position: absolute;
  top: calc(var(--cw-preview-fit-padding-block-start, 8px) + 8px);
  right: calc(var(--cw-preview-fit-padding-inline, 6px) + 8px);
  z-index: 4;
  width: min(264px, calc(100% - 24px));
}

.preview-status-badge__compact,
.preview-status-badge__expanded {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow:
    0 14px 32px rgba(15, 23, 42, 0.08),
    0 2px 8px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(14px);
}

.preview-status-badge__compact {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard);
}

.preview-status-badge__compact:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.92);
  box-shadow:
    0 18px 36px rgba(15, 23, 42, 0.1),
    0 2px 8px rgba(15, 23, 42, 0.05);
}

.preview-status-badge__summary {
  display: grid;
  gap: 2px;
  text-align: left;
}

.preview-status-badge__summary strong {
  font-size: 13px;
  line-height: 1.4;
  color: var(--cw-color-text);
}

.preview-status-badge__summary span,
.preview-status-badge__meta,
.preview-status-badge__hint span,
.preview-status-badge__hint small,
.preview-status-badge__row span {
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.preview-status-badge__expanded {
  display: grid;
  gap: 12px;
  padding: 12px;
}

.preview-status-badge__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.preview-status-badge__close {
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--cw-color-muted);
}

.preview-status-badge__body {
  display: grid;
  gap: 8px;
}

.preview-status-badge__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.preview-status-badge__row strong,
.preview-status-badge__hint strong {
  font-size: 13px;
  line-height: 1.4;
  color: var(--cw-color-text);
}

.preview-status-badge__hint {
  display: grid;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.preview-status-badge__tag:deep(.arco-tag) {
  min-height: 24px;
  padding-inline: 8px;
}

@container (max-width: 768px) {
  .preview-status-badge {
    width: min(232px, calc(100% - 20px));
  }
}
</style>
