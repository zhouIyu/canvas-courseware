<script setup lang="ts">
import { computed } from "vue";
import type { Slide, TimelineStep } from "@canvas-courseware/core";
import TimelineStepActionsEditor from "./TimelineStepActionsEditor.vue";
import { resolveTimelineStepHeadlineSummary } from "./timeline-step-summary";
import type {
  TimelineStepDuplicatePayload,
  TimelineStepMenuAction,
} from "./timeline-panel-types";
import type { TimelineStepReorderPayload } from "./useTimelineStepDragSort";
import { formatNodeTypeLabel } from "../shared";

/** 步骤卡片对外暴露的只读输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前步骤所属的 slide。 */
    slide?: Slide | null;
    /** 当前步骤快照。 */
    step: TimelineStep;
    /** 当前步骤在列表中的索引。 */
    stepIndex: number;
    /** 当前 slide 的总步骤数，用来控制移动边界。 */
    stepCount: number;
    /** 当前首个选中的节点 id，用来补默认触发目标。 */
    selectedNodeId?: string | null;
    /** 当前页面是否已经存在可编排对象。 */
    hasNodes: boolean;
    /** 当前步骤是否处于折叠态。 */
    isCollapsed: boolean;
    /** 当前步骤是否正被拖拽。 */
    isDragging?: boolean;
    /** 当前步骤命中的拖放位置。 */
    dropPlacement?: "before" | "after" | null;
    /** 当前步骤是否允许上移。 */
    canMoveUp?: boolean;
    /** 当前步骤是否允许下移。 */
    canMoveDown?: boolean;
  }>(),
  {
    slide: null,
    selectedNodeId: null,
    isDragging: false,
    dropPlacement: null,
    canMoveUp: false,
    canMoveDown: false,
  },
);

