<script setup lang="ts">
import type { Slide } from "@canvas-courseware/core";
import { computed, ref } from "vue";
import {
  BACKGROUND_IMAGE_FIT_OPTIONS,
  createSlideBackgroundStyle,
  normalizeBackgroundImageFit,
} from "../shared";
import LocalImageFileTrigger from "./LocalImageFileTrigger.vue";
import { readLocalImageAsset } from "./image-file";
import type { SlideSettingsFeedbackTone } from "./useSlideSettingsDrawer";

/** 页面设置面板的输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前激活的 slide。 */
    slide?: Slide | null;
    /** 当前激活页的 1-based 页序。 */
    slideIndex?: number | null;
    /** 当前文档的页面总数。 */
    slideCount?: number;
    /** 抽屉顶部需要展示的反馈提示。 */
    feedbackMessage?: string | null;
    /** 抽屉顶部反馈提示的语气。 */
    feedbackTone?: SlideSettingsFeedbackTone;
  }>(),
  {
    slide: null,
    slideIndex: null,
    slideCount: 0,
    feedbackMessage: null,
    feedbackTone: "info",
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
const readNumberInputValue = (
  value: unknown,
  fallback: number,
  minimum: number,
): number => {
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
  normalizeBackgroundImageFit(value, fallback);

/** 统一发出页面更新事件。 */
const updateSlide = (
  patch: Partial<Pick<Slide, "name" | "size" | "background">>,
) => {
  emit("update-slide", patch);
};

/** 当前页面的背景图配置。 */
const slideBackgroundImage = computed(() => props.slide?.background.image ?? null);

/** 当前页面是否已经配置背景图。 */
const hasBackgroundImage = computed(() =>
  Boolean(slideBackgroundImage.value?.src.trim()),
);

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

/** 当前页摘要中展示的页序文案。 */
const currentSlideIndexLabel = computed(() =>
  props.slideIndex ? `第 ${props.slideIndex} 页` : "未选择页面",
);

/** 当前页摘要中展示的总页数文案。 */
const currentSlideCountLabel = computed(() =>
  props.slideCount > 0 ? `共 ${props.slideCount} 页` : "",
);

/** 当前页摘要中的作用范围说明。 */
const currentSlideScopeCopy = computed(() => {
  if (!props.slide) {
    return "先切换到一个页面，这里才会显示它的名称、尺寸和背景配置。";
  }

  return "只影响当前页，组件属性仍在右侧面板编辑。";
});

/** 当前页摘要中展示的背景状态文案。 */
const backgroundStatusLabel = computed(() =>
  hasBackgroundImage.value ? "已配置背景图" : "纯色背景",
);

/** 当前页摘要中展示的背景图填充方式文案。 */
const backgroundFitLabel = computed(() => {
  if (!slideBackgroundImage.value) {
    return "未启用";
  }

  const currentOption = BACKGROUND_IMAGE_FIT_OPTIONS.find(
    (option) => option.value === slideBackgroundImage.value?.fit,
  );
  return currentOption?.label ?? "未启用";
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
const handleSlideBackgroundImageSourceInput = (
  value: string | number | undefined,
) => {
  if (!props.slide) {
    return;
  }

  backgroundImageError.value = "";
  const nextSource = readTextInputValue(
    value,
    slideBackgroundImage.value?.src ?? "",
  ).trim();

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
const handleSlideBackgroundImageFitChange = (
  value: string | number | boolean | undefined,
) => {
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
    backgroundImageError.value =
      error instanceof Error ? error.message : "背景图导入失败，请重试";
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
    <template v-if="slide">
      <div class="slide-settings-summary">
        <p class="summary-meta-text">
          {{ currentSlideIndexLabel }}
          <template v-if="currentSlideCountLabel"> · {{ currentSlideCountLabel }}</template>
          · {{ currentSlideScopeCopy }}
        </p>
      </div>

      <a-alert
        v-if="feedbackMessage"
        :type="feedbackTone"
        class="slide-settings-feedback"
        show-icon
      >
        {{ feedbackMessage }}
      </a-alert>

      <div class="slide-settings-groups">
        <section class="group-card">
          <div class="group-head">
            <h4>基础信息</h4>
          </div>

          <div class="field-grid">
            <div class="field field-span-2">
              <span class="field-label">页面名称</span>
              <a-input
                class="field-input"
                :model-value="slide.name"
                @input="handleSlideNameInput"
              />
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
          </div>
        </section>

        <section class="group-card">
          <div class="group-head">
            <h4>背景配置</h4>
            <span class="field-note">{{ backgroundStatusLabel }}</span>
          </div>

          <div class="field-grid">
            <div class="field field-span-2">
              <span class="field-label">背景色</span>
              <a-color-picker
                class="field-input color-input"
                :model-value="slide.background.fill"
                show-text
                @change="handleSlideBackgroundChange"
              />
            </div>

            <div v-if="hasBackgroundImage" class="field">
              <span class="field-label">填充方式</span>
              <a-select
                class="field-input"
                :model-value="slide.background.image?.fit ?? 'cover'"
                popup-container="body"
                @change="handleSlideBackgroundImageFitChange"
              >
                <a-option
                  v-for="option in BACKGROUND_IMAGE_FIT_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </a-option>
              </a-select>
            </div>

            <div class="field field-span-2">
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
              <div class="field-label-row">
                <span class="field-label">背景图地址</span>
                <span class="field-note">{{ hasBackgroundImage ? "已配置" : "未配置" }}</span>
              </div>
              <a-input
                class="field-input"
                :model-value="slide.background.image?.src ?? ''"
                placeholder="粘贴图片地址，或使用上方按钮导入本地图片"
                @input="handleSlideBackgroundImageSourceInput"
              />
              <p class="field-help">{{ backgroundImageSourceLabel }}</p>
            </div>

            <div class="field field-span-2">
              <div class="field-label-row">
                <span class="field-label">背景预览</span>
                <span class="field-note">{{ backgroundFitLabel }}</span>
              </div>
              <div class="background-preview-card">
                <div class="background-preview" :style="backgroundPreviewStyle">
                  <span class="preview-chip">
                    {{ hasBackgroundImage ? "背景图已启用" : "仅使用纯色背景" }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>

    <div v-else class="group-card empty-card">
      <div class="group-head">
        <h4>未选择页面</h4>
        <span class="summary-chip summary-chip--subtle">待选择</span>
      </div>
      <p class="group-copy">{{ currentSlideScopeCopy }}</p>
    </div>
  </section>
</template>
<style scoped src="./SlideSettingsPanel.css"></style>
