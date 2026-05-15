<script setup lang="ts">
import {
  resolveImageFrameLayout,
  type ImageCrop,
  type ImageLayoutSize,
  type ImageNode,
  type NodePatch,
  type ObjectFit,
} from "@canvas-courseware/core";
import { computed, ref, watch } from "vue";
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

/** 当前可回显的裁剪窗口。 */
const resolvedCrop = computed<ImageCrop>(() => props.node.props.crop ?? {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
});

/** 图片裁剪预览中的拖拽态起点。 */
const dragStartPointer = ref<{ x: number; y: number } | null>(null);

/** 图片裁剪预览中的拖拽起始裁剪窗口。 */
const dragStartCrop = ref<ImageCrop | null>(null);

/** 当前图片资源读取到的自然尺寸。 */
const imageNaturalSize = ref<ImageLayoutSize>({
  width: 1,
  height: 1,
});

/** 当前图片资源的展示标签。 */
const imageResourceLabel = computed(() =>
  resolveImageResourceDescriptor(props.node.props.src, props.node.props.alt).label,
);

/** 当前裁剪窗口对应的预览布局。 */
const previewLayout = computed(() =>
  resolveImageFrameLayout({
    frameWidth: 220,
    frameHeight: 148,
    sourceSize: imageNaturalSize.value,
    objectFit: props.node.props.objectFit ?? "cover",
    crop: resolvedCrop.value,
  }),
);

/** 图片裁剪预览图层样式。 */
const previewImageStyle = computed(() => ({
  width: `${previewLayout.value.drawWidth}px`,
  height: `${previewLayout.value.drawHeight}px`,
  left: `${previewLayout.value.offsetX}px`,
  top: `${previewLayout.value.offsetY}px`,
  transform: `${props.node.props.flipX ? "scaleX(-1) " : ""}${props.node.props.flipY ? "scaleY(-1)" : ""}`.trim() || "none",
  backgroundImage: props.node.props.src.trim() ? `url("${props.node.props.src}")` : "none",
  backgroundSize: "100% 100%",
  backgroundRepeat: "no-repeat",
}));

/** 当图片来源变化时，重新读取原始尺寸，保证裁剪预览和真实渲染保持同一比例基础。 */
watch(
  () => props.node.props.src,
  (source) => {
    const normalizedSource = source.trim();
    if (!normalizedSource) {
      imageNaturalSize.value = {
        width: 1,
        height: 1,
      };
      return;
    }

    const image = new Image();
    image.onload = () => {
      imageNaturalSize.value = {
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      };
    };
    image.onerror = () => {
      imageNaturalSize.value = {
        width: 1,
        height: 1,
      };
    };
    image.src = normalizedSource;
  },
  { immediate: true },
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

/** 更新裁剪窗口数值字段。 */
const handleCropNumberChange = (
  field: keyof ImageCrop,
  value: number | string | undefined,
) => {
  const fallbackCrop = resolvedCrop.value;
  const minimum = field === "width" || field === "height" ? 0.05 : 0;
  const maximum =
    field === "x"
      ? Math.max(1 - fallbackCrop.width, 0)
      : field === "y"
        ? Math.max(1 - fallbackCrop.height, 0)
        : field === "width"
          ? Math.max(1 - fallbackCrop.x, 0.05)
          : Math.max(1 - fallbackCrop.y, 0.05);

  const nextValue = Math.round(readNumberInputValue(value, fallbackCrop[field], minimum, maximum) * 1000) / 1000;
  const nextCrop = {
    ...fallbackCrop,
    [field]: nextValue,
  };

  updateNode({
    props: {
      crop: normalizeCrop(nextCrop),
    },
  });
};

/** 从属性面板直接替换当前图片节点资源。 */
const handleImageFileSelect = (file: File) => {
  emit("replace-image", props.node.id, file);
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
  dragStartCrop.value = { ...resolvedCrop.value };
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
  const nextCrop = normalizeCrop({
    ...dragStartCrop.value,
    x: dragStartCrop.value.x - deltaX / 220 * cropWidth,
    y: dragStartCrop.value.y - deltaY / 148 * cropHeight,
  });

  updateNode({
    props: {
      crop: nextCrop,
    },
  });
};

/** 结束裁剪预览拖拽。 */
const handleCropPreviewPointerUp = () => {
  dragStartPointer.value = null;
  dragStartCrop.value = null;
  window.removeEventListener("pointermove", handleCropPreviewPointerMove);
};

/** 把裁剪窗口约束回合法范围。 */
function normalizeCrop(crop: ImageCrop): ImageCrop {
  const x = clamp(crop.x, 0, 1);
  const y = clamp(crop.y, 0, 1);
  const width = clamp(crop.width, 0.05, 1 - x);
  const height = clamp(crop.height, 0.05, 1 - y);

  return {
    x,
    y,
    width,
    height,
  };
}

/** 统一做边界收敛。 */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
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

    <div class="group-card image-crop-card">
      <div class="group-head">
        <h4>基础裁剪</h4>
        <span class="group-badge warning">{{ imageResourceLabel }}</span>
      </div>

      <p class="group-footnote">直接拖拽预览中的图片内容，可以调整当前显示区域。</p>

      <div
        class="image-crop-preview"
        @pointerdown="handleCropPreviewPointerDown"
      >
        <div class="image-crop-preview__frame">
          <div class="image-crop-preview__image" :style="previewImageStyle" />
        </div>
      </div>

      <div class="field-grid">
        <div class="field">
          <span class="field-label">裁剪 X</span>
          <a-input-number
            class="field-input"
            min="0"
            max="1"
            :step="0.01"
            :model-value="resolvedCrop.x"
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
            :model-value="resolvedCrop.y"
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
            :model-value="resolvedCrop.width"
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
            :model-value="resolvedCrop.height"
            @change="handleCropNumberChange('height', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
