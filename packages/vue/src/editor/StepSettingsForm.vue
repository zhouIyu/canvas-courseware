<script setup lang="ts">
import type { Slide, TimelineStep } from "@canvas-courseware/core";
import { computed } from "vue";
import TimelineStepActionsEditor from "./TimelineStepActionsEditor.vue";
import { resolveTimelineStepHeadlineSummary } from "./timeline-step-summary";
import { formatNodeTypeLabel } from "../shared";

/** 步骤设置表单的只读输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前步骤所属的 slide。 */
    slide?: Slide | null;
    /** 当前步骤快照。 */
    step: TimelineStep;
    /** 当前步骤在列表中的索引。 */
    stepIndex: number;
    /** 当前 slide 的总步骤数。 */
    stepCount: number;
    /** 当前首个选中的节点 id，用来补默认触发目标。 */
    selectedNodeId?: string | null;
    /** 当前页面是否已经存在可编排对象。 */
    hasNodes: boolean;
  }>(),
  {
    slide: null,
    selectedNodeId: null,
  },
);

/** 步骤设置表单向外派发的标准化编辑意图。 */
const emit = defineEmits<{
  /** 用最新配置回写整个步骤。 */
  "update-step": [step: TimelineStep];
}>();

/** 当前页面的节点选项，供触发对象下拉框复用。 */
const nodeOptions = computed(() =>
  (props.slide?.nodes ?? []).map((node) => ({
    value: node.id,
    label: node.name,
    detail: formatNodeTypeLabel(node.type),
  })),
);

/** 当前步骤名为空时的安全兜底展示文案。 */
const stepDisplayName = computed(() => props.step.name.trim() || "未命名步骤");

/** 统一输出带前导零的步骤序号，方便用户在抽屉里确认当前编辑对象。 */
const stepIndexLabel = computed(() => `步骤 ${String(props.stepIndex + 1).padStart(2, "0")}`);

/** 抽屉头部显示的步骤总览摘要。 */
const stepHeadlineSummary = computed(() =>
  resolveTimelineStepHeadlineSummary(props.step, props.slide ?? null),
);

/** 读取文本输入框和下拉框的字符串值。 */
const readTextInputValue = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  const target = value instanceof Event ? value.target : null;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement
    ? target.value
    : fallback;
};

