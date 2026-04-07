<script setup lang="ts">
import {
  createNodeAnimation,
  type CoursewareNode,
  type NodeAnimation,
  type NodePatch,
  type NodeTimelineSummary,
} from "@canvas-courseware/core";
import { computed, ref } from "vue";
import {
  formatAnimationKindLabel,
  formatEasingLabel,
  formatNodeInitialVisibilityLabel,
  formatNodeTypeLabel,
  formatOpacityValue,
  formatStepIndexLabel,
  formatTriggerLabel,
} from "../shared";

/** 属性面板需要的只读状态输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前首个选中的节点。 */
    selectedNode?: CoursewareNode | null;
    /** 当前选中的节点数量。 */
    selectedCount?: number;
    /** 当前选中节点关联的动画资源。 */
    selectedAnimations?: NodeAnimation[];
    /** 当前选中节点的步骤归属摘要。 */
    timelineSummary?: NodeTimelineSummary | null;
  }>(),
  {
    selectedNode: null,
    selectedCount: 0,
    selectedAnimations: () => [],
    timelineSummary: null,
  },
);

/** 属性面板向外派发的编辑意图。 */
const emit = defineEmits<{
  /** 更新当前选中节点。 */
  "update-node": [nodeId: string, patch: NodePatch];
  /** 新增或更新当前节点关联的动画资源。 */
  "upsert-animation": [animation: NodeAnimation];
  /** 删除当前节点关联的动画资源。 */
  "remove-animation": [animationId: string];
}>();

/** 文字对齐选项。 */
const textAlignOptions = [
  { label: "左对齐", value: "left" },
  { label: "居中", value: "center" },
  { label: "右对齐", value: "right" },
] as const;

/** 图片填充方式选项。 */
const objectFitOptions = [
  { label: "填满", value: "fill" },
  { label: "完整显示", value: "contain" },
  { label: "裁切铺满", value: "cover" },
] as const;

/** 动画类型选项。 */
const animationKindOptions = [
  { label: formatAnimationKindLabel("appear"), value: "appear" },
  { label: formatAnimationKindLabel("fade"), value: "fade" },
  { label: formatAnimationKindLabel("slide-up"), value: "slide-up" },
] as const;

/** 缓动函数选项。 */
const easingOptions = [
  { label: formatEasingLabel("linear"), value: "linear" },
  { label: formatEasingLabel("ease-in"), value: "ease-in" },
  { label: formatEasingLabel("ease-out"), value: "ease-out" },
  { label: formatEasingLabel("ease-in-out"), value: "ease-in-out" },
] as const;

/** 当前是否正处于单选编辑状态。 */
const hasSingleSelection = computed(
  () => props.selectedCount === 1 && Boolean(props.selectedNode),
);

/** 当前是否是多选状态。 */
const hasMultipleSelection = computed(() => props.selectedCount > 1);

/** 当前节点的透明度百分比。 */
const nodeOpacityPercent = computed(() =>
  props.selectedNode ? Math.round(props.selectedNode.opacity * 100) : 100,
);

/** 当前节点是否已经加入了至少一个步骤。 */
const hasTimelineSummary = computed(() => (props.timelineSummary?.stepReferences.length ?? 0) > 0);

/** 当前节点是否存在一个可展示的首个关联步骤。 */
const hasFirstTimelineStep = computed(
  () =>
    props.timelineSummary?.firstStepIndex !== null &&
    props.timelineSummary?.firstStepIndex !== undefined,
);

/** 当前选中节点是否已经配置动画。 */
const hasSelectedAnimations = computed(() => props.selectedAnimations.length > 0);

/** 当前已展开高级参数的动画 id 列表。 */
const expandedAnimationIds = ref<string[]>([]);

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

/** 读取勾选框的布尔值。 */
const readCheckedValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  const target = value instanceof Event ? value.target : null;
  return target instanceof HTMLInputElement ? target.checked : fallback;
};

/**
 * 读取数字输入框的值，并在解析失败时回退到当前值。
 * 对于宽高、字号等字段，还会执行最小值保护，避免非法负数。
 */
const readNumberInputValue = (
  value: unknown,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
) => {
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

  return Math.max(parsed, minimum);
};

