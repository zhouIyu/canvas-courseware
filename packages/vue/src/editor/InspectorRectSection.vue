<script setup lang="ts">
import {
  createDefaultRectGradientFill,
  createRectCornerRadii,
  resolveRectUniformRadius,
  type NodePatch,
  type RectCornerRadii,
  type RectGradientFill,
  type RectNode,
  type RectShadow,
} from "@canvas-courseware/core";
import { computed, ref, watch } from "vue";

/** 填充方式选项。 */
const rectFillTypeOptions: ReadonlyArray<{
  label: string;
  value: NonNullable<RectNode["props"]["fillType"]>;
}> = [
  { label: "纯色", value: "solid" },
  { label: "线性渐变", value: "linear-gradient" },
];

/** 矩形属性分组输入。 */
const props = defineProps<{
  /** 当前选中的矩形节点。 */
  node: RectNode;
}>();

/** 矩形属性分组输出。 */
const emit = defineEmits<{
  /** 继续走外层属性面板的统一节点更新链路。 */
  "update-node": [nodeId: string, patch: NodePatch];
}>();

/** 当前矩形的标准化填充方式。 */
const resolvedFillType = computed(() => props.node.props.fillType ?? "solid");

/** 当前矩形的标准化渐变配置。 */
const resolvedGradient = computed(() =>
  props.node.props.gradient
    ? {
        ...props.node.props.gradient,
      }
    : createDefaultRectGradientFill(),
);

/** 当前矩形是否已启用阴影。 */
const hasRectShadow = computed(() => Boolean(props.node.props.shadow));

/** 当前矩形的标准化阴影配置。 */
const resolvedShadow = computed<RectShadow>(() =>
  props.node.props.shadow ?? {
    color: "rgba(59, 91, 219, 0.22)",
    offsetX: 0,
    offsetY: 10,
    blur: 24,
  },
);

/** 当前矩形使用的四角圆角配置。 */
const resolvedCornerRadii = computed<RectCornerRadii>(() =>
  props.node.props.cornerRadii
    ? {
        ...props.node.props.cornerRadii,
      }
    : createRectCornerRadii(resolveRectUniformRadius(props.node.props)),
);

/** 当前是否使用统一圆角。 */
const isUniformRadius = computed(() => {
  if (isIndependentCornerMode.value) {
    return false;
  }

  const { topLeft, topRight, bottomRight, bottomLeft } = resolvedCornerRadii.value;
  return topLeft === topRight && topLeft === bottomRight && topLeft === bottomLeft;
});

/** 当前是否展开四角独立编辑模式。 */
const isIndependentCornerMode = ref(false);

watch(
  () => props.node.id,
  () => {
    const { topLeft, topRight, bottomRight, bottomLeft } = resolvedCornerRadii.value;
    isIndependentCornerMode.value = !(
      topLeft === topRight &&
      topLeft === bottomRight &&
      topLeft === bottomLeft
    );
  },
  {
    immediate: true,
  },
);

/** 读取文本输入值。 */
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

/** 读取数字输入值。 */
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

/** 读取布尔开关值。 */
const readCheckedValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  const target = value instanceof Event ? value.target : null;
  return target instanceof HTMLInputElement ? target.checked : fallback;
};

/** 统一发出矩形节点更新。 */
const updateNode = (patch: NodePatch) => {
  emit("update-node", props.node.id, patch);
};

/** 更新矩形填充方式。 */
const handleFillTypeChange = (value: string | number | boolean | undefined) => {
  const nextFillType = readTextInputValue(value, resolvedFillType.value) as NonNullable<
    RectNode["props"]["fillType"]
  >;

  updateNode({
    props: {
      fillType: nextFillType,
    },
  });
};

/** 更新矩形纯色填充。 */
const handleFillColorChange = (value: string | undefined) => {
  updateNode({
    props: {
      fill: readTextInputValue(value, props.node.props.fill),
    },
  });
};

