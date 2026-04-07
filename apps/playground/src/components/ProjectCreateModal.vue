<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  DEFAULT_PROJECT_SIZE_PRESET_ID,
  DEFAULT_PROJECT_TITLE,
  PROJECT_SIZE_PRESETS,
  formatProjectCanvasSize,
  normalizeProjectSlideSize,
  resolveProjectSizePreset,
  type ProjectCreateOptions,
} from "../projects/project-creation";

/** 新建项目弹窗的入参。 */
const props = withDefaults(
  defineProps<{
    /** 当前弹窗是否显示。 */
    visible?: boolean;
    /** 当前是否正在提交创建请求。 */
    confirmLoading?: boolean;
  }>(),
  {
    visible: false,
    confirmLoading: false,
  },
);

/** 新建项目弹窗向外派发的事件。 */
const emit = defineEmits<{
  /** 关闭弹窗。 */
  cancel: [];
  /** 提交新建项目参数。 */
  confirm: [options: ProjectCreateOptions];
}>();

/** 当前草稿中的项目标题。 */
const draftTitle = ref(DEFAULT_PROJECT_TITLE);

/** 当前选中的尺寸预设。 */
const selectedPresetId = ref(DEFAULT_PROJECT_SIZE_PRESET_ID);

/** 当前草稿中的页面宽度。 */
const draftWidth = ref(resolveProjectSizePreset(DEFAULT_PROJECT_SIZE_PRESET_ID).width);

/** 当前草稿中的页面高度。 */
const draftHeight = ref(resolveProjectSizePreset(DEFAULT_PROJECT_SIZE_PRESET_ID).height);

/** 当前是否处于自定义尺寸模式。 */
const isCustomSize = computed(() => selectedPresetId.value === "custom");

/** 当前选中的尺寸预设详情。 */
const selectedPreset = computed(() => resolveProjectSizePreset(selectedPresetId.value));

/** 当前草稿的页面尺寸摘要。 */
const slideSizeSummary = computed(() =>
  formatProjectCanvasSize({
    width: draftWidth.value,
    height: draftHeight.value,
  }),
);

/** 当前弹窗顶部显示的预设说明。 */
const presetHint = computed(() =>
  isCustomSize.value
    ? "手动输入页面宽高，创建后仍可在页面设置中继续调整。"
    : selectedPreset.value.description,
);

/** 重置弹窗草稿，保证每次打开都从统一默认态开始。 */
const resetDraft = () => {
  const defaultPreset = resolveProjectSizePreset(DEFAULT_PROJECT_SIZE_PRESET_ID);

  draftTitle.value = DEFAULT_PROJECT_TITLE;
  selectedPresetId.value = defaultPreset.id;
  draftWidth.value = defaultPreset.width;
  draftHeight.value = defaultPreset.height;
};

/** 把指定预设写回到当前草稿中。 */
const applyPreset = (presetId: string) => {
  const preset = resolveProjectSizePreset(presetId);

  selectedPresetId.value = preset.id;
  if (preset.id === "custom") {
    return;
  }

  draftWidth.value = preset.width;
  draftHeight.value = preset.height;
};

/** 统一写回自定义尺寸，并自动切换到自定义模式。 */
const updateCustomSlideSize = (patch: Partial<{ width: number; height: number }>) => {
  const normalizedSlideSize = normalizeProjectSlideSize({
    width: patch.width ?? draftWidth.value,
    height: patch.height ?? draftHeight.value,
  });

  selectedPresetId.value = "custom";
  draftWidth.value = normalizedSlideSize.width;
  draftHeight.value = normalizedSlideSize.height;
};

/** 读取数字输入框回传值。 */
const readNumberInputValue = (value: number | string | undefined, fallback: number): number => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

/** 切换尺寸预设。 */
const handlePresetSelect = (presetId: string) => {
  applyPreset(presetId);
};

/** 更新草稿中的页面宽度。 */
const handleWidthChange = (value: number | string | undefined) => {
  updateCustomSlideSize({
    width: readNumberInputValue(value, draftWidth.value),
  });
};

/** 更新草稿中的页面高度。 */
const handleHeightChange = (value: number | string | undefined) => {
  updateCustomSlideSize({
    height: readNumberInputValue(value, draftHeight.value),
  });
};

/** 提交当前草稿。 */
const handleConfirm = () => {
  emit("confirm", {
    title: draftTitle.value,
    slideSize: {
      width: draftWidth.value,
      height: draftHeight.value,
    },
  });
};

/** 监听弹窗显隐，在打开时恢复默认草稿。 */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      return;
    }

    resetDraft();
  },
);
</script>

