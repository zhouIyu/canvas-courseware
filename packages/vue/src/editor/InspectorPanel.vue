<script setup lang="ts">
import type { CoursewareNode, NodePatch, NodeTimelineSummary } from "@canvas-courseware/core";
import { computed } from "vue";
import {
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
    /** 当前选中节点的步骤归属摘要。 */
    timelineSummary?: NodeTimelineSummary | null;
  }>(),
  {
    selectedNode: null,
    selectedCount: 0,
    timelineSummary: null,
  },
);

/** 属性面板向外派发的编辑意图。 */
const emit = defineEmits<{
  /** 更新当前选中节点。 */
  "update-node": [nodeId: string, patch: NodePatch];
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

/** 读取文本输入框的字符串值。 */
const readTextInputValue = (event: Event, fallback = ""): string => {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    ? target.value
    : fallback;
};

/** 读取勾选框的布尔值。 */
const readCheckedValue = (event: Event, fallback = false): boolean => {
  const target = event.target;
  return target instanceof HTMLInputElement ? target.checked : fallback;
};

/**
 * 读取数字输入框的值，并在解析失败时回退到当前值。
 * 对于宽高、字号等字段，还会执行最小值保护，避免非法负数。
 */
const readNumberInputValue = (
  event: Event,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
) => {
  const target = event.target;
  const parsed =
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement
      ? Number(target.value)
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
const handleNodeNameInput = (event: Event) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    name: readTextInputValue(event, props.selectedNode.name),
  });
};

/** 更新节点基础数值属性。 */
const handleNodeBaseNumberChange = (
  field: "x" | "y" | "width" | "height" | "rotation",
  event: Event,
) => {
  if (!props.selectedNode) {
    return;
  }

  const minimum = field === "width" || field === "height" ? 1 : Number.NEGATIVE_INFINITY;
  updateNode({
    [field]: readNumberInputValue(event, props.selectedNode[field], minimum),
  });
};

/** 更新节点透明度。 */
const handleNodeOpacityChange = (event: Event) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    opacity: readNumberInputValue(event, nodeOpacityPercent.value, 0) / 100,
  });
};

/** 更新节点的布尔状态。 */
const handleNodeToggle = (field: "visible" | "locked", event: Event) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    [field]: readCheckedValue(event, props.selectedNode[field]),
  });
};

/** 更新文本内容。 */
const handleTextContentInput = (event: Event) => {
  if (props.selectedNode?.type !== "text") {
    return;
  }

  updateNode({
    props: {
      text: readTextInputValue(event, props.selectedNode.props.text),
    },
  });
};

/** 更新文本字号。 */
const handleTextFontSizeChange = (event: Event) => {
  if (props.selectedNode?.type !== "text") {
    return;
  }

  updateNode({
    props: {
      fontSize: readNumberInputValue(event, props.selectedNode.props.fontSize, 10),
    },
  });
};

/** 更新文本颜色。 */
const handleTextColorChange = (event: Event) => {
  if (props.selectedNode?.type !== "text") {
    return;
  }

  updateNode({
    props: {
      color: readTextInputValue(event, props.selectedNode.props.color),
    },
  });
};

/** 更新文本对齐方式。 */
const handleTextAlignChange = (event: Event) => {
  if (props.selectedNode?.type !== "text") {
    return;
  }

  updateNode({
    props: {
      textAlign: readTextInputValue(event, props.selectedNode.props.textAlign ?? "left") as
        | "left"
        | "center"
        | "right",
    },
  });
};

/** 更新图片地址。 */
const handleImageSourceInput = (event: Event) => {
  if (props.selectedNode?.type !== "image") {
    return;
  }

  updateNode({
    props: {
      src: readTextInputValue(event, props.selectedNode.props.src),
    },
  });
};

/** 更新图片替代文本。 */
const handleImageAltInput = (event: Event) => {
  if (props.selectedNode?.type !== "image") {
    return;
  }

  updateNode({
    props: {
      alt: readTextInputValue(event, props.selectedNode.props.alt ?? ""),
    },
  });
};

/** 更新图片适配方式。 */
const handleImageObjectFitChange = (event: Event) => {
  if (props.selectedNode?.type !== "image") {
    return;
  }

  updateNode({
    props: {
      objectFit: readTextInputValue(event, props.selectedNode.props.objectFit ?? "cover") as
        | "fill"
        | "contain"
        | "cover",
    },
  });
};

