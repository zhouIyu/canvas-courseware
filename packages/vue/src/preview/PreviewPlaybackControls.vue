<script setup lang="ts">
import { computed, ref } from "vue";

/** 预览播放控制条的只读展示参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前是否还能回到上一页。 */
    canActivatePreviousSlide?: boolean;
    /** 当前是否还能切到下一页。 */
    canActivateNextSlide?: boolean;
    /** 当前是否还能回退到上一步。 */
    canStepBackward?: boolean;
    /** 当前是否存在可播放页面。 */
    hasActiveSlide?: boolean;
    /** 当前是否还存在下一步可继续播放。 */
    canPlayNextStep?: boolean;
    /** 当前是否已经完整播完整份课件。 */
    isCoursewareCompleted?: boolean;
    /** 当前是否已进入沉浸播放模式。 */
    isImmersivePlayback?: boolean;
    /** 当前沉浸播放入口的文案。 */
    immersiveToggleLabel?: string;
  }>(),
  {
    canActivatePreviousSlide: false,
    canActivateNextSlide: false,
    canStepBackward: false,
    hasActiveSlide: false,
    canPlayNextStep: false,
    isCoursewareCompleted: false,
    isImmersivePlayback: false,
    immersiveToggleLabel: "沉浸播放",
  },
);

/** 主操作按钮是否应该进入完成态。 */
const primaryActionLabel = computed(() =>
  props.isCoursewareCompleted ? "已完成" : "播放下一步",
);

/** 主操作按钮是否允许继续点击。 */
const isPrimaryActionDisabled = computed(() => !props.canPlayNextStep);

/** 当前“更多”面板是否处于展开态。 */
const isMoreActionsVisible = ref(false);

/** 预览播放控制条对外派发的标准意图。 */
const emit = defineEmits<{
  /** 请求切到上一页。 */
  "activate-previous-slide": [];
  /** 请求回退到上一步。 */
  "step-backward": [];
  /** 请求重播当前页。 */
  "replay-current-slide": [];
  /** 请求播放下一步。 */
  "play-next-step": [];
  /** 请求切到下一页。 */
  "activate-next-slide": [];
  /** 请求重新开始整份课件。 */
  "restart-courseware": [];
  /** 请求切换沉浸播放状态。 */
  "toggle-immersive-playback": [];
}>();

/** 关闭低频动作弹出层。 */
const closeMoreActions = () => {
  isMoreActionsVisible.value = false;
};

/** 处理低频动作，统一做派发与收口。 */
const handleMoreAction = (
  action: "restart-courseware" | "toggle-immersive-playback",
) => {
  if (action === "restart-courseware") {
    emit("restart-courseware");
    closeMoreActions();
    return;
  }

  emit("toggle-immersive-playback");
  closeMoreActions();
};
</script>

<template>
  <div class="preview-playback-controls" role="group" aria-label="预览播放控制">
    <div class="preview-playback-controls__navigation">
      <a-button-group>
        <a-button
          class="preview-secondary-button"
          type="outline"
          :disabled="!props.canActivatePreviousSlide"
          @click="emit('activate-previous-slide')"
        >
          <template #icon>
            <icon-left />
          </template>
          上一页
        </a-button>
        <a-button
          class="preview-secondary-button"
          type="outline"
          :disabled="!props.canStepBackward"
          @click="emit('step-backward')"
        >
          <template #icon>
            <icon-arrow-left />
          </template>
          上一步
        </a-button>
        <a-button
          class="preview-secondary-button"
          type="outline"
          :disabled="!props.hasActiveSlide"
          @click="emit('replay-current-slide')"
        >
          <template #icon>
            <icon-refresh />
          </template>
          重播
        </a-button>
        <a-button
          class="preview-secondary-button"
          type="outline"
          :disabled="!props.canActivateNextSlide"
          @click="emit('activate-next-slide')"
        >
          下一页
          <template #icon>
            <icon-right />
          </template>
        </a-button>
      </a-button-group>
    </div>

    <div class="preview-playback-controls__primary">
      <a-trigger
        v-model:popup-visible="isMoreActionsVisible"
        trigger="click"
        position="bl"
        popup-container="body"
      >
        <a-button
          class="preview-more-button"
          type="outline"
          :disabled="!props.hasActiveSlide"
        >
          更多
          <template #icon>
            <icon-more-vertical />
          </template>
        </a-button>
        <template #content>
          <div class="preview-more-menu" role="menu" aria-label="更多预览操作">
            <button
              type="button"
              class="preview-more-menu__item"
              @mousedown.stop.prevent
              @click.stop.prevent="handleMoreAction('restart-courseware')"
            >
              <icon-refresh />
              <span>重新开始课件</span>
            </button>
            <button
              type="button"
              class="preview-more-menu__item"
              @mousedown.stop.prevent
              @click.stop.prevent="handleMoreAction('toggle-immersive-playback')"
            >
              <icon-fullscreen />
              <span>{{ props.immersiveToggleLabel }}</span>
            </button>
          </div>
        </template>
      </a-trigger>

      <a-button
        class="preview-primary-button"
        type="primary"
        size="large"
        :disabled="isPrimaryActionDisabled"
        :class="{ 'is-completed': props.isCoursewareCompleted }"
        @click="emit('play-next-step')"
      >
        {{ primaryActionLabel }}
      </a-button>
    </div>
  </div>
</template>

<style scoped>
.preview-playback-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 0;
}

.preview-playback-controls__navigation,
.preview-playback-controls__primary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.preview-secondary-button,
.preview-more-button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.preview-secondary-button:deep(.arco-btn-icon),
.preview-more-button:deep(.arco-btn-icon) {
  font-size: 14px;
}

.preview-primary-button {
  min-width: 124px;
  min-height: 38px;
  padding-inline: 18px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 12px 24px rgba(22, 93, 255, 0.18);
}

.preview-primary-button.is-completed {
  opacity: 0.82;
}

.preview-playback-controls__menu-option {
  font-size: 12px;
}

.preview-more-menu {
  display: grid;
  gap: 4px;
  min-width: 160px;
  padding: 4px 0;
}

.preview-more-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  color: var(--cw-color-text);
  cursor: pointer;
  background: transparent;
  transition:
    background var(--cw-duration-fast) var(--cw-ease-standard),
    color var(--cw-duration-fast) var(--cw-ease-standard);
}

.preview-more-menu__item:hover {
  color: var(--cw-color-primary);
  background: rgba(22, 93, 255, 0.08);
}

.preview-more-menu__item :deep(svg) {
  font-size: 14px;
}

@container (max-width: 768px) {
  .preview-playback-controls {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .preview-playback-controls__navigation,
  .preview-playback-controls__primary {
    flex-wrap: wrap;
  }
}
</style>