<template>
  <a-modal
    :visible="visible"
    :confirm-loading="confirmLoading"
    :mask-closable="false"
    class="project-create-modal"
    title="新建项目"
    ok-text="创建并进入工作台"
    cancel-text="取消"
    @cancel="emit('cancel')"
    @ok="handleConfirm"
  >
    <div class="create-modal-body">
      <section class="create-summary">
        <div class="summary-copy">
          <span class="summary-label">创建参数</span>
          <h3>{{ draftTitle.trim() || DEFAULT_PROJECT_TITLE }}</h3>
          <p>{{ slideSizeSummary }} · {{ isCustomSize ? "自定义画布" : selectedPreset.ratioLabel }}</p>
        </div>
        <a-tag color="arcoblue" bordered>{{ slideSizeSummary }}</a-tag>
      </section>

      <section class="form-section">
        <label class="field-label" for="project-title-input">项目名称</label>
        <a-input
          id="project-title-input"
          v-model="draftTitle"
          allow-clear
          placeholder="输入项目名称"
        />
      </section>

      <section class="form-section">
        <div class="field-header">
          <span class="field-label">页面尺寸</span>
          <span class="field-hint">{{ presetHint }}</span>
        </div>

        <div class="preset-grid">
          <button
            v-for="preset in PROJECT_SIZE_PRESETS"
            :key="preset.id"
            type="button"
            class="preset-card"
            :class="{ 'preset-card--active': selectedPresetId === preset.id }"
            @click="handlePresetSelect(preset.id)"
          >
            <span class="preset-card__label">{{ preset.label }}</span>
            <strong>{{ preset.ratioLabel }}</strong>
            <span>{{ formatProjectCanvasSize(preset) }}</span>
          </button>
        </div>

        <div class="custom-size-grid" :class="{ 'custom-size-grid--visible': isCustomSize }">
          <label class="size-field">
            <span>宽度</span>
            <a-input-number
              :min="320"
              :model-value="draftWidth"
              hide-button
              mode="button"
              @change="handleWidthChange"
            />
          </label>

          <label class="size-field">
            <span>高度</span>
            <a-input-number
              :min="180"
              :model-value="draftHeight"
              hide-button
              mode="button"
              @change="handleHeightChange"
            />
          </label>
        </div>
      </section>
    </div>
  </a-modal>
</template>

<style scoped>
.create-modal-body {
  display: grid;
  gap: var(--cw-space-5);
}

.create-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cw-space-4);
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--cw-color-border) 68%, #ffffff);
  border-radius: var(--cw-radius-lg);
  background:
    linear-gradient(135deg, rgba(235, 245, 255, 0.94), rgba(255, 255, 255, 0.98)),
    var(--cw-color-surface);
}

.summary-copy {
  display: grid;
  gap: 6px;
}

.summary-label,
.field-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--cw-color-muted);
  text-transform: uppercase;
}

.summary-copy h3 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  color: var(--cw-color-text);
}

.summary-copy p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.form-section {
  display: grid;
  gap: var(--cw-space-3);
}

.field-header {
  display: grid;
  gap: 6px;
}

.field-hint {
  font-size: 13px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-3);
}

.preset-card {
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 16px;
  border: 1px solid rgba(22, 93, 255, 0.12);
  border-radius: var(--cw-radius-md);
  background: rgba(255, 255, 255, 0.92);
  color: var(--cw-color-text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease,
    background-color 0.18s ease;
}

.preset-card strong {
  font-size: 18px;
  line-height: 1.2;
}

.preset-card span:last-child,
.preset-card__label {
  font-size: 13px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.preset-card:hover {
  transform: translateY(-1px);
  border-color: rgba(22, 93, 255, 0.24);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
}

.preset-card--active {
  border-color: rgba(22, 93, 255, 0.44);
  background: rgba(22, 93, 255, 0.08);
  box-shadow: 0 16px 34px rgba(22, 93, 255, 0.12);
}

.preset-card--active strong,
.preset-card--active .preset-card__label,
.preset-card--active span:last-child {
  color: #1145d9;
}

.custom-size-grid {
  display: none;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-3);
}

.custom-size-grid--visible {
  display: grid;
}

.size-field {
  display: grid;
  gap: var(--cw-space-2);
  font-size: 13px;
  color: var(--cw-color-muted);
}

@media (max-width: 680px) {
  .create-summary,
  .preset-grid,
  .custom-size-grid {
    grid-template-columns: 1fr;
  }

  .create-summary {
    flex-direction: column;
  }
}
</style>