/** 统一发出节点更新事件。 */
const updateNode = (patch: NodePatch) => {
  if (!props.selectedNode) {
    return;
  }

  emit("update-node", props.selectedNode.id, patch);
};

/** 更新节点名称。 */
const handleNodeNameInput = (value: string | number | undefined) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    name: readTextInputValue(value, props.selectedNode.name),
  });
};

/** 更新节点基础数值属性。 */
const handleNodeBaseNumberChange = (
  field: "x" | "y" | "width" | "height" | "rotation",
  value: number | string | undefined,
) => {
  if (!props.selectedNode) {
    return;
  }

  const minimum = field === "width" || field === "height" ? 1 : Number.NEGATIVE_INFINITY;
  updateNode({
    [field]: readNumberInputValue(value, props.selectedNode[field], minimum),
  });
};

/** 更新节点透明度。 */
const handleNodeOpacityChange = (value: number | string | undefined) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    opacity: readNumberInputValue(value, nodeOpacityPercent.value, 0) / 100,
  });
};

/** 更新节点的布尔状态。 */
const handleNodeToggle = (
  field: "visible" | "locked",
  value: string | number | boolean,
) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    [field]: readCheckedValue(value, props.selectedNode[field]),
  });
};

/** 更新文本内容。 */
const handleTextContentInput = (value: string | number | undefined) => {
  if (props.selectedNode?.type !== "text") {
    return;
  }

  updateNode({
    props: {
      text: readTextInputValue(value, props.selectedNode.props.text),
    },
  });
};

/** 更新文本字号。 */
const handleTextFontSizeChange = (value: number | string | undefined) => {
  if (props.selectedNode?.type !== "text") {
    return;
  }

  updateNode({
    props: {
      fontSize: readNumberInputValue(value, props.selectedNode.props.fontSize, 10),
    },
  });
};

/** 更新文本颜色。 */
const handleTextColorChange = (value: string | undefined) => {
  if (props.selectedNode?.type !== "text") {
    return;
  }

  updateNode({
    props: {
      color: readTextInputValue(value, props.selectedNode.props.color),
    },
  });
};

/** 更新文本对齐方式。 */
const handleTextAlignChange = (value: string | number | boolean | undefined) => {
  if (props.selectedNode?.type !== "text") {
    return;
  }

  updateNode({
    props: {
      textAlign: readTextInputValue(value, props.selectedNode.props.textAlign ?? "left") as
        | "left"
        | "center"
        | "right",
    },
  });
};

/** 更新图片地址。 */
const handleImageSourceInput = (value: string | number | undefined) => {
  if (props.selectedNode?.type !== "image") {
    return;
  }

  updateNode({
    props: {
      src: readTextInputValue(value, props.selectedNode.props.src),
    },
  });
};

/** 更新图片替代文本。 */
const handleImageAltInput = (value: string | number | undefined) => {
  if (props.selectedNode?.type !== "image") {
    return;
  }

  updateNode({
    props: {
      alt: readTextInputValue(value, props.selectedNode.props.alt ?? ""),
    },
  });
};

/** 更新图片适配方式。 */
const handleImageObjectFitChange = (value: string | number | boolean | undefined) => {
  if (props.selectedNode?.type !== "image") {
    return;
  }

  updateNode({
    props: {
      objectFit: readTextInputValue(value, props.selectedNode.props.objectFit ?? "cover") as
        | "fill"
        | "contain"
        | "cover",
    },
  });
};

/** 更新矩形填充色。 */
const handleRectFillChange = (value: string | undefined) => {
  if (props.selectedNode?.type !== "rect") {
    return;
  }

  updateNode({
    props: {
      fill: readTextInputValue(value, props.selectedNode.props.fill),
    },
  });
};

/** 更新矩形描边色。 */
const handleRectStrokeChange = (value: string | undefined) => {
  if (props.selectedNode?.type !== "rect") {
    return;
  }

  updateNode({
    props: {
      stroke: readTextInputValue(value, props.selectedNode.props.stroke ?? "#0D9488"),
    },
  });
};

/** 更新矩形描边宽度。 */
const handleRectStrokeWidthChange = (value: number | string | undefined) => {
  if (props.selectedNode?.type !== "rect") {
    return;
  }

  updateNode({
    props: {
      strokeWidth: readNumberInputValue(value, props.selectedNode.props.strokeWidth ?? 0, 0),
    },
  });
};

