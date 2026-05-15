<script setup lang="ts">
import {
  DEFAULT_IMAGE_CROP,
  normalizeImageCrop,
  resolveImageFrameLayout,
  type ImageCrop,
  type ImageLayoutSize,
  type ObjectFit,
} from "@canvas-courseware/core";
import { computed, ref, watch } from "vue";

/** 裁剪预览画框宽度。 */
const PREVIEW_FRAME_WIDTH = 320;

/** 裁剪预览画框高度。 */
const PREVIEW_FRAME_HEIGHT = 214;

/** 图片裁剪弹窗的输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前弹窗是否显示。 */
    visible?: boolean;
    /** 当前预览图片地址。 */
    source?: string;
    /** 当前图片资源说明。 */
    sourceLabel?: string;
    /** 当前图片适配方式。 */
    objectFit?: ObjectFit;
    /** 当前图片翻转状态。 */
    flipX?: boolean;
    /** 当前图片翻转状态。 */
    flipY?: boolean;
    /** 当前待回显的裁剪窗口。 */
    initialCrop?: ImageCrop | null;
    /** 当前图片原始尺寸。 */
    naturalSize?: ImageLayoutSize | null;
    /** 当前确认按钮是否处于提交中。 */
    confirmLoading?: boolean;
    /** 当前是否允许清空为整图。 */
    allowReset?: boolean;
    /** 弹窗标题。 */
    title?: string;
    /** 确认按钮文案。 */
    okText?: string;
  }>(),
  {
    visible: false,
    source: "",
    sourceLabel: "当前图片",
    objectFit: "cover",
    flipX: false,
    flipY: false,
    initialCrop: null,
    naturalSize: null,
    confirmLoading: false,
    allowReset: true,
    title: "裁剪图片",
    okText: "确认",
  },
);

/** 图片裁剪弹窗向外派发的事件。 */
const emit = defineEmits<{
  /** 用户确认后回传最终裁剪窗口。 */
  confirm: [crop: ImageCrop];
  /** 用户关闭当前弹窗。 */
  cancel: [];
}>();

/** 弹窗内部维护的裁剪窗口草稿。 */
const draftCrop = ref<ImageCrop>({ ...DEFAULT_IMAGE_CROP });

/** 当前预览读取到的原始尺寸。 */
const resolvedNaturalSize = computed<ImageLayoutSize>(() => ({
  width: Math.max(props.naturalSize?.width ?? 1, 1),
  height: Math.max(props.naturalSize?.height ?? 1, 1),
}));

/** 当前裁剪布局预览。 */
const previewLayout = computed(() =>
  resolveImageFrameLayout({
    frameWidth: PREVIEW_FRAME_WIDTH,
    frameHeight: PREVIEW_FRAME_HEIGHT,
    sourceSize: resolvedNaturalSize.value,
    objectFit: props.objectFit,
    crop: draftCrop.value,
  }),
);

/** 当前预览图层样式。 */
const previewImageStyle = computed(() => ({
  width: `${previewLayout.value.drawWidth}px`,
  height: `${previewLayout.value.drawHeight}px`,
  left: `${previewLayout.value.offsetX}px`,
  top: `${previewLayout.value.offsetY}px`,
  transform:
    `${props.flipX ? "scaleX(-1) " : ""}${props.flipY ? "scaleY(-1)" : ""}`.trim() || "none",
  backgroundImage: props.source.trim() ? `url("${props.source}")` : "none",
  backgroundSize: "100% 100%",
  backgroundRepeat: "no-repeat",
}));

/** 图片裁剪预览中的拖拽态起点。 */
const dragStartPointer = ref<{ x: number; y: number } | null>(null);

/** 图片裁剪预览中的拖拽起始裁剪窗口。 */
const dragStartCrop = ref<ImageCrop | null>(null);

/** 当弹窗重新打开时，回写外层传入的默认裁剪值。 */
const syncDraftCrop = () => {
  draftCrop.value = {
    ...normalizeImageCrop(props.initialCrop),
  };
};