/** 更新矩形渐变字段。 */
const handleGradientChange = (
  field: keyof RectGradientFill,
  value: string | number | undefined,
) => {
  const nextGradient = {
    ...resolvedGradient.value,
    [field]:
      field === "angle"
        ? readNumberInputValue(value, resolvedGradient.value.angle)
        : readTextInputValue(value, resolvedGradient.value[field as "from" | "to"]),
  };

  updateNode({
    props: {
      gradient: nextGradient,
    },
  });
};

/** 更新描边颜色。 */
const handleStrokeColorChange = (value: string | undefined) => {
  updateNode({
    props: {
      stroke: readTextInputValue(value, props.node.props.stroke ?? "#4B7BE5"),
    },
  });
};

/** 更新描边宽度。 */
const handleStrokeWidthChange = (value: number | string | undefined) => {
  updateNode({
    props: {
      strokeWidth: readNumberInputValue(value, props.node.props.strokeWidth ?? 0, 0),
    },
  });
};

/** 统一写回圆角配置。 */
const updateCornerRadii = (cornerRadii: RectCornerRadii) => {
  updateNode({
    props: {
      radius: cornerRadii.topLeft,
      cornerRadii,
    },
  });
};

/** 更新统一圆角。 */
const handleUniformRadiusChange = (value: number | string | undefined) => {
  isIndependentCornerMode.value = false;
  const nextRadius = readNumberInputValue(
    value,
    resolveRectUniformRadius(props.node.props),
    0,
    100,
  );
  updateCornerRadii(createRectCornerRadii(nextRadius));
};

/** 更新单个圆角。 */
const handleCornerRadiusChange = (
  corner: keyof RectCornerRadii,
  value: number | string | undefined,
) => {
  isIndependentCornerMode.value = true;
  const nextCornerRadii = {
    ...resolvedCornerRadii.value,
    [corner]: readNumberInputValue(value, resolvedCornerRadii.value[corner], 0, 100),
  };

  updateCornerRadii(nextCornerRadii);
};

/** 切换统一圆角/独立圆角模式。 */
const handleUniformRadiusToggle = (value: boolean | string | number) => {
  const nextIsUniform = readCheckedValue(value, isUniformRadius.value);
  if (nextIsUniform) {
    isIndependentCornerMode.value = false;
    updateCornerRadii(createRectCornerRadii(resolveRectUniformRadius(props.node.props)));
    return;
  }

  isIndependentCornerMode.value = true;
  updateCornerRadii({
    ...resolvedCornerRadii.value,
  });
};

/** 开关矩形阴影。 */
const handleShadowToggle = (value: boolean | string | number) => {
  const nextHasShadow = readCheckedValue(value, hasRectShadow.value);
  updateNode({
    props: {
      shadow: nextHasShadow
        ? {
            ...resolvedShadow.value,
          }
        : undefined,
    },
  });
};

/** 更新矩形阴影字段。 */
const handleShadowChange = (
  field: keyof RectShadow,
  value: string | number | undefined,
) => {
  const nextShadow = {
    ...resolvedShadow.value,
    [field]:
      field === "color"
        ? readTextInputValue(value, resolvedShadow.value.color)
        : readNumberInputValue(value, resolvedShadow.value[field as "offsetX" | "offsetY" | "blur"]),
  };

  updateNode({
    props: {
      shadow: nextShadow,
    },
  });
};
</script>