/** 更新矩形圆角。 */
const handleRectRadiusChange = (value: number | string | undefined) => {
  if (props.selectedNode?.type !== "rect") {
    return;
  }

  updateNode({
    props: {
      radius: readNumberInputValue(value, props.selectedNode.props.radius ?? 0, 0),
    },
  });
};

/** 统一发出动画更新事件。 */
const updateAnimation = (animation: NodeAnimation) => {
  emit("upsert-animation", animation);
};

/** 为当前选中对象新增一个默认动画。 */
const handleCreateAnimation = () => {
  if (!props.selectedNode) {
    return;
  }

  const animation = createNodeAnimation({
    targetId: props.selectedNode.id,
  });

  expandedAnimationIds.value = [...expandedAnimationIds.value, animation.id];
  updateAnimation(animation);
};

/** 删除某个动画资源。 */
const handleRemoveAnimation = (animationId: string) => {
  expandedAnimationIds.value = expandedAnimationIds.value.filter((id) => id !== animationId);
  emit("remove-animation", animationId);
};

/** 判断某个动画的高级参数是否处于展开状态。 */
const isAnimationAdvancedOpen = (animationId: string): boolean =>
  expandedAnimationIds.value.includes(animationId);

/** 切换某个动画的高级参数显隐。 */
const toggleAnimationAdvanced = (animationId: string): void => {
  expandedAnimationIds.value = isAnimationAdvancedOpen(animationId)
    ? expandedAnimationIds.value.filter((id) => id !== animationId)
    : [...expandedAnimationIds.value, animationId];
};

/** 更新动画类型。 */
const handleAnimationKindChange = (
  animation: NodeAnimation,
  value: string | number | boolean | undefined,
) => {
  const nextKind = readTextInputValue(value, animation.kind) as NodeAnimation["kind"];

  updateAnimation({
    ...animation,
    kind: nextKind,
    offsetY: nextKind === "slide-up" ? animation.offsetY ?? 32 : undefined,
  });
};

/** 更新动画时长。 */
const handleAnimationDurationChange = (
  animation: NodeAnimation,
  value: number | string | undefined,
) => {
  updateAnimation({
    ...animation,
    durationMs: readNumberInputValue(value, animation.durationMs, 0),
  });
};

/** 更新动画延迟。 */
const handleAnimationDelayChange = (
  animation: NodeAnimation,
  value: number | string | undefined,
) => {
  updateAnimation({
    ...animation,
    delayMs: readNumberInputValue(value, animation.delayMs ?? 0, 0),
  });
};

/** 更新动画缓动。 */
const handleAnimationEasingChange = (
  animation: NodeAnimation,
  value: string | number | boolean | undefined,
) => {
  updateAnimation({
    ...animation,
    easing: readTextInputValue(value, animation.easing ?? "ease-out") as NodeAnimation["easing"],
  });
};

/** 更新 slide-up 动画的纵向偏移。 */
const handleAnimationOffsetYChange = (
  animation: NodeAnimation,
  value: number | string | undefined,
) => {
  updateAnimation({
    ...animation,
    offsetY: readNumberInputValue(value, animation.offsetY ?? 32, 0),
  });
};
</script>

