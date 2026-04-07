<script setup lang="ts">
import type { Slide } from "@canvas-courseware/core";
import { computed, ref } from "vue";
import { createSlideBackgroundStyle } from "../shared";
import LocalImageFileTrigger from "./LocalImageFileTrigger.vue";
import { readLocalImageAsset } from "./image-file";

/** 页面背景图填充方式的可选项。 */
const backgroundImageFitOptions = [
  {
    value: "cover",
    label: "裁切铺满",
  },
  {
    value: "contain",
    label: "完整显示",
  },
  {
    value: "fill",
    label: "拉伸铺满",
  },
] as const;

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

/** 读取背景图填充方式，并在异常值出现时兜底到当前配置。 */
const readBackgroundImageFit = (
  value: unknown,
  fallback: NonNullable<Slide["background"]["image"]>["fit"],
): NonNullable<Slide["background"]["image"]>["fit"] =>
  backgroundImageFitOptions.some((option) => option.value === value)
    ? (value as NonNullable<Slide["background"]["image"]>["fit"])
    : fallback;

/** 统一发出页面更新事件。 */
const updateSlide = (patch: Partial<Pick<Slide, "name" | "size" | "background">>) => {
  emit("update-slide", patch);
};

/** 当前页面的背景图配置。 */
const slideBackgroundImage = computed(() => props.slide?.background.image ?? null);

/** 当前页面是否已经配置背景图。 */
const hasBackgroundImage = computed(() => Boolean(slideBackgroundImage.value?.src.trim()));

/** 当前页面背景预览样式。 */
const backgroundPreviewStyle = computed<Record<string, string>>(() =>
  props.slide ? createSlideBackgroundStyle(props.slide.background) : {},
);

/** 当前背景图来源描述，帮助用户判断是否为本地导入。 */
const backgroundImageSourceLabel = computed(() => {
  const source = slideBackgroundImage.value?.src ?? "";

  if (!source) {
    return "尚未配置背景图";
  }

  return source.startsWith("data:")
    ? "已导入本地图片，保存后会随项目一起恢复"
    : "当前使用图片地址，请确保资源可访问";
});

/** 当前背景图操作的错误提示。 */
const backgroundImageError = ref("");

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

/** 更新页面背景图地址，为空时直接视为清空背景图。 */
const handleSlideBackgroundImageSourceInput = (value: string | number | undefined) => {
  if (!props.slide) {
    return;
  }

  backgroundImageError.value = "";
  const nextSource = readTextInputValue(value, slideBackgroundImage.value?.src ?? "").trim();

  updateSlide({
    background: {
      ...props.slide.background,
      image: nextSource
        ? {
            src: nextSource,
            fit: slideBackgroundImage.value?.fit ?? "cover",
          }
        : null,
    },
  });
};

/** 切换背景图填充方式。 */
const handleSlideBackgroundImageFitChange = (value: string | number | boolean | undefined) => {
  if (!props.slide || !slideBackgroundImage.value) {
    return;
  }

  backgroundImageError.value = "";
  updateSlide({
    background: {
      ...props.slide.background,
      image: {
        ...slideBackgroundImage.value,
        fit: readBackgroundImageFit(value, slideBackgroundImage.value.fit),
      },
    },
  });
};

/** 把本地图片读成 data URL，并直接写入当前 slide 的背景图。 */
const handleSlideBackgroundImageFileSelect = async (file: File) => {
  if (!props.slide) {
    return;
  }

  try {
    const asset = await readLocalImageAsset(file);
    backgroundImageError.value = "";

    updateSlide({
      background: {
        ...props.slide.background,
        image: {
          src: asset.dataUrl,
          fit: slideBackgroundImage.value?.fit ?? "cover",
        },
      },
    });
  } catch (error) {
    backgroundImageError.value = error instanceof Error ? error.message : "背景图导入失败，请重试";
  }
};

/** 清空当前页面的背景图，仅保留纯色底。 */
const clearSlideBackgroundImage = () => {
  if (!props.slide || !slideBackgroundImage.value) {
    return;
  }

  backgroundImageError.value = "";
  updateSlide({
    background: {
      ...props.slide.background,
      image: null,
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
        <div class="field field-span-2">
          <span class="field-label">页面名称</span>
          <a-input class="field-input" :model-value="slide.name" @input="handleSlideNameInput" />
        </div>

        <div class="field">
          <span class="field-label">宽度</span>
          <a-input-number
            class="field-input"
            min="320"
            :model-value="slide.size.width"
            @change="handleSlideWidthChange"
          />
        </div>

        <div class="field">
          <span class="field-label">高度</span>
          <a-input-number
            class="field-input"
            min="180"
            :model-value="slide.size.height"
            @change="handleSlideHeightChange"
          />
        </div>

        <div class="field field-span-2">
          <span class="field-label">背景色</span>
          <a-color-picker
            class="field-input color-input"
            :model-value="slide.background.fill"
            show-text
            @change="handleSlideBackgroundChange"
          />
        </div>

        <div class="field field-span-2">
          <div class="field-label-row">
            <span class="field-label">背景图地址</span>
            <span class="field-note">{{ hasBackgroundImage ? "已配置" : "未配置" }}</span>
          </div>
          <a-input
            class="field-input"
            :model-value="slide.background.image?.src ?? ''"
            placeholder="粘贴图片地址，或使用下方按钮导入本地图片"
            @input="handleSlideBackgroundImageSourceInput"
          />
        </div>

        <div class="field">
          <span class="field-label">填充方式</span>
          <a-select
            class="field-input"
            :disabled="!hasBackgroundImage"
            :model-value="slide.background.image?.fit ?? 'cover'"
            popup-container="body"
            @change="handleSlideBackgroundImageFitChange"
          >
            <a-option
              v-for="option in backgroundImageFitOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </a-option>
          </a-select>
        </div>

        <div class="field">
          <span class="field-label">背景图操作</span>
          <div class="background-actions">
            <LocalImageFileTrigger
              label="导入本地图片"
              variant="panel"
              @select="handleSlideBackgroundImageFileSelect"
            />
            <a-button
              size="small"
              type="text"
              :disabled="!hasBackgroundImage"
              @click="clearSlideBackgroundImage"
            >
              清空背景图
            </a-button>
          </div>
          <p v-if="backgroundImageError" class="field-error">{{ backgroundImageError }}</p>
        </div>

        <div class="field field-span-2">
          <span class="field-label">背景预览</span>
          <div class="background-preview-card">
            <div class="background-preview" :style="backgroundPreviewStyle">
              <span class="preview-chip">{{ hasBackgroundImage ? "背景图已启用" : "仅使用纯色背景" }}</span>
            </div>
            <p class="field-help">{{ backgroundImageSourceLabel }}</p>
          </div>
        </div>
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

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-3);
}

.field-note,
.field-help {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.field-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-danger);
}

.field-input {
  width: 100%;
}

.field-input:deep(.arco-input-wrapper),
.field-input:deep(.arco-input-number),
.field-input:deep(.arco-color-picker-trigger),
.field-input:deep(.arco-select-view) {
  width: 100%;
  min-height: 44px;
}

.background-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-3);
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.8);
}

.background-preview-card {
  display: grid;
  gap: var(--cw-space-3);
}

.background-preview {
  display: flex;
  align-items: flex-end;
  min-height: 140px;
  padding: 14px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: 18px;
  background-color: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.42);
}

.preview-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(8px);
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
