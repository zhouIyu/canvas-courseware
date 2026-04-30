<script setup lang="ts">
/** 共享视图控制条的只读输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前是否还能继续放大。 */
    canZoomIn?: boolean;
    /** 当前是否还能继续缩小。 */
    canZoomOut?: boolean;
    /** 当前是否处于适配视图。 */
    isFitZoom?: boolean;
    /** 当前是否处于手动 `100%` 视图。 */
    isActualSizeZoom?: boolean;
    /** 当前需要展示的缩放标签。 */
    zoomLabel?: string;
  }>(),
  {
    canZoomIn: false,
    canZoomOut: false,
    isFitZoom: false,
    isActualSizeZoom: false,
    zoomLabel: "100%",
  },
);

/** 共享视图控制条向外派发的缩放意图。 */
const emit = defineEmits<{
  /** 请求切到更小一档缩放。 */
  "zoom-out": [];
  /** 请求切到更大一档缩放。 */
  "zoom-in": [];
  /** 请求恢复到适配视图。 */
  "zoom-to-fit": [];
  /** 请求恢复到手动 `100%` 视图。 */
  "zoom-to-actual-size": [];
}>();
</script>

<template>
  <div class="stage-viewport-controls" role="group" aria-label="画布视图控制">
    <span class="stage-viewport-controls__caption">视图</span>
    <span
      class="stage-viewport-controls__indicator"
      :class="{ 'is-fit': props.isFitZoom }"
      :title="props.isFitZoom ? '当前为适配画布视图' : '当前为手动缩放视图'"
    >
      {{ props.zoomLabel }}
    </span>
    <a-button
      class="stage-viewport-controls__button"
      type="text"
      :disabled="!props.canZoomOut"
      @click="emit('zoom-out')"
    >
      缩小
    </a-button>
    <a-button
      class="stage-viewport-controls__button"
      type="text"
      :disabled="!props.canZoomIn"
      @click="emit('zoom-in')"
    >
      放大
    </a-button>
    <a-button
      class="stage-viewport-controls__button"
      type="text"
      :class="{ 'is-active': props.isFitZoom }"
      @click="emit('zoom-to-fit')"
    >
      适配
    </a-button>
    <a-button
      class="stage-viewport-controls__button"
      type="text"
      :class="{ 'is-active': props.isActualSizeZoom }"
      @click="emit('zoom-to-actual-size')"
    >
      100%
    </a-button>
  </div>
</template>

<style scoped>
.stage-viewport-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid color-mix(in srgb, var(--cw-color-border) 88%, #ffffff);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.stage-viewport-controls__caption {
  flex-shrink: 0;
  padding: 0 6px 0 2px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cw-color-muted);
}

.stage-viewport-controls__indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 58px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--cw-color-text);
  background: rgba(255, 255, 255, 0.92);
}

.stage-viewport-controls__indicator.is-fit {
  color: var(--cw-color-primary);
  background: color-mix(in srgb, var(--cw-color-primary-soft) 76%, #ffffff);
}

.stage-viewport-controls__button {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-color-primary);
}

.stage-viewport-controls__button.is-active {
  color: #0f6bff;
  background: rgba(22, 93, 255, 0.08);
}

.stage-viewport-controls__button:hover {
  color: #0f6bff;
  background: rgba(22, 93, 255, 0.08);
}
</style>