<template>
  <section class="inspector-panel">
    <div v-if="hasMultipleSelection" class="group-card empty-card">
      <div class="group-head">
        <h4>多选状态</h4>
        <span class="group-badge warning">仅查看</span>
      </div>
      <p class="group-copy">
        当前已选中多个对象。为了保持属性修改语义稳定，首版属性面板只支持单选编辑。
      </p>
    </div>

    <template v-else-if="hasSingleSelection && selectedNode">
      <div class="group-card">
        <div class="group-head">
          <h4>基础属性</h4>
          <span class="group-badge accent">{{ formatNodeTypeLabel(selectedNode.type) }}</span>
        </div>

        <div class="field-grid">
          <div class="field field-span-2">
            <span class="field-label">节点名称</span>
            <a-input class="field-input" :model-value="selectedNode.name" @input="handleNodeNameInput" />
          </div>

          <div class="field">
            <span class="field-label">X</span>
            <a-input-number
              class="field-input"
              :model-value="selectedNode.x"
              @change="handleNodeBaseNumberChange('x', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">Y</span>
            <a-input-number
              class="field-input"
              :model-value="selectedNode.y"
              @change="handleNodeBaseNumberChange('y', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">宽度</span>
            <a-input-number
              class="field-input"
              min="1"
              :model-value="selectedNode.width"
              @change="handleNodeBaseNumberChange('width', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">高度</span>
            <a-input-number
              class="field-input"
              min="1"
              :model-value="selectedNode.height"
              @change="handleNodeBaseNumberChange('height', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">旋转</span>
            <a-input-number
              class="field-input"
              :model-value="selectedNode.rotation"
              @change="handleNodeBaseNumberChange('rotation', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">透明度</span>
            <a-input-number
              class="field-input"
              min="0"
              max="100"
              :model-value="nodeOpacityPercent"
              @change="handleNodeOpacityChange"
            />
          </div>
        </div>

        <div class="toggle-grid">
          <div class="toggle-field">
            <span class="field-label">可见</span>
            <a-switch
              class="field-toggle"
              :model-value="selectedNode.visible"
              @change="handleNodeToggle('visible', $event)"
            />
          </div>

          <div class="toggle-field">
            <span class="field-label">锁定</span>
            <a-switch
              class="field-toggle"
              :model-value="selectedNode.locked"
              @change="handleNodeToggle('locked', $event)"
            />
          </div>
        </div>

        <p class="group-footnote">当前透明度：{{ formatOpacityValue(selectedNode.opacity) }}</p>
      </div>

      <div v-if="selectedNode.type === 'text'" class="group-card">
        <div class="group-head">
          <h4>文本属性</h4>
          <span class="group-badge">Text</span>
        </div>

        <div class="field-grid">
          <div class="field field-span-2">
            <span class="field-label">内容</span>
            <a-textarea
              class="field-input field-textarea"
              :model-value="selectedNode.props.text"
              @input="handleTextContentInput"
            />
          </div>

          <div class="field">
            <span class="field-label">字号</span>
            <a-input-number
              class="field-input"
              min="10"
              :model-value="selectedNode.props.fontSize"
              @change="handleTextFontSizeChange"
            />
          </div>

          <div class="field">
            <span class="field-label">颜色</span>
            <a-color-picker
              class="field-input color-input"
              :model-value="selectedNode.props.color"
              show-text
              @change="handleTextColorChange"
            />
          </div>

          <div class="field field-span-2">
            <span class="field-label">对齐方式</span>
            <a-select
              class="field-input"
              :model-value="selectedNode.props.textAlign"
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
        </div>
      </div>

      <div v-if="selectedNode.type === 'rect'" class="group-card">
        <div class="group-head">
          <h4>矩形属性</h4>
          <span class="group-badge">Rect</span>
        </div>

        <div class="field-grid">
          <div class="field">
            <span class="field-label">填充色</span>
            <a-color-picker
              class="field-input color-input"
              :model-value="selectedNode.props.fill"
              show-text
              @change="handleRectFillChange"
            />
          </div>

          <div class="field">
            <span class="field-label">描边色</span>
            <a-color-picker
              class="field-input color-input"
              :model-value="selectedNode.props.stroke ?? '#0D9488'"
              show-text
              @change="handleRectStrokeChange"
            />
          </div>

          <div class="field">
            <span class="field-label">描边宽度</span>
            <a-input-number
              class="field-input"
              min="0"
              :model-value="selectedNode.props.strokeWidth ?? 0"
              @change="handleRectStrokeWidthChange"
            />
          </div>

          <div class="field">
            <span class="field-label">圆角</span>
            <a-input-number
              class="field-input"
              min="0"
              :model-value="selectedNode.props.radius ?? 0"
              @change="handleRectRadiusChange"
            />
          </div>
        </div>
      </div>

      <div v-if="selectedNode.type === 'image'" class="group-card">
        <div class="group-head">
          <h4>图片属性</h4>
          <span class="group-badge">Image</span>
        </div>

        <div class="field-grid">
          <div class="field field-span-2">
            <span class="field-label">图片地址</span>
            <a-input class="field-input" :model-value="selectedNode.props.src" @input="handleImageSourceInput" />
          </div>

          <div class="field field-span-2">
            <span class="field-label">替代文本</span>
            <a-input
              class="field-input"
              :model-value="selectedNode.props.alt ?? ''"
              @input="handleImageAltInput"
            />
          </div>

          <div class="field field-span-2">
            <span class="field-label">适配方式</span>
            <a-select
              class="field-input"
              :model-value="selectedNode.props.objectFit ?? 'cover'"
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
      </div>

      <div class="group-card">
        <div class="group-head">
          <h4>动画设置</h4>
          <a-button
            class="icon-button"
            type="text"
            aria-label="新建动画"
            @click="handleCreateAnimation"
          >
            <template #icon>
              <icon-plus />
            </template>
          </a-button>
        </div>

        <div v-if="hasSelectedAnimations" class="animation-list">
          <article
            v-for="(animation, animationIndex) in selectedAnimations"
            :key="animation.id"
            class="animation-card"
          >
            <header class="card-head">
              <div class="card-title-row">
                <span class="card-index">动画 {{ animationIndex + 1 }}</span>
              </div>
              <a-button
                class="icon-button danger-icon-button"
                status="danger"
                type="text"
                aria-label="删除动画"
                @click="handleRemoveAnimation(animation.id)"
              >
                <template #icon>
                  <icon-delete />
                </template>
              </a-button>
            </header>

            <div class="field-grid">
              <div class="field">
                <span class="field-label">类型</span>
                <a-select
                  class="field-input"
                  :model-value="animation.kind"
                  popup-container="body"
                  @change="handleAnimationKindChange(animation, $event)"
                >
                  <a-option
                    v-for="option in animationKindOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </a-option>
                </a-select>
              </div>

              <div class="field">
                <span class="field-label">时长(ms)</span>
                <a-input-number
                  class="field-input"
                  min="0"
                  :model-value="animation.durationMs"
                  @change="handleAnimationDurationChange(animation, $event)"
                />
              </div>

              <div class="advanced-fields field-span-2">
                <a-button
                  class="advanced-toggle"
                  type="text"
                  @click="toggleAnimationAdvanced(animation.id)"
                >
                  {{ isAnimationAdvancedOpen(animation.id) ? "收起高级参数" : "高级参数" }}
                </a-button>

                <div v-if="isAnimationAdvancedOpen(animation.id)" class="advanced-grid">
                  <div class="field">
                    <span class="field-label">缓动</span>
                    <a-select
                      class="field-input"
                      :model-value="animation.easing ?? 'ease-out'"
                      popup-container="body"
                      @change="handleAnimationEasingChange(animation, $event)"
                    >
                      <a-option
                        v-for="option in easingOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </div>

                  <div class="field">
                    <span class="field-label">延迟(ms)</span>
                    <a-input-number
                      class="field-input"
                      min="0"
                      :model-value="animation.delayMs ?? 0"
                      @change="handleAnimationDelayChange(animation, $event)"
                    />
                  </div>

                  <div v-if="animation.kind === 'slide-up'" class="field field-span-2">
                    <span class="field-label">偏移Y</span>
                    <a-input-number
                      class="field-input"
                      min="0"
                      :model-value="animation.offsetY ?? 32"
                      @change="handleAnimationOffsetYChange(animation, $event)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
        <p v-else class="group-copy">当前对象还没有动画。</p>
      </div>

      <div class="group-card">
        <div class="group-head">
          <h4>播放归属</h4>
          <span class="group-badge accent">
            {{ hasTimelineSummary ? `${timelineSummary?.stepReferences.length ?? 0} 个步骤` : "未编排" }}
          </span>
        </div>

        <div class="timeline-overview">
          <span class="timeline-chip">
            {{ formatNodeInitialVisibilityLabel(timelineSummary?.isInitiallyVisible ?? selectedNode.visible) }}
          </span>
          <span v-if="hasFirstTimelineStep" class="timeline-chip accent">
            {{ formatStepIndexLabel(timelineSummary?.firstStepIndex ?? 0) }}
          </span>
          <span v-else class="timeline-chip subtle">当前对象尚未加入时间轴步骤</span>
        </div>

        <div v-if="hasTimelineSummary" class="timeline-step-list">
          <article
            v-for="stepReference in timelineSummary?.stepReferences ?? []"
            :key="stepReference.stepId"
            class="timeline-step-card"
          >
            <div class="timeline-step-topline">
              <strong>{{ formatStepIndexLabel(stepReference.stepIndex) }}</strong>
              <span>{{ formatTriggerLabel(stepReference.triggerType) }}</span>
            </div>
            <p>{{ stepReference.stepName }}</p>
            <small>{{ stepReference.actionTypes.length }} 个相关动作</small>
          </article>
        </div>
      </div>
    </template>

    <div v-else class="group-card empty-card">
      <div class="group-head">
        <h4>未选择组件</h4>
        <span class="group-badge">待选择</span>
      </div>
      <p class="group-copy">选中一个画布对象后，这里会显示它的基础信息和类型专属属性。</p>
    </div>
  </section>
