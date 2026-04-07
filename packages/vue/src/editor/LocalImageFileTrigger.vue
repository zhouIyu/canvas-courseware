<script setup lang="ts">
import { computed, ref } from "vue";

/** 文件触发按钮支持的视觉变体。 */
type LocalImageFileTriggerVariant = "toolbar" | "panel";

/** 文件选择触发器的显示参数。 */
const props = withDefaults(
  defineProps<{
    /** 按钮文案。 */
    label?: string;
    /** 无障碍标签。 */
    ariaLabel?: string;
    /** 视觉变体。 */
    variant?: LocalImageFileTriggerVariant;
    /** 是否禁用当前按钮。 */
    disabled?: boolean;
    /** 文件选择器接受的 MIME 范围。 */
    accept?: string;
  }>(),
  {
    label: "导入图片",
    ariaLabel: undefined,
    variant: "panel",
    disabled: false,
    accept: "image/*",
  },
);

/** 文件选择触发器向外抛出的事件。 */
const emit = defineEmits<{
  /** 用户完成文件选择后抛出第一个文件。 */
  select: [file: File];
}>();

/** 隐藏文件输入框的引用。 */
const fileInputRef = ref<HTMLInputElement | null>(null);

/** 当前按钮的辅助类名。 */
const buttonClassName = computed(() => ({
  "file-trigger-button": true,
  "is-toolbar": props.variant === "toolbar",
  "is-panel": props.variant === "panel",
}));

/** 主动打开系统文件选择器。 */
const openFilePicker = () => {
  if (props.disabled) {
    return;
  }

  if (fileInputRef.value) {
    fileInputRef.value.value = "";
    fileInputRef.value.click();
  }
};

/** 读取用户刚刚选择的图片文件，并向外层派发。 */
const handleFileChange = (event: Event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const file = target.files?.[0];
  if (!file) {
    return;
  }

  emit("select", file);
};
</script>

<template>
  <span class="local-image-file-trigger">
    <a-button
      :aria-label="ariaLabel ?? label"
      :class="buttonClassName"
      :disabled="disabled"
      type="text"
      @click="openFilePicker"
    >
      {{ label }}
    </a-button>
    <input
      ref="fileInputRef"
      class="file-input"
      :accept="accept"
      hidden
      type="file"
      @change="handleFileChange"
    />
  </span>
</template>

<style scoped>
.local-image-file-trigger {
  display: inline-flex;
}

.file-trigger-button {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
}

.file-trigger-button.is-toolbar {
  color: var(--cw-color-primary);
}

.file-trigger-button.is-toolbar:hover {
  color: #0f6bff;
  background: rgba(22, 93, 255, 0.08);
}

.file-trigger-button.is-panel {
  color: var(--cw-color-primary);
  background: rgba(22, 93, 255, 0.06);
}

.file-trigger-button.is-panel:hover {
  color: #0f6bff;
  background: rgba(22, 93, 255, 0.12);
}

.file-input {
  display: none;
}
</style>
