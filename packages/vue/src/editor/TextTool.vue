<script setup lang="ts">
import type { NodePatch, TextNode } from "@canvas-courseware/core";
import { computed, type CSSProperties } from "vue";

/** 文本工具条预置色板。 */
const DEFAULT_TEXT_TOOL_SWATCHES = [
  { label: "深墨", value: "#172033" },
  { label: "青绿", value: "#0D9488" },
  { label: "亮蓝", value: "#165DFF" },
  { label: "橙色", value: "#EA580C" },
  { label: "红色", value: "#DC2626" },
] as const;

/** 文本工具条组件的输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前正在编辑的文本节点。 */
    node?: TextNode | null;
    /** 当前浮层的绝对定位样式。 */
    overlayStyle?: CSSProperties;
  }>(),
  {
    node: null,
    overlayStyle: () => ({}),
  },
);

/** 文本工具条向外抛出的标准更新事件。 */
const emit = defineEmits<{
  /** 更新当前文本节点的标准补丁。 */
  "update-node": [nodeId: string, patch: NodePatch];
}>();

/** 当前文本是否已处于加粗状态。 */
const isBold = computed(() => {
  if (!props.node) {
    return false;
  }

  const fontWeight = props.node.props.fontWeight ?? 400;
  return fontWeight === "bold" || Number(fontWeight) >= 600;
});

/** 当前文本是否已处于斜体状态。 */
const isItalic = computed(() => props.node?.props.fontStyle === "italic");

/** 当前字号展示文案。 */
const fontSizeLabel = computed(() => `${props.node?.props.fontSize ?? 0}`);

/** 将当前颜色插入到色板首位，保证自定义色也能就地回显。 */
const colorSwatches = computed(() => {
  const currentColor = props.node?.props.color;
  if (!currentColor) {
    return DEFAULT_TEXT_TOOL_SWATCHES;
  }

  const hasCurrentColor = DEFAULT_TEXT_TOOL_SWATCHES.some((swatch) => swatch.value === currentColor);
  return hasCurrentColor
    ? DEFAULT_TEXT_TOOL_SWATCHES
    : [{ label: "当前", value: currentColor }, ...DEFAULT_TEXT_TOOL_SWATCHES];
});

/** 统一发出当前文本节点更新。 */
const updateNode = (patch: NodePatch) => {
  if (!props.node) {
    return;
  }

  emit("update-node", props.node.id, patch);
};

/** 以固定步长调整字号，满足高频微调场景。 */
const adjustFontSize = (delta: number) => {
  if (!props.node) {
    return;
  }

  updateNode({
    props: {
      fontSize: Math.max(props.node.props.fontSize + delta, 10),
    },
  });
};

/** 直接应用一种文本颜色。 */
const applyTextColor = (color: string) => {
  updateNode({
    props: {
      color,
    },
  });
};

/** 切换文本加粗状态。 */
const toggleBold = () => {
  updateNode({
    props: {
      fontWeight: isBold.value ? 400 : 700,
    },
  });
};

/** 切换文本斜体状态。 */
const toggleItalic = () => {
  updateNode({
    props: {
      fontStyle: isItalic.value ? "normal" : "italic",
    },
  });
};
</script>

<template>
  <div v-if="node" class="text-tool" :style="overlayStyle" @mousedown.prevent>
    <div class="text-tool__section text-tool__section-size">
      <a-button
        class="text-tool__icon-button"
        type="outline"
        aria-label="减小字号"
        @click="adjustFontSize(-2)"
      >
        A-
      </a-button>
      <span class="text-tool__size-label">{{ fontSizeLabel }}</span>
      <a-button
        class="text-tool__icon-button"
        type="outline"
        aria-label="增大字号"
        @click="adjustFontSize(2)"
      >
        A+
      </a-button>
    </div>

    <div class="text-tool__divider" />

    <div class="text-tool__section text-tool__section-style">
      <a-button
        class="text-tool__toggle"
        :class="{ 'is-active': isBold }"
        type="outline"
        aria-label="切换加粗"
        @click="toggleBold"
      >
        B
      </a-button>
      <a-button
        class="text-tool__toggle text-tool__toggle-italic"
        :class="{ 'is-active': isItalic }"
        type="outline"
        aria-label="切换斜体"
        @click="toggleItalic"
      >
        I
      </a-button>
    </div>

    <div class="text-tool__divider" />

    <div class="text-tool__section text-tool__section-color">
      <button
        v-for="swatch in colorSwatches"
        :key="swatch.value"
        class="text-tool__swatch"
        :class="{ 'is-active': swatch.value === node.props.color }"
        :aria-label="`设置文字颜色为${swatch.label}`"
        :style="{ '--cw-text-tool-swatch': swatch.value }"
        type="button"
        @click="applyTextColor(swatch.value)"
      />
    </div>
  </div>
</template>

<style scoped>
.text-tool {
  position: absolute;
  z-index: 7;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(191, 205, 224, 0.92);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 18px 38px rgba(15, 23, 42, 0.14),
    0 6px 12px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
  transform: translate(-50%, -100%);
}

.text-tool__section {
  display: inline-flex;
  align-items: center;
}

.text-tool__section-size,
.text-tool__section-style {
  gap: 8px;
}

.text-tool__section-color {
  gap: 6px;
}

.text-tool__divider {
  width: 1px;
  align-self: stretch;
  background: color-mix(in srgb, var(--cw-color-border) 88%, #ffffff);
}

.text-tool__icon-button,
.text-tool__toggle {
  min-width: 40px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
}

.text-tool__toggle-italic {
  font-style: italic;
}

.text-tool__toggle.is-active {
  color: var(--cw-color-primary);
  border-color: rgba(22, 93, 255, 0.28);
  background: rgba(22, 93, 255, 0.08);
}

.text-tool__size-label {
  min-width: 34px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--cw-color-text);
}

.text-tool__swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  cursor: pointer;
  background: var(--cw-text-tool-swatch);
  box-shadow:
    0 0 0 1px rgba(148, 163, 184, 0.34),
    0 4px 10px rgba(15, 23, 42, 0.12);
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard);
}

.text-tool__swatch:hover {
  transform: translateY(-1px);
  box-shadow:
    0 0 0 1px rgba(22, 93, 255, 0.24),
    0 8px 16px rgba(15, 23, 42, 0.14);
}

.text-tool__swatch.is-active {
  box-shadow:
    0 0 0 2px rgba(22, 93, 255, 0.3),
    0 10px 18px rgba(22, 93, 255, 0.18);
}
</style>
