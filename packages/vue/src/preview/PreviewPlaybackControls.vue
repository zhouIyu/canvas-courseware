<script setup lang="ts">
import { computed } from "vue";

type PreviewPlaybackDropdownAction = "restart-courseware" | "toggle-immersive-playback";

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

/** 处理低频菜单动作，统一把菜单选择映射回既有事件。 */
const handleDropdownActionSelect = (action: string | number | Record<string, unknown>) => {
  if (typeof action !== "string") {
    return;
  }

  const normalizedAction = action as PreviewPlaybackDropdownAction;
  if (normalizedAction === "restart-courseware") {
    emit("restart-courseware");
    return;
  }

  if (normalizedAction === "toggle-immersive-playback") {
    emit("toggle-immersive-playback");
  }
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
      <a-dropdown @select="handleDropdownActionSelect">
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
          <a-doption
            class="preview-playback-controls__menu-option"
            value="restart-courseware"
          >
            <template #icon>
              <icon-refresh />
            </template>
            重新开始课件
          </a-doption>
          <a-doption
            class="preview-playback-controls__menu-option"
            value="toggle-immersive-playback"
          >
            <template #icon>
              <icon-fullscreen />
            </template>
            {{ props.immersiveToggleLabel }}
          </a-doption>
        </template>
      </a-dropdown>

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