</template>

<style scoped>
.inspector-panel {
  display: grid;
  gap: var(--cw-space-4);
  padding: var(--cw-space-5);
  border: 1px solid var(--cw-color-border);
  border-radius: var(--cw-radius-lg);
  background:
    linear-gradient(180deg, rgba(234, 88, 12, 0.05), rgba(255, 255, 255, 0.96)),
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

.group-badge.accent {
  color: var(--cw-color-primary);
}

.group-badge.warning {
  color: var(--cw-color-accent);
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

.group-copy,
.group-footnote {
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

.timeline-overview {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cw-space-2);
}

.timeline-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: var(--cw-radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-color-muted);
  background: rgba(100, 116, 139, 0.1);
}

.timeline-chip.accent {
  color: var(--cw-color-primary);
  background: rgba(22, 93, 255, 0.12);
}

.timeline-chip.subtle {
  color: var(--cw-color-text);
  background: rgba(19, 78, 74, 0.08);
}

.timeline-step-list {
  display: grid;
  gap: var(--cw-space-3);
}

.timeline-step-card {
  display: grid;
  gap: var(--cw-space-2);
  padding: 14px 16px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-md);
  background: rgba(255, 255, 255, 0.92);
}

.timeline-step-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-2);
}

.timeline-step-topline strong {
  font-size: 15px;
  color: var(--cw-color-text);
}

