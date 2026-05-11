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
    <a-button
      class="stage-viewport-controls__icon-button"
      aria-label="缩小画布"
      :disabled="!props.canZoomOut"
      size="mini"
      type="outline"
      @click="emit('zoom-out')"
    >
      <template #icon>
        <icon-minus />
      </template>
    </a-button>
    <a-tag
      class="stage-viewport-controls__zoom-tag"
      color="arcoblue"
      :title="props.isFitZoom ? '当前为适配画布视图' : '当前为手动缩放视图'"
      bordered
    >
      {{ props.zoomLabel }}
    </a-tag>
    <a-button
      class="stage-viewport-controls__icon-button"
      aria-label="放大画布"
      :disabled="!props.canZoomIn"
      size="mini"
      type="outline"
      @click="emit('zoom-in')"
    >
      <template #icon>
        <icon-plus />
      </template>
    </a-button>
    <a-button
      class="stage-viewport-controls__preset-button"
      aria-label="恢复 100% 视图"
      :type="props.isActualSizeZoom ? 'primary' : 'outline'"
      size="mini"
      @click="emit('zoom-to-actual-size')"
    >
      100%
    </a-button>
    <a-button
      class="stage-viewport-controls__icon-button"
      aria-label="适配画布"
      :type="props.isFitZoom ? 'primary' : 'outline'"
      size="mini"
      @click="emit('zoom-to-fit')"
    >
      <template #icon>
        <icon-fullscreen />
      </template>
    </a-button>
  </div>
</template>

<style scoped>
.stage-viewport-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--cw-color-border) 88%, #ffffff);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow:
    0 12px 28px rgba(15, 23, 42, 0.08),
    0 2px 6px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(14px);
}

.stage-viewport-controls__icon-button,
.stage-viewport-controls__preset-button {
  min-width: 32px;
  height: 32px;
  border-radius: 10px;
}

.stage-viewport-controls__icon-button:deep(.arco-btn-icon) {
  font-size: 14px;
}

.stage-viewport-controls__preset-button {
  min-width: 54px;
  padding-inline: 12px;
  font-size: 12px;
  font-weight: 700;
}

.stage-viewport-controls__zoom-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 76px;
  min-height: 32px;
  padding-inline: 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: default;
  user-select: none;
}

.stage-viewport-controls__zoom-tag:deep(.arco-tag-content) {
  min-width: 100%;
  text-align: center;
}
</style>