/** 更新矩形填充色。 */
const handleRectFillChange = (event: Event) => {
  if (props.selectedNode?.type !== "rect") {
    return;
  }

  updateNode({
    props: {
      fill: readTextInputValue(event, props.selectedNode.props.fill),
    },
  });
};

/** 更新矩形描边色。 */
const handleRectStrokeChange = (event: Event) => {
  if (props.selectedNode?.type !== "rect") {
    return;
  }

  updateNode({
    props: {
      stroke: readTextInputValue(event, props.selectedNode.props.stroke ?? "#0D9488"),
    },
  });
};

/** 更新矩形描边宽度。 */
const handleRectStrokeWidthChange = (event: Event) => {
  if (props.selectedNode?.type !== "rect") {
    return;
  }

  updateNode({
    props: {
      strokeWidth: readNumberInputValue(event, props.selectedNode.props.strokeWidth ?? 0, 0),
    },
  });
};

/** 更新矩形圆角。 */
const handleRectRadiusChange = (event: Event) => {
  if (props.selectedNode?.type !== "rect") {
    return;
  }

  updateNode({
    props: {
      radius: readNumberInputValue(event, props.selectedNode.props.radius ?? 0, 0),
    },
  });
};
</script>

<template>
  <section class="inspector-panel">
    <header class="panel-head">
      <div>
        <p class="panel-kicker">组件管理</p>
        <h3>组件属性</h3>
      </div>
      <span class="panel-count">{{ selectedCount }} 个选中</span>
    </header>

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

      <div class="group-card">
        <div class="group-head">
          <h4>基础属性</h4>
          <span class="group-badge accent">{{ formatNodeTypeLabel(selectedNode.type) }}</span>
        </div>

        <div class="field-grid">
          <label class="field field-span-2">
            <span class="field-label">节点名称</span>
            <input class="field-input" :value="selectedNode.name" @input="handleNodeNameInput" />
          </label>

          <label class="field">
            <span class="field-label">X</span>
            <input
              class="field-input"
              type="number"
              step="1"
              :value="selectedNode.x"
              @change="handleNodeBaseNumberChange('x', $event)"
            />
          </label>

          <label class="field">
            <span class="field-label">Y</span>
            <input
              class="field-input"
              type="number"
              step="1"
              :value="selectedNode.y"
              @change="handleNodeBaseNumberChange('y', $event)"
            />
          </label>

          <label class="field">
            <span class="field-label">宽度</span>
            <input
              class="field-input"
              type="number"
              min="1"
              step="1"
              :value="selectedNode.width"
              @change="handleNodeBaseNumberChange('width', $event)"
            />
          </label>

          <label class="field">
            <span class="field-label">高度</span>
            <input
              class="field-input"
              type="number"
              min="1"
              step="1"
              :value="selectedNode.height"
              @change="handleNodeBaseNumberChange('height', $event)"
            />
          </label>

          <label class="field">
            <span class="field-label">旋转</span>
            <input
              class="field-input"
              type="number"
              step="1"
              :value="selectedNode.rotation"
              @change="handleNodeBaseNumberChange('rotation', $event)"
            />
          </label>

          <label class="field">
            <span class="field-label">透明度</span>
            <input
              class="field-input"
              type="number"
              min="0"
              max="100"
              step="1"
              :value="nodeOpacityPercent"
              @change="handleNodeOpacityChange"
            />
          </label>
        </div>

        <div class="toggle-grid">
          <label class="toggle-field">
            <span class="field-label">可见</span>
            <input
              class="field-toggle"
              type="checkbox"
              :checked="selectedNode.visible"
              @change="handleNodeToggle('visible', $event)"
            />
          </label>

          <label class="toggle-field">
            <span class="field-label">锁定</span>
            <input
              class="field-toggle"
              type="checkbox"
              :checked="selectedNode.locked"
              @change="handleNodeToggle('locked', $event)"
            />
          </label>
        </div>

        <p class="group-footnote">当前透明度：{{ formatOpacityValue(selectedNode.opacity) }}</p>
      </div>

      <div v-if="selectedNode.type === 'text'" class="group-card">
        <div class="group-head">
          <h4>文本属性</h4>
          <span class="group-badge">Text</span>
        </div>

        <div class="field-grid">
          <label class="field field-span-2">
            <span class="field-label">内容</span>
            <textarea
              class="field-input field-textarea"
              :value="selectedNode.props.text"
              @input="handleTextContentInput"
            />
          </label>

          <label class="field">
            <span class="field-label">字号</span>
            <input
              class="field-input"
              type="number"
              min="10"
              step="1"
              :value="selectedNode.props.fontSize"
              @change="handleTextFontSizeChange"
            />
          </label>

          <label class="field">
            <span class="field-label">颜色</span>
            <input
              class="field-input color-input"
              type="color"
              :value="selectedNode.props.color"
              @input="handleTextColorChange"
            />
          </label>

          <label class="field field-span-2">
            <span class="field-label">对齐方式</span>
            <select
              class="field-input"
              :value="selectedNode.props.textAlign"
              @change="handleTextAlignChange"
            >
              <option
                v-for="option in textAlignOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div v-if="selectedNode.type === 'rect'" class="group-card">
        <div class="group-head">
          <h4>矩形属性</h4>
          <span class="group-badge">Rect</span>
        </div>

        <div class="field-grid">
          <label class="field">
            <span class="field-label">填充色</span>
            <input
              class="field-input color-input"
              type="color"
              :value="selectedNode.props.fill"
              @input="handleRectFillChange"
            />
          </label>

          <label class="field">
            <span class="field-label">描边色</span>
            <input
              class="field-input color-input"
              type="color"
              :value="selectedNode.props.stroke ?? '#0D9488'"
              @input="handleRectStrokeChange"
            />
          </label>

          <label class="field">
            <span class="field-label">描边宽度</span>
            <input
              class="field-input"
              type="number"
              min="0"
              step="1"
              :value="selectedNode.props.strokeWidth ?? 0"
              @change="handleRectStrokeWidthChange"
            />
          </label>

          <label class="field">
            <span class="field-label">圆角</span>
            <input
              class="field-input"
              type="number"
              min="0"
              step="1"
              :value="selectedNode.props.radius ?? 0"
              @change="handleRectRadiusChange"
            />
          </label>
        </div>
      </div>

      <div v-if="selectedNode.type === 'image'" class="group-card">
        <div class="group-head">
          <h4>图片属性</h4>
          <span class="group-badge">Image</span>
        </div>

        <div class="field-grid">
          <label class="field field-span-2">
            <span class="field-label">图片地址</span>
            <input class="field-input" :value="selectedNode.props.src" @input="handleImageSourceInput" />
          </label>

          <label class="field field-span-2">
            <span class="field-label">替代文本</span>
            <input
              class="field-input"
              :value="selectedNode.props.alt ?? ''"
              @input="handleImageAltInput"
            />
          </label>

          <label class="field field-span-2">
            <span class="field-label">适配方式</span>
            <select
              class="field-input"
              :value="selectedNode.props.objectFit ?? 'cover'"
              @change="handleImageObjectFitChange"
            >
              <option
                v-for="option in objectFitOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
      </div>
    </template>

    <div v-else class="group-card empty-card">
      <div class="group-head">
        <h4>组件属性</h4>
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

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-4);
}