.timeline-step-topline span,
.timeline-step-card small {
  font-size: 13px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.timeline-step-card p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--cw-color-text);
}

.animation-list {
  display: grid;
  gap: var(--cw-space-3);
}

.animation-card {
  display: grid;
  gap: var(--cw-space-3);
  padding: 14px 16px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-md);
  background: rgba(255, 255, 255, 0.92);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-3);
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: var(--cw-space-2);
}

.card-index {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: var(--cw-radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-color-primary);
  background: rgba(22, 93, 255, 0.1);
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
.field-input:deep(.arco-select-view),
.field-input:deep(.arco-input-number),
.field-input:deep(.arco-textarea-wrapper),
.field-input:deep(.arco-color-picker-trigger) {
  width: 100%;
  min-height: 44px;
}

.field-textarea {
  min-height: 112px;
}

.field-textarea:deep(textarea) {
  min-height: 112px;
  resize: vertical;
}

.color-input {
  padding: 6px;
}

.advanced-fields {
  margin: 0;
  background: transparent;
}

.advanced-toggle {
  min-height: 28px;
  padding: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-color-muted);
}

.advanced-toggle:hover {
  color: var(--cw-color-primary);
  background: transparent;
}

.advanced-grid {
  padding-top: var(--cw-space-3);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-3);
}

.toggle-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-3);
}

.toggle-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 14px;
}

.field-toggle {
  flex-shrink: 0;
}

.empty-card {
  background: rgba(240, 253, 250, 0.74);
}

.icon-button {
  min-width: 34px;
  min-height: 34px;
  border-radius: 10px;
  font-size: 14px;
}

.icon-button:hover {
  background: rgba(22, 93, 255, 0.08);
}

.danger-icon-button:hover {
  background: rgba(245, 63, 63, 0.08);
}

@media (max-width: 640px) {
  .field-grid,
  .toggle-grid,
  .advanced-grid {
    grid-template-columns: 1fr;
  }

  .field-span-2 {
    grid-column: span 1;
  }
}
</style>
