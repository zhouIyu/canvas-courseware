<script setup lang="ts">
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
    isImmersivePlayback: false,
    immersiveToggleLabel: "沉浸播放",
  },
);

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
  /** 请求切换沉浸播放状态。 */
  "toggle-immersive-playback": [];
}>();
</script>

<template>
  <div class="preview-playback-controls" role="group" aria-label="预览播放控制">
    <a-button
      class="preview-text-button"
      type="text"
      :disabled="!props.canActivatePreviousSlide"
      @click="emit('activate-previous-slide')"
    >
      上一页
    </a-button>
    <a-button
      class="preview-text-button"
      type="text"
      :disabled="!props.canStepBackward"
      @click="emit('step-backward')"
    >
      上一步
    </a-button>
    <a-button
      class="preview-text-button"
      type="text"
      :disabled="!props.hasActiveSlide"
      @click="emit('replay-current-slide')"
    >
      重播当前页
    </a-button>
    <a-button
      class="preview-text-button"
      type="text"
      :disabled="!props.canActivateNextSlide"
      @click="emit('activate-next-slide')"
    >
      下一页
    </a-button>
    <a-button
      class="preview-text-button"
      type="text"
      :disabled="!props.hasActiveSlide"
      :class="{ 'is-active': props.isImmersivePlayback }"
      @click="emit('toggle-immersive-playback')"
    >
      {{ props.immersiveToggleLabel }}
    </a-button>
    <a-button type="primary" :disabled="!props.hasActiveSlide" @click="emit('play-next-step')">
      播放下一步
    </a-button>
  </div>
</template>

<style scoped>
.preview-playback-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.preview-text-button {
  min-height: 32px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-color-primary);
}

.preview-text-button.is-active {
  color: #0f6bff;
  background: rgba(22, 93, 255, 0.08);
}

.preview-text-button:hover {
  color: #0f6bff;
  background: rgba(22, 93, 255, 0.08);
}
</style>