/** 步骤卡片向外派发的标准化编辑意图。 */
const emit = defineEmits<{
  /** 用最新配置回写整个步骤。 */
  "update-step": [step: TimelineStep];
  /** 删除当前步骤。 */
  "remove-step": [stepId: string];
  /** 调整当前步骤顺序。 */
  "reorder-step": [payload: TimelineStepReorderPayload];
  /** 复制当前步骤。 */
  "duplicate-step": [payload: TimelineStepDuplicatePayload];
  /** 从当前步骤切入预览。 */
  "preview-step": [stepIndex: number];
  /** 切换当前步骤的折叠状态。 */
  "toggle-collapsed": [];
  /** 开始拖拽当前步骤。 */
  "drag-start": [event: DragEvent];
  /** 拖拽经过当前步骤。 */
  "drag-over": [event: DragEvent];
  /** 在当前步骤上完成拖放。 */
  drop: [event: DragEvent];
  /** 当前步骤拖拽结束。 */
  "drag-end": [];
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

/** 统一输出带前导零的步骤序号，方便列表快速扫描。 */
const stepIndexLabel = computed(() => `步骤 ${String(props.stepIndex + 1).padStart(2, "0")}`);

/** 折叠按钮的可访问名称。 */
const collapseButtonLabel = computed(() => (props.isCollapsed ? "展开" : "收起"));

/** 折叠态第二行统一只保留触发方式和动作数量摘要。 */
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

/** 删除当前步骤。 */
function handleRemoveStep(): void {
  emit("remove-step", props.step.id);
}

/** 上移或下移当前步骤，并在边界处自动短路。 */
function handleStepMove(offset: number): void {
  const nextIndex = Math.min(
    Math.max(props.stepIndex + offset, 0),
    Math.max(props.stepCount - 1, 0),
  );

  if (nextIndex === props.stepIndex) {
    return;
  }

  emit("reorder-step", {
    stepId: props.step.id,
    index: nextIndex,
  });
}

/** 复制当前步骤，供“复制”和“后插一步”两条链路复用。 */
function handleDuplicateStep(name?: string): void {
  emit("duplicate-step", {
    step: props.step,
    index: props.stepIndex,
    name,
  });
}

/** 为“后插一步”生成更贴近当前上下文的新步骤名称。 */
function resolveFollowUpStepName(stepName: string): string {
  const normalizedStepName = stepName.trim() || `步骤 ${props.stepCount + 1}`;
  return normalizedStepName.endsWith("后续")
    ? `${normalizedStepName} 2`
    : `${normalizedStepName} 后续`;
}

/** 基于当前步骤快速后插一个新步骤，减少重复配置。 */
function handleCreateStepAfter(): void {
  handleDuplicateStep(resolveFollowUpStepName(props.step.name));
}

/** 请求外层从当前步骤切入预览。 */
function handlePreviewStep(): void {
  emit("preview-step", props.stepIndex);
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

/** 处理“更多操作”菜单中的快捷动作。 */
function handleStepMenuAction(value: string | number): void {
  const action = String(value) as TimelineStepMenuAction;

  switch (action) {
    case "move-up":
      handleStepMove(-1);
      break;
    case "move-down":
      handleStepMove(1);
      break;
    case "insert-after":
      handleCreateStepAfter();
      break;
    case "duplicate":
      handleDuplicateStep();
      break;
    case "delete":
      handleRemoveStep();
      break;
    default:
      break;
  }
}

/** 把拖拽起点透传给父层的排序组合式函数。 */
function handleDragStart(event: DragEvent): void {
  emit("drag-start", event);
}

/** 把拖拽经过事件透传给父层，继续复用统一排序逻辑。 */
function handleDragOver(event: DragEvent): void {
  emit("drag-over", event);
}

/** 把拖放完成事件透传给父层，继续走同一条命令链路。 */
function handleDrop(event: DragEvent): void {
  emit("drop", event);
}
</script>

<template>
  <article
    class="step-card"
    :class="{
      'is-collapsed': props.isCollapsed,
      'is-dragging': props.isDragging,
      'is-drop-before': props.dropPlacement === 'before',
      'is-drop-after': props.dropPlacement === 'after',
    }"
    @dragover="handleDragOver"
    @drop="handleDrop"
  >
    <header class="timeline-step-card__header">
      <div class="timeline-step-card__headline-row">
        <div
          class="card-head"
          draggable="true"
          @dragend="emit('drag-end')"
          @dragstart="handleDragStart"
        >
          <div class="card-title-topline">
            <span class="card-index">{{ stepIndexLabel }}</span>
            <strong class="step-title">{{ stepDisplayName }}</strong>
          </div>
        </div>

        <div class="step-card-actions">
          <a-button
            class="text-button step-action-button"
            type="text"
            size="mini"
            :aria-label="collapseButtonLabel"
            @click="emit('toggle-collapsed')"
          >
            <template #icon>
              <icon-caret-down v-if="!props.isCollapsed" />
              <icon-caret-up v-else />
            </template>
          </a-button>
          <a-button
            class="text-button step-action-button is-preview"
            type="text"
            size="mini"
            aria-label="从此预览"
            @click="handlePreviewStep"
          >
            <template #icon>
              <icon-play-arrow />
            </template>
          </a-button>
          <a-dropdown
            trigger="click"
            position="bl"
            popup-container="body"
            @select="handleStepMenuAction"
          >
            <a-button
              class="text-button step-action-button"
              type="text"
              size="mini"
              aria-label="更多步骤操作"
            >
              <template #icon>
                <icon-more-vertical />
              </template>
            </a-button>
            <template #content>
              <a-doption
                class="timeline-step-card__menu-option"
                value="move-up"
                :disabled="!props.canMoveUp"
              >
                上移
              </a-doption>
              <a-doption
                class="timeline-step-card__menu-option"
                value="move-down"
                :disabled="!props.canMoveDown"
              >
                下移
              </a-doption>
              <a-doption class="timeline-step-card__menu-option" value="insert-after">
                后插一步
              </a-doption>
              <a-doption class="timeline-step-card__menu-option" value="duplicate">
                复制
              </a-doption>
              <a-divider :margin="4" />
              <a-doption class="timeline-step-card__menu-option is-danger" value="delete">
                <span class="timeline-step-card__menu-danger-copy">删除</span>
              </a-doption>
            </template>
          </a-dropdown>
        </div>
      </div>

      <div class="step-summary-row">
        <span class="summary-copy summary-copy--trigger">{{ stepHeadlineSummary.triggerLabel }}</span>
        <span class="summary-copy summary-copy--separator" aria-hidden="true">·</span>
        <span class="summary-copy summary-copy--count">{{ stepHeadlineSummary.actionCountLabel }}</span>
      </div>
    </header>

    <div v-if="!props.isCollapsed" class="step-card-body">
      <div class="field-grid step-field-grid">
        <div class="field field-span-2">
          <span class="field-label">名称</span>
          <a-input class="field-input" :model-value="props.step.name" @input="handleStepNameInput($event)" />
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

      <TimelineStepActionsEditor
        :has-nodes="props.hasNodes"
        :selected-node-id="props.selectedNodeId"
        :slide="props.slide ?? null"
        :step="props.step"
        @update-step="handleActionsEditorStepUpdate"
      />
    </div>
  </article>
</template>

<style scoped src="./TimelineStepCard.css"></style>