/** 读取数值输入并做边界保护。 */
const readNumberInputValue = (
  value: unknown,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number => {
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : value instanceof Event &&
          (value.target instanceof HTMLInputElement || value.target instanceof HTMLSelectElement)
        ? Number(value.target.value)
      : Number.NaN;

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
};

/** 统一把裁剪窗口约束回合法范围。 */
const normalizeDraftCrop = (crop: ImageCrop): ImageCrop => {
  const normalizedCrop = normalizeImageCrop(crop);
  return {
    x: Math.round(normalizedCrop.x * 1000) / 1000,
    y: Math.round(normalizedCrop.y * 1000) / 1000,
    width: Math.round(normalizedCrop.width * 1000) / 1000,
    height: Math.round(normalizedCrop.height * 1000) / 1000,
  };
};

/** 更新裁剪窗口数值字段。 */
const handleCropNumberChange = (field: keyof ImageCrop, value: number | string | undefined) => {
  const fallbackCrop = draftCrop.value;
  const minimum = field === "width" || field === "height" ? 0.05 : 0;
  const maximum =
    field === "x"
      ? Math.max(1 - fallbackCrop.width, 0)
      : field === "y"
        ? Math.max(1 - fallbackCrop.height, 0)
        : field === "width"
          ? Math.max(1 - fallbackCrop.x, 0.05)
          : Math.max(1 - fallbackCrop.y, 0.05);

  const nextCrop = {
    ...fallbackCrop,
    [field]:
      Math.round(
        readNumberInputValue(value, fallbackCrop[field], minimum, maximum) * 1000,
      ) / 1000,
  };

  draftCrop.value = normalizeDraftCrop(nextCrop);
};

/** 开始在裁剪预览里拖拽图片内容。 */
const handleCropPreviewPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) {
    return;
  }

  dragStartPointer.value = {
    x: event.clientX,
    y: event.clientY,
  };
  dragStartCrop.value = { ...draftCrop.value };
  window.addEventListener("pointermove", handleCropPreviewPointerMove);
  window.addEventListener("pointerup", handleCropPreviewPointerUp, { once: true });
};

/** 在裁剪预览里拖拽图片内容时，按当前适配方式同步更新裁剪窗口。 */
const handleCropPreviewPointerMove = (event: PointerEvent) => {
  if (!dragStartPointer.value || !dragStartCrop.value) {
    return;
  }

  const deltaX = event.clientX - dragStartPointer.value.x;
  const deltaY = event.clientY - dragStartPointer.value.y;
  const cropWidth = dragStartCrop.value.width;
  const cropHeight = dragStartCrop.value.height;
  draftCrop.value = normalizeDraftCrop({
    ...dragStartCrop.value,
    x: dragStartCrop.value.x - (deltaX / PREVIEW_FRAME_WIDTH) * cropWidth,
    y: dragStartCrop.value.y - (deltaY / PREVIEW_FRAME_HEIGHT) * cropHeight,
  });
};

/** 结束裁剪预览拖拽。 */
const handleCropPreviewPointerUp = () => {
  dragStartPointer.value = null;
  dragStartCrop.value = null;
  window.removeEventListener("pointermove", handleCropPreviewPointerMove);
};

/** 把当前草稿恢复为整图。 */
const handleCropReset = () => {
  draftCrop.value = { ...DEFAULT_IMAGE_CROP };
};

/** 处理弹窗右下角确认按钮。 */
const handleConfirm = () => {
  emit("confirm", { ...draftCrop.value });
};

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      syncDraftCrop();
      return;
    }

    handleCropPreviewPointerUp();
  },
);
</script>