<template>
  <div class="group-card">
    <div class="group-head">
      <h4>矩形属性</h4>
      <span class="group-badge">Rect</span>
    </div>

    <div class="field-grid">
      <div class="field field-span-2">
        <span class="field-label">填充方式</span>
        <a-select
          class="field-input"
          :model-value="resolvedFillType"
          popup-container="body"
          @change="handleFillTypeChange"
        >
          <a-option
            v-for="option in rectFillTypeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </a-option>
        </a-select>
      </div>

      <div v-if="resolvedFillType === 'solid'" class="field field-span-2">
        <span class="field-label">填充色</span>
        <a-color-picker
          class="field-input color-input"
          :model-value="node.props.fill"
          show-text
          @change="handleFillColorChange"
        />
      </div>

      <template v-else>
        <div class="field">
          <span class="field-label">渐变起点</span>
          <a-color-picker
            class="field-input color-input"
            :model-value="resolvedGradient.from"
            show-text
            @change="handleGradientChange('from', $event)"
          />
        </div>

        <div class="field">
          <span class="field-label">渐变终点</span>
          <a-color-picker
            class="field-input color-input"
            :model-value="resolvedGradient.to"
            show-text
            @change="handleGradientChange('to', $event)"
          />
        </div>

        <div class="field field-span-2">
          <span class="field-label">渐变角度</span>
          <a-input-number
            class="field-input"
            :model-value="resolvedGradient.angle"
            @change="handleGradientChange('angle', $event)"
          />
        </div>
      </template>

      <div class="field">
        <span class="field-label">描边色</span>
        <a-color-picker
          class="field-input color-input"
          :model-value="node.props.stroke ?? '#4B7BE5'"
          show-text
          @change="handleStrokeColorChange"
        />
      </div>

      <div class="field">
        <span class="field-label">描边宽度</span>
        <a-input-number
          class="field-input"
          min="0"
          :model-value="node.props.strokeWidth ?? 0"
          @change="handleStrokeWidthChange"
        />
      </div>
    </div>

    <div class="toggle-grid">
      <div class="toggle-field">
        <span class="field-label">统一圆角</span>
        <a-switch
          class="field-toggle"
          :model-value="isUniformRadius"
          @change="handleUniformRadiusToggle"
        />
      </div>

      <div class="toggle-field">
        <span class="field-label">启用阴影</span>
        <a-switch
          class="field-toggle"
          :model-value="hasRectShadow"
          @change="handleShadowToggle"
        />
      </div>
    </div>

    <div class="field-grid">
      <div v-if="isUniformRadius" class="field field-span-2">
        <span class="field-label">圆角</span>
        <a-input-number
          class="field-input"
          min="0"
          max="100"
          :model-value="resolveRectUniformRadius(node.props)"
          @change="handleUniformRadiusChange"
        />
      </div>

      <template v-else>
        <div class="field">
          <span class="field-label">左上角</span>
          <a-input-number
            class="field-input"
            min="0"
            max="100"
            :model-value="resolvedCornerRadii.topLeft"
            @change="handleCornerRadiusChange('topLeft', $event)"
          />
        </div>

        <div class="field">
          <span class="field-label">右上角</span>
          <a-input-number
            class="field-input"
            min="0"
            max="100"
            :model-value="resolvedCornerRadii.topRight"
            @change="handleCornerRadiusChange('topRight', $event)"
          />
        </div>

        <div class="field">
          <span class="field-label">右下角</span>
          <a-input-number
            class="field-input"
            min="0"
            max="100"
            :model-value="resolvedCornerRadii.bottomRight"
            @change="handleCornerRadiusChange('bottomRight', $event)"
          />
        </div>

        <div class="field">
          <span class="field-label">左下角</span>
          <a-input-number
            class="field-input"
            min="0"
            max="100"
            :model-value="resolvedCornerRadii.bottomLeft"
            @change="handleCornerRadiusChange('bottomLeft', $event)"
          />
        </div>
      </template>
    </div>

    <div v-if="hasRectShadow" class="field-grid">
      <div class="field field-span-2">
        <span class="field-label">阴影颜色</span>
        <a-color-picker
          class="field-input color-input"
          :model-value="resolvedShadow.color"
          show-text
          @change="handleShadowChange('color', $event)"
        />
      </div>

      <div class="field">
        <span class="field-label">偏移 X</span>
        <a-input-number
          class="field-input"
          :model-value="resolvedShadow.offsetX"
          @change="handleShadowChange('offsetX', $event)"
        />
      </div>

      <div class="field">
        <span class="field-label">偏移 Y</span>
        <a-input-number
          class="field-input"
          :model-value="resolvedShadow.offsetY"
          @change="handleShadowChange('offsetY', $event)"
        />
      </div>

      <div class="field field-span-2">
        <span class="field-label">模糊半径</span>
        <a-input-number
          class="field-input"
          min="0"
          :model-value="resolvedShadow.blur"
          @change="handleShadowChange('blur', $event)"
        />
      </div>
    </div>

    <p class="group-footnote">
      当前矩形支持纯色/线性渐变填充、统一或独立圆角，以及基础阴影控制。
    </p>
  </div>
</template>
