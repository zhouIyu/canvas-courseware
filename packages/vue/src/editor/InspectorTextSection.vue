<script setup lang="ts">
import {
  DEFAULT_TEXT_FONT_FAMILY,
  TEXT_FONT_FAMILY_PRESETS,
  type NodePatch,
  type TextAlign,
  type TextNode,
} from "@canvas-courseware/core";
import { computed } from "vue";

/** 文本对齐选项。 */
const textAlignOptions: ReadonlyArray<{ label: string; value: TextAlign }> = [
  { label: "左对齐", value: "left" },
  { label: "居中", value: "center" },
  { label: "右对齐", value: "right" },
  { label: "两端对齐", value: "justify" },
];

/** 文本属性分组的输入参数。 */
const props = defineProps<{
  /** 当前选中的文本节点。 */
  node: TextNode;
}>();

/** 文本属性分组向外派发的节点更新事件。 */
const emit = defineEmits<{
  /** 继续走外层属性面板统一的标准节点更新链路。 */
  "update-node": [nodeId: string, patch: NodePatch];
}>();

/** 当前文本节点是否处于加粗状态。 */
const isTextBold = computed(() => {
  const fontWeight = props.node.props.fontWeight ?? 400;
  return fontWeight === "bold" || Number(fontWeight) >= 600;
});

/** 当前文本节点是否处于斜体状态。 */
const isTextItalic = computed(() => props.node.props.fontStyle === "italic");

/** 当前文本节点实际使用的字体族。 */
const resolvedFontFamily = computed(() => props.node.props.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY);

/** 当前文本节点实际使用的行高。 */
const resolvedLineHeight = computed(() =>
  Math.round((props.node.props.lineHeight ?? 1.5) * 10) / 10,
);

/** 将当前字体动态注入选项列表，保证历史项目里的自定义字体也能就地回显。 */
const fontFamilyOptions = computed(() => {
  const currentFontFamily = resolvedFontFamily.value;
  const hasCurrentFontFamily = TEXT_FONT_FAMILY_PRESETS.some(
    (preset) => preset.value === currentFontFamily,
  );

  return hasCurrentFontFamily
    ? TEXT_FONT_FAMILY_PRESETS
    : [{ label: "当前字体", value: currentFontFamily }, ...TEXT_FONT_FAMILY_PRESETS];
});

/** 读取文本输入框的字符串值。 */
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

/** 读取数字输入框的值，并在解析失败时回退到当前值。 */
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

/** 统一发出文本节点更新。 */
const updateNode = (patch: NodePatch) => {
  emit("update-node", props.node.id, patch);
};

/** 更新文本内容。 */
const handleTextContentInput = (value: string | number | undefined) => {
  updateNode({
    props: {
      text: readTextInputValue(value, props.node.props.text),
    },
  });
};

/** 更新文本字号。 */
const handleTextFontSizeChange = (value: number | string | undefined) => {
  updateNode({
    props: {
      fontSize: readNumberInputValue(value, props.node.props.fontSize, 10),
    },
  });
};

/** 更新文本颜色。 */
const handleTextColorChange = (value: string | undefined) => {
  updateNode({
    props: {
      color: readTextInputValue(value, props.node.props.color),
    },
  });
};

/** 更新文本字体。 */
const handleTextFontFamilyChange = (value: string | number | boolean | undefined) => {
  updateNode({
    props: {
      fontFamily: readTextInputValue(value, resolvedFontFamily.value) || DEFAULT_TEXT_FONT_FAMILY,
    },
  });
};

/** 更新文本行高，并限制在当前版本约定的 1.0 - 3.0 区间内。 */
const handleTextLineHeightChange = (value: number | string | undefined) => {
  const nextLineHeight = readNumberInputValue(value, resolvedLineHeight.value, 1, 3);

  updateNode({
    props: {
      lineHeight: Math.round(nextLineHeight * 10) / 10,
    },
  });
};

/** 更新文本对齐方式。 */
const handleTextAlignChange = (value: string | number | boolean | undefined) => {
  updateNode({
    props: {
      textAlign: readTextInputValue(value, props.node.props.textAlign ?? "left") as TextAlign,
    },
  });
};

/** 切换文本粗细，供属性面板与浮动工具条共用同一套文档字段。 */
const handleTextBoldToggle = () => {
  updateNode({
    props: {
      fontWeight: isTextBold.value ? 400 : 700,
    },
  });
};

/** 切换文本斜体状态。 */
const handleTextItalicToggle = () => {
  updateNode({
    props: {
      fontStyle: isTextItalic.value ? "normal" : "italic",
    },
  });
};
</script>

<template>
  <div class="group-card">
    <div class="group-head">
      <h4>文本属性</h4>
      <span class="group-badge">Text</span>
    </div>

    <div class="field-grid">
      <div class="field field-span-2">
        <span class="field-label">内容</span>
        <a-textarea
          class="field-input field-textarea"
          :model-value="node.props.text"
          @input="handleTextContentInput"
        />
      </div>

      <div class="field field-span-2">
        <span class="field-label">字体</span>
        <a-select
          class="field-input"
          :model-value="resolvedFontFamily"
          popup-container="body"
          @change="handleTextFontFamilyChange"
        >
          <a-option
            v-for="option in fontFamilyOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </a-option>
        </a-select>
      </div>

      <div class="field">
        <span class="field-label">字号</span>
        <a-input-number
          class="field-input"
          min="10"
          :model-value="node.props.fontSize"
          @change="handleTextFontSizeChange"
        />
      </div>

      <div class="field">
        <span class="field-label">颜色</span>
        <a-color-picker
          class="field-input color-input"
          :model-value="node.props.color"
          show-text
          @change="handleTextColorChange"
        />
      </div>

      <div class="field">
        <span class="field-label">行高</span>
        <a-input-number
          class="field-input"
          min="1"
          max="3"
          :step="0.1"
          :model-value="resolvedLineHeight"
          @change="handleTextLineHeightChange"
        />
      </div>

      <div class="field">
        <span class="field-label">对齐方式</span>
        <a-select
          class="field-input"
          :model-value="node.props.textAlign ?? 'left'"
          popup-container="body"
          @change="handleTextAlignChange"
        >
          <a-option
            v-for="option in textAlignOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </a-option>
        </a-select>
      </div>

      <div class="field field-span-2">
        <span class="field-label">字形样式</span>
        <div class="text-style-toggle-row">
          <a-button
            class="text-style-toggle"
            :class="{ 'is-active': isTextBold }"
            type="outline"
            @click="handleTextBoldToggle"
          >
            加粗
          </a-button>
          <a-button
            class="text-style-toggle"
            :class="{ 'is-active': isTextItalic }"
            type="outline"
            @click="handleTextItalicToggle"
          >
            斜体
          </a-button>
        </div>
      </div>
    </div>

    <p class="group-footnote">
      字体会优先使用当前设备已安装的字体；若目标字体缺失，会按预设回退族自动降级渲染。
    </p>
  </div>
</template>