/** 读取数字输入框的值，并在非法输入时回退到当前值。 */
const readNumberInputValue = (value: unknown, fallback: number, minimum = 0): number => {
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

/** 读取某个步骤中最适合作为对象点击触发兜底的节点 id。 */
function resolvePrimaryActionTargetId(step: TimelineStep): string {
  const directTargetAction = step.actions.find(
    (action) => action.type === "show-node" || action.type === "hide-node",
  );

  if (directTargetAction && "targetId" in directTargetAction) {
    return directTargetAction.targetId;
  }

  const firstAnimatedAction = step.actions.find((action) => action.type === "play-animation");
  if (firstAnimatedAction?.animationId) {
    const animation = props.slide?.timeline.animations.find(
      (item) => item.id === firstAnimatedAction.animationId,
    );

    if (animation?.targetId) {
      return animation.targetId;
    }
  }

  return props.selectedNodeId ?? props.slide?.nodes[0]?.id ?? "";
}

/** 用统一出口把当前步骤回写给父组件。 */
function emitStep(step: TimelineStep): void {
  emit("update-step", step);
}

/** 更新步骤名称。 */
function handleStepNameInput(value: string | number | undefined): void {
  emitStep({
    ...props.step,
    name: readTextInputValue(value, props.step.name),
  });
}

/** 更新步骤触发方式，并在切换时补齐默认目标或默认延迟。 */
function handleStepTriggerTypeChange(
  value: string | number | boolean | undefined,
): void {
  const nextTriggerType = readTextInputValue(
    value,
    props.step.trigger.type,
  ) as TimelineStep["trigger"]["type"];

  emitStep({
    ...props.step,
    trigger:
      nextTriggerType === "auto"
        ? {
            type: "auto",
            delayMs: props.step.trigger.type === "auto" ? props.step.trigger.delayMs : 600,
          }
        : nextTriggerType === "node-click"
          ? {
              type: "node-click",
              targetId:
                props.step.trigger.type === "node-click"
                  ? props.step.trigger.targetId
                  : resolvePrimaryActionTargetId(props.step),
            }
        : {
            type: "page-click",
          },
  });
}

/** 更新自动步骤的延迟时间。 */
function handleStepDelayChange(value: number | string | undefined): void {
  if (props.step.trigger.type !== "auto") {
    return;
  }

  emitStep({
    ...props.step,
    trigger: {
      type: "auto",
      delayMs: readNumberInputValue(value, props.step.trigger.delayMs, 0),
    },
  });
}

/** 更新对象点击触发器的目标对象。 */
function handleStepTriggerTargetChange(
  value: string | number | boolean | undefined,
): void {
  if (props.step.trigger.type !== "node-click") {
    return;
  }

  emitStep({
    ...props.step,
    trigger: {
      type: "node-click",
      targetId: readTextInputValue(value, props.step.trigger.targetId),
    },
  });
}

/** 透传动作编辑器回写的最新步骤，保持父层只处理步骤级命令。 */
function handleActionsEditorStepUpdate(step: TimelineStep): void {
  emitStep(step);
}
</script>

<template>
  <section class="step-settings-form">
    <header class="step-settings-form__header">
      <div class="step-settings-form__eyebrow">
        <span class="step-settings-form__index">{{ stepIndexLabel }}</span>
        <span class="step-settings-form__count">共 {{ props.stepCount }} 步</span>
      </div>
      <div class="step-settings-form__headline">
        <h3>{{ stepDisplayName }}</h3>
        <p>当前修改会实时写回时间轴，无需额外保存。</p>
      </div>
      <div class="step-settings-form__summary">
        <span class="step-settings-form__summary-chip accent">
          {{ stepHeadlineSummary.triggerLabel }}
        </span>
        <span class="step-settings-form__summary-chip">
          {{ stepHeadlineSummary.actionCountLabel }}
        </span>
      </div>
    </header>

    <div class="step-settings-form__section">
      <div class="step-settings-form__section-head">
        <strong>基础设置</strong>
        <span>先确定步骤名称与触发方式。</span>
      </div>

      <div class="field-grid step-field-grid">
        <div class="field field-span-2">
          <span class="field-label">名称</span>
          <a-input
            class="field-input"
            :model-value="props.step.name"
            @input="handleStepNameInput($event)"
          />
        </div>

        <div class="field">
          <span class="field-label">触发</span>
          <a-select
            class="field-input"
            :model-value="props.step.trigger.type"
            popup-container="body"
            @change="handleStepTriggerTypeChange($event)"
          >
            <a-option value="page-click">页面点击</a-option>
            <a-option value="auto">自动触发</a-option>
            <a-option value="node-click">对象点击</a-option>
          </a-select>
        </div>

        <div v-if="props.step.trigger.type === 'node-click'" class="field">
          <span class="field-label">对象</span>
          <a-select
            class="field-input"
            :model-value="props.step.trigger.targetId"
            popup-container="body"
            @change="handleStepTriggerTargetChange($event)"
          >
            <a-option v-for="option in nodeOptions" :key="option.value" :value="option.value">
              {{ option.label }} · {{ option.detail }}
            </a-option>
          </a-select>
        </div>

        <div v-if="props.step.trigger.type === 'auto'" class="field">
          <span class="field-label">延迟(ms)</span>
          <a-input-number
            class="field-input"
            min="0"
            :model-value="props.step.trigger.delayMs"
            @change="handleStepDelayChange($event)"
          />
        </div>
      </div>
    </div>

    <div class="step-settings-form__section">
      <TimelineStepActionsEditor
        :has-nodes="props.hasNodes"
        :selected-node-id="props.selectedNodeId"
        :slide="props.slide ?? null"
        :step="props.step"
        @update-step="handleActionsEditorStepUpdate"
      />
    </div>
  </section>
</template>

<style scoped src="./StepSettingsForm.css"></style>