.panel-kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cw-color-accent);
}

.panel-head h3 {
  margin: var(--cw-space-2) 0 0;
  font-size: 22px;
  line-height: 1.2;
}

.panel-count,
.group-badge {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 var(--cw-space-3);
  border-radius: var(--cw-radius-pill);
  font-size: 13px;
  color: var(--cw-color-text);
  background: rgba(19, 78, 74, 0.08);
}

.group-badge.accent {
  color: var(--cw-color-primary);
  background: rgba(22, 93, 255, 0.1);
}

.group-badge.warning {
  color: var(--cw-color-accent);
  background: rgba(234, 88, 12, 0.12);
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
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid rgba(19, 78, 74, 0.12);
  border-radius: var(--cw-radius-sm);
  color: var(--cw-color-text);
  background: #ffffff;
  transition:
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard);
}

.field-input:hover {
  border-color: rgba(22, 93, 255, 0.28);
}

.field-input:focus {
  border-color: rgba(22, 93, 255, 0.36);
}

.field-textarea {
  min-height: 112px;
  padding-top: 12px;
  padding-bottom: 12px;
  resize: vertical;
}

.color-input {
  padding: 6px;
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
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-sm);
  background: rgba(240, 253, 250, 0.72);
}

.field-toggle {
  width: 18px;
  height: 18px;
  accent-color: var(--cw-color-primary);
}

.empty-card {
  background: rgba(240, 253, 250, 0.74);
}

@media (max-width: 640px) {
  .field-grid,
  .toggle-grid {
    grid-template-columns: 1fr;
  }

  .field-span-2 {
    grid-column: span 1;
  }
}
</style>
