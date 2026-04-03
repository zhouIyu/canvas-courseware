<script setup lang="ts">
import type { Slide } from "@canvas-courseware/core";

/** 页面设置面板的输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前激活的 slide。 */
    slide?: Slide | null;
  }>(),
  {
    slide: null,
  },
);

/** 页面设置面板向外派发的编辑意图。 */
const emit = defineEmits<{
  /** 更新当前页面的基础信息。 */
  "update-slide": [patch: Partial<Pick<Slide, "name" | "size" | "background">>];
}>();

/** 读取文本输入框的字符串值。 */
const readTextInputValue = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  const target = value instanceof Event ? value.target : null;
  return target instanceof HTMLInputElement ? target.value : fallback;
};

/**
 * 读取数字输入框的值，并在非法输入时回退到当前值。
 * 宽高会额外做最小值保护，避免页面尺寸被改成不可渲染的值。
 */
const readNumberInputValue = (value: unknown, fallback: number, minimum: number): number => {
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : value instanceof Event && value.target instanceof HTMLInputElement
        ? Number(value.target.value)
        : Number.NaN;

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(parsed, minimum);
};

/** 统一发出页面更新事件。 */
const updateSlide = (patch: Partial<Pick<Slide, "name" | "size" | "background">>) => {
  emit("update-slide", patch);
};

/** 更新页面名称。 */
const handleSlideNameInput = (value: string | number | undefined) => {
  if (!props.slide) {
    return;
  }

  updateSlide({
    name: readTextInputValue(value, props.slide.name),
  });
};

/** 更新页面宽度。 */
const handleSlideWidthChange = (value: number | string | undefined) => {
  if (!props.slide) {
    return;
  }

  updateSlide({
    size: {
      ...props.slide.size,
      width: readNumberInputValue(value, props.slide.size.width, 320),
    },
  });
};

/** 更新页面高度。 */
const handleSlideHeightChange = (value: number | string | undefined) => {
  if (!props.slide) {
    return;
  }

  updateSlide({
    size: {
      ...props.slide.size,
      height: readNumberInputValue(value, props.slide.size.height, 180),
    },
  });
};

/** 更新页面背景色。 */
const handleSlideBackgroundChange = (value: string | undefined) => {
  if (!props.slide) {
    return;
  }

  updateSlide({
    background: {
      ...props.slide.background,
      fill: readTextInputValue(value, props.slide.background.fill),
    },
  });
};
</script>

<template>
  <section class="slide-settings-panel">
    <div v-if="slide" class="group-card">
      <div class="group-head">
        <h4>基础信息</h4>
        <span class="group-badge">当前页</span>
      </div>

      <div class="field-grid">
        <label class="field field-span-2">
          <span class="field-label">页面名称</span>
          <a-input class="field-input" :model-value="slide.name" @input="handleSlideNameInput" />
        </label>

        <label class="field">
          <span class="field-label">宽度</span>
          <a-input-number
            class="field-input"
            min="320"
            :model-value="slide.size.width"
            @change="handleSlideWidthChange"
          />
        </label>

        <label class="field">
          <span class="field-label">高度</span>
          <a-input-number
            class="field-input"
            min="180"
            :model-value="slide.size.height"
            @change="handleSlideHeightChange"
          />
        </label>

        <label class="field field-span-2">
          <span class="field-label">背景色</span>
          <a-color-picker
            class="field-input color-input"
            :model-value="slide.background.fill"
            show-text
            @change="handleSlideBackgroundChange"
          />
        </label>
      </div>
    </div>

    <div v-else class="group-card empty-card">
      <div class="group-head">
        <h4>未选择页面</h4>
        <span class="group-badge">待选择</span>
      </div>
      <p class="group-copy">先切换到一个页面，这里才会显示它的名称、尺寸和背景配置。</p>
    </div>
  </section>
</template>

<style scoped>
.slide-settings-panel {
  display: grid;
  gap: var(--cw-space-4);
  padding: var(--cw-space-5);
  border: 1px solid var(--cw-color-border);
  border-radius: var(--cw-radius-lg);
  background:
    linear-gradient(180deg, rgba(22, 93, 255, 0.05), rgba(255, 255, 255, 0.96)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-weak);
}

.group-badge {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.group-card {
  display: grid;
  gap: var(--cw-space-4);
  padding: 18px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-md);
  background: rgba(255, 255, 255, 0.9);
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-3);
}

.group-head h4 {
  margin: 0;
  font-size: 17px;
  line-height: 1.4;
}

.group-copy {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-3);
}

.field {
  display: grid;
  gap: var(--cw-space-2);
}

.field-span-2 {
  grid-column: span 2;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--cw-color-text);
}

.field-input {
  width: 100%;
}

.field-input:deep(.arco-input-wrapper),
.field-input:deep(.arco-input-number),
.field-input:deep(.arco-color-picker-trigger) {
  width: 100%;
  min-height: 44px;
}

.empty-card {
  background: rgba(240, 253, 250, 0.74);
}

@media (max-width: 640px) {
  .field-grid {
    grid-template-columns: 1fr;
  }

  .field-span-2 {
    grid-column: span 1;
  }
}
</style>