<template>
  <a-modal
    :visible="props.visible"
    :confirm-loading="props.confirmLoading"
    :mask-closable="false"
    class="image-crop-modal"
    :title="props.title"
    width="720px"
    :ok-text="props.okText"
    cancel-text="取消"
    @cancel="emit('cancel')"
    @ok="handleConfirm"
  >
    <div class="image-crop-modal__body">
      <section class="image-crop-modal__intro">
        <div class="image-crop-modal__copy">
          <p class="image-crop-modal__headline">{{ props.sourceLabel }}</p>
          <p class="image-crop-modal__description">在这里先裁剪，再写入画布。拖拽预览中的图片可以调整显示区域。</p>
        </div>
        <a-button
          v-if="props.allowReset"
          class="image-crop-modal__reset"
          type="text"
          @click="handleCropReset"
        >
          重置为整图
        </a-button>
      </section>

      <div class="image-crop-modal__content">
        <section class="image-crop-modal__preview">
          <div
            class="image-crop-preview"
            @pointerdown="handleCropPreviewPointerDown"
          >
            <div class="image-crop-preview__frame">
              <div class="image-crop-preview__image" :style="previewImageStyle" />
            </div>
          </div>
        </section>

        <section class="image-crop-modal__fields">
          <div class="field-grid">
            <div class="field">
              <span class="field-label">裁剪 X</span>
              <a-input-number
                class="field-input"
                min="0"
                max="1"
                :step="0.01"
                :model-value="draftCrop.x"
                @change="handleCropNumberChange('x', $event)"
              />
            </div>

            <div class="field">
              <span class="field-label">裁剪 Y</span>
              <a-input-number
                class="field-input"
                min="0"
                max="1"
                :step="0.01"
                :model-value="draftCrop.y"
                @change="handleCropNumberChange('y', $event)"
              />
            </div>

            <div class="field">
              <span class="field-label">裁剪宽度</span>
              <a-input-number
                class="field-input"
                min="0.05"
                max="1"
                :step="0.01"
                :model-value="draftCrop.width"
                @change="handleCropNumberChange('width', $event)"
              />
            </div>

            <div class="field">
              <span class="field-label">裁剪高度</span>
              <a-input-number
                class="field-input"
                min="0.05"
                max="1"
                :step="0.01"
                :model-value="draftCrop.height"
                @change="handleCropNumberChange('height', $event)"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.image-crop-modal__body {
  display: grid;
  gap: 16px;
}

.image-crop-modal__intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.image-crop-modal__copy {
  display: grid;
  gap: 4px;
}

.image-crop-modal__headline,
.image-crop-modal__description {
  margin: 0;
}

.image-crop-modal__headline {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--cw-color-text);
}

.image-crop-modal__description {
  font-size: 12px;
  line-height: 1.55;
  color: var(--cw-color-muted);
}

.image-crop-modal__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 280px);
  gap: 18px;
}

.image-crop-modal__preview,
.image-crop-modal__fields {
  min-width: 0;
}

.image-crop-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  padding: 18px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.92), rgba(241, 245, 249, 0.9)),
    repeating-linear-gradient(
      45deg,
      rgba(148, 163, 184, 0.08),
      rgba(148, 163, 184, 0.08) 10px,
      rgba(255, 255, 255, 0.08) 10px,
      rgba(255, 255, 255, 0.08) 20px
    );
  cursor: grab;
  user-select: none;
}

.image-crop-preview:active {
  cursor: grabbing;
}

.image-crop-preview__frame {
  position: relative;
  overflow: hidden;
  width: 320px;
  height: 214px;
  border: 1px solid rgba(22, 93, 255, 0.18);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.75),
    0 16px 36px rgba(15, 23, 42, 0.08);
}

.image-crop-preview__image {
  position: absolute;
  transform-origin: center center;
}

.image-crop-modal__fields {
  display: grid;
  align-content: start;
  gap: 12px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--cw-color-text);
}

.field-input {
  width: 100%;
}

@media (max-width: 760px) {
  .image-crop-modal__intro,
  .image-crop-modal__content,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .image-crop-modal__intro {
    flex-direction: column;
  }

  .image-crop-preview__frame {
    width: min(100%, 320px);
  }
}
</style>
