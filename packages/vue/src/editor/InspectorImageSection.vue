<script setup lang="ts">
import {
  type ImageNode,
  type NodePatch,
  type ObjectFit,
} from "@canvas-courseware/core";
import { computed } from "vue";
import LocalImageFileTrigger from "./LocalImageFileTrigger.vue";
import { resolveImageResourceDescriptor, resolveImageSourceSyncPatch } from "./image-file";

/** 图片适配方式选项。 */
const objectFitOptions: ReadonlyArray<{ label: string; value: ObjectFit }> = [
  { label: "填满", value: "fill" },
  { label: "完整显示", value: "contain" },
  { label: "裁切铺满", value: "cover" },
] as const;

/** 图片属性分组的输入参数。 */
const props = defineProps<{
  /** 当前选中的图片节点。 */
  node: ImageNode;
}>();

/** 图片属性分组向外派发的编辑意图。 */
const emit = defineEmits<{
  /** 继续走外层属性面板统一的标准节点更新链路。 */
  "update-node": [nodeId: string, patch: NodePatch];
  /** 用本地文件替换当前图片。 */
  "replace-image": [nodeId: string, file: File];
  /** 重新打开当前图片的裁剪弹窗。 */
  "recrop-image": [nodeId: string];
}>();

/** 当前图片来源提示。 */
const imageSourceHint = computed(() => {
  const source = props.node.props.src.trim();
  if (!source) {
    return "当前还是空图片框，点击“更换图片”可直接选择本地图片。";
  }

  return source.startsWith("data:")
    ? "当前使用本地图片，保存后会随项目一起恢复。"
    : "当前使用图片地址，也可以直接更换为本地图片。";
});

/** 当前图片资源的展示标签。 */
const imageResourceLabel = computed(() =>
  resolveImageResourceDescriptor(props.node.props.src, props.node.props.alt).label,
);

/** 读取文本输入框字符串值。 */
const readTextInputValue = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  const target = value instanceof Event ? value.target : null;
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
    ? target.value
    : fallback;
};

/** 读取勾选框布尔值。 */
const readCheckedValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  const target = value instanceof Event ? value.target : null;
  return target instanceof HTMLInputElement ? target.checked : fallback;
};

/** 统一发出图片节点更新。 */
const updateNode = (patch: NodePatch) => {
  emit("update-node", props.node.id, patch);
};

/** 读取旧资源可复用的文件名，仅在 data URL 场景下回退到 alt 字段。 */
const resolvePreviousImageFileName = () =>
  props.node.props.src.trim().startsWith("data:") ? props.node.props.alt ?? null : null;

/** 更新图片地址。 */
const handleImageSourceInput = (value: string | number | undefined) => {
  const nextSource = readTextInputValue(value, props.node.props.src);
  if (nextSource.trim().length === 0) {
    updateNode({
      props: {
        src: nextSource,
      },
    });
    return;
  }

  const syncPatch = resolveImageSourceSyncPatch({
    currentName: props.node.name,
    currentAlt: props.node.props.alt,
    previousSource: props.node.props.src,
    previousFileName: resolvePreviousImageFileName(),
    nextSource,
  });

  updateNode({
    ...(syncPatch.name ? { name: syncPatch.name } : {}),
    props: {
      src: nextSource,
      ...(syncPatch.alt ? { alt: syncPatch.alt } : {}),
    },
  });
};

/** 更新图片替代文本。 */
const handleImageAltInput = (value: string | number | undefined) => {
  updateNode({
    props: {
      alt: readTextInputValue(value, props.node.props.alt ?? ""),
    },
  });
};

/** 更新图片适配方式。 */
const handleImageObjectFitChange = (value: string | number | boolean | undefined) => {
  updateNode({
    props: {
      objectFit: readTextInputValue(value, props.node.props.objectFit ?? "cover") as ObjectFit,
    },
  });
};

/** 切换水平/垂直翻转。 */
const handleImageFlipToggle = (field: "flipX" | "flipY", value: boolean | string | number) => {
  updateNode({
    props: {
      [field]: readCheckedValue(value, props.node.props[field] ?? false),
    },
  });
};

/** 从属性面板直接替换当前图片节点资源。 */
const handleImageFileSelect = (file: File) => {
  emit("replace-image", props.node.id, file);
};

/** 从属性面板重新打开当前图片的裁剪弹窗。 */
const handleRecropImage = () => {
  emit("recrop-image", props.node.id);
};
</script>

<template>
  <div class="group-card">
    <div class="group-head">
      <h4>图片属性</h4>
      <span class="group-badge">Image</span>
    </div>

    <div class="field-grid">
      <div class="field field-span-2">
        <span class="field-label">图片资源</span>
        <div class="image-source-row">
          <LocalImageFileTrigger
            aria-label="更换当前图片"
            label="更换图片"
            variant="panel"
            @select="handleImageFileSelect"
          />
          <a-button
            aria-label="重新裁剪当前图片"
            type="text"
            @click="handleRecropImage"
          >
            重新裁剪
          </a-button>
          <span class="image-source-hint">{{ imageSourceHint }}</span>
        </div>
      </div>

      <div class="field field-span-2">
        <span class="field-label">图片地址</span>
        <a-input class="field-input" :model-value="node.props.src" @input="handleImageSourceInput" />
      </div>

      <div class="field field-span-2">
        <span class="field-label">替代文本</span>
        <a-input
          class="field-input"
          :model-value="node.props.alt ?? ''"
          @input="handleImageAltInput"
        />
      </div>

      <div class="field field-span-2">
        <span class="field-label">适配方式</span>
        <a-select
          class="field-input"
          :model-value="node.props.objectFit ?? 'cover'"
          popup-container="body"
          @change="handleImageObjectFitChange"
        >
          <a-option
            v-for="option in objectFitOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </a-option>
        </a-select>
      </div>
    </div>

    <div class="toggle-grid">
      <div class="toggle-field">
        <span class="field-label">水平翻转</span>
        <a-switch
          class="field-toggle"
          :model-value="node.props.flipX ?? false"
          @change="handleImageFlipToggle('flipX', $event)"
        />
      </div>

      <div class="toggle-field">
        <span class="field-label">垂直翻转</span>
        <a-switch
          class="field-toggle"
          :model-value="node.props.flipY ?? false"
          @change="handleImageFlipToggle('flipY', $event)"
        />
      </div>
    </div>

    <div class="image-crop-note">
      <span class="image-crop-note__label">当前裁剪资源</span>
      <span class="group-badge warning">{{ imageResourceLabel }}</span>
      <p class="group-footnote">裁剪已迁移到选图弹窗中，后续更换图片或点击“重新裁剪”都会先进入裁剪流程。</p>
    </div>
  </div>
</template>
