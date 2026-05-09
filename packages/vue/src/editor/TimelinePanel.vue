<script setup lang="ts">
import {
  createTimelineAction,
  createTimelineStep,
  type Slide,
  type TimelineStep,
} from "@canvas-courseware/core";
import { computed } from "vue";
import { formatNodeTypeLabel } from "../shared";
import TimelineStepActionsEditor from "./TimelineStepActionsEditor.vue";
import { resolveTimelineStepSummaryChips } from "./timeline-step-summary";
import {
  useTimelineStepDragSort,
  type TimelineStepReorderPayload,
} from "./useTimelineStepDragSort";
import { useTimelineStepCollapseState } from "./useTimelineStepCollapseState";

/** 时间轴步骤复制事件的载荷。 */
interface TimelineStepDuplicatePayload {
  /** 需要复制的步骤快照。 */
  step: TimelineStep;
  /** 源步骤的当前索引。 */
  index: number;
  /** 复制时允许覆写副本名称，供“后插一步”这类快捷入口复用。 */
  name?: string;
}

/** 时间轴步骤触发方式选项。 */
const triggerOptions = [
  {
    label: "页面点击",
    value: "page-click",
  },
  {
    label: "自动触发",
    value: "auto",
  },
  {
    label: "对象点击",
    value: "node-click",
  },
] as const;

/** 时间轴面板的只读输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前激活的 slide。 */
    slide?: Slide | null;
    /** 当前首个选中的节点 id，用来给新建 step 和 animation 提供默认目标。 */
    selectedNodeId?: string | null;
  }>(),
  {
    slide: null,
    selectedNodeId: null,
  },
);

/** 当前页面外部托管的折叠步骤 id 列表。 */
const collapsedStepIds = defineModel<string[]>("collapsedStepIds", {
  default: () => [],
});

/** 时间轴面板向外派发的标准化编辑意图。 */
const emit = defineEmits<{
  /** 新增或更新一个时间轴步骤。 */
  "upsert-step": [step: TimelineStep];
  /** 删除一个时间轴步骤。 */
  "remove-step": [stepId: string];
  /** 调整一个时间轴步骤的顺序。 */
  "reorder-step": [payload: TimelineStepReorderPayload];
  /** 复制一个时间轴步骤。 */
  "duplicate-step": [payload: TimelineStepDuplicatePayload];
  /** 从某个步骤开始切入预览。 */
  "preview-step": [stepIndex: number];
}>();

/** 当前是否已经有激活页面。 */
const hasSlide = computed(() => Boolean(props.slide));

/** 当前页面是否已经有对象可供 timeline 配置。 */
const hasNodes = computed(() => (props.slide?.nodes.length ?? 0) > 0);

/** 当前页面步骤数量，供头部批量操作和命名兜底复用。 */
const stepCount = computed(() => props.slide?.timeline.steps.length ?? 0);

/** 当前页面全部步骤 id，便于统一维护折叠状态。 */
const stepIdList = computed(() => props.slide?.timeline.steps.map((step) => step.id) ?? []);

/** 当前页面步骤列表，供拖拽排序逻辑复用。 */
const timelineSteps = computed(() => props.slide?.timeline.steps ?? []);

/** 当前页面的节点选项，供动作和动画配置下拉框复用。 */
const nodeOptions = computed(() =>
  (props.slide?.nodes ?? []).map((node) => ({
    value: node.id,
    label: node.name,
    detail: formatNodeTypeLabel(node.type),
  })),
);

/** 当前最适合作为默认目标节点的 id。 */
const preferredNodeId = computed(
  () => props.selectedNodeId ?? props.slide?.nodes[0]?.id ?? "",
);

/** 收敛时间轴步骤折叠逻辑，保持 UI 状态由外层托管。 */
const {
  handleToggleAllStepsCollapsed,
  handleToggleStepCollapsed,
  isEveryStepCollapsed,
  isStepCollapsed,
  showCollapseAllAction,
} = useTimelineStepCollapseState({
  stepIdList,
  collapsedStepIds,
});

/** 收敛时间轴步骤拖拽排序交互，排序结果继续走标准命令链路。 */
const {
  draggedStepId,
  dropState,
  handleDragOver,
  handleDragStart,
  handleDrop,
  resetDragState,
} = useTimelineStepDragSort({
  steps: timelineSteps,
  onReorderStep: (payload) => {
    emit("reorder-step", payload);
  },
});

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

/** 返回某个节点可以直接复用的第一条动画 id。 */
function resolveFirstAnimationIdForNode(targetId: string): string {
  return props.slide?.timeline.animations.find((animation) => animation.targetId === targetId)?.id ?? "";
}

/** 读取某个步骤中最适合作为触发对象候选的节点 id。 */
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

  return preferredNodeId.value;
}

/** 统一向外发出 step 更新。 */
function emitStep(step: TimelineStep): void {
  emit("upsert-step", step);
}

/** 新增一个步骤，默认用当前选中对象生成首条 show-node 动作。 */
function handleCreateStep(): void {
  if (!props.slide || !preferredNodeId.value) {
    return;
  }

  emitStep(
    createTimelineStep({
      name: `步骤 ${props.slide.timeline.steps.length + 1}`,
      actions: [
        createTimelineAction({
          type: "show-node",
          targetId: preferredNodeId.value,
          animationId: resolveFirstAnimationIdForNode(preferredNodeId.value) || undefined,
        }),
      ],
    }),
  );
}

/** 删除一个步骤。 */
function handleRemoveStep(stepId: string): void {
  emit("remove-step", stepId);
}

/** 上移或下移某个步骤。 */
function handleStepMove(stepId: string, stepIndex: number, offset: number): void {
  const stepCount = props.slide?.timeline.steps.length ?? 0;
  const nextIndex = Math.min(Math.max(stepIndex + offset, 0), Math.max(stepCount - 1, 0));

  if (nextIndex === stepIndex) {
    return;
  }

  emit("reorder-step", {
    stepId,
    index: nextIndex,
  });
}

/** 复制某个步骤，供外层在标准命令层中落盘。 */
function handleDuplicateStep(
  step: TimelineStep,
  stepIndex: number,
  name?: string,
): void {
  emit("duplicate-step", {
    step,
    index: stepIndex,
    name,
  });
}

/** 为“后插一步”生成更贴近当前上下文的新步骤名称。 */
function resolveFollowUpStepName(stepName: string): string {
  const normalizedStepName = stepName.trim() || `步骤 ${stepCount.value + 1}`;
  return normalizedStepName.endsWith("后续")
    ? `${normalizedStepName} 2`
    : `${normalizedStepName} 后续`;
}

/** 基于当前步骤快速后插一个新步骤，减少重复配置。 */
function handleCreateStepAfter(step: TimelineStep, stepIndex: number): void {
  handleDuplicateStep(step, stepIndex, resolveFollowUpStepName(step.name));
}

/** 请求外层从当前步骤切入预览。 */
function handlePreviewStep(stepIndex: number): void {
  emit("preview-step", stepIndex);
}

/** 读取某个步骤在列表头部应展示的全部摘要标签。 */
function resolveStepSummaryChips(step: TimelineStep) {
  return resolveTimelineStepSummaryChips(step, props.slide ?? null);
}

/** 更新步骤名称。 */
function handleStepNameInput(
  step: TimelineStep,
  value: string | number | undefined,
): void {
  emitStep({
    ...step,
    name: readTextInputValue(value, step.name),
  });
}

/** 更新步骤触发方式，并在 auto 时补默认延迟。 */
function handleStepTriggerTypeChange(
  step: TimelineStep,
  value: string | number | boolean | undefined,
): void {
  const nextTriggerType = readTextInputValue(
    value,
    step.trigger.type,
  ) as TimelineStep["trigger"]["type"];

  emitStep({
    ...step,
    trigger:
      nextTriggerType === "auto"
        ? {
            type: "auto",
            delayMs: step.trigger.type === "auto" ? step.trigger.delayMs : 600,
          }
        : nextTriggerType === "node-click"
          ? {
              type: "node-click",
              targetId:
                step.trigger.type === "node-click"
                  ? step.trigger.targetId
                  : resolvePrimaryActionTargetId(step),
            }
        : {
            type: "page-click",
          },
  });
}

/** 更新自动步骤的延迟时间。 */
function handleStepDelayChange(
  step: TimelineStep,
  value: number | string | undefined,
): void {
  if (step.trigger.type !== "auto") {
    return;
  }

  emitStep({
    ...step,
    trigger: {
      type: "auto",
      delayMs: readNumberInputValue(value, step.trigger.delayMs, 0),
    },
  });
}

/** 更新对象点击触发器的目标对象。 */
function handleStepTriggerTargetChange(
  step: TimelineStep,
  value: string | number | boolean | undefined,
): void {
  if (step.trigger.type !== "node-click") {
    return;
  }

  emitStep({
    ...step,
    trigger: {
      type: "node-click",
      targetId: readTextInputValue(value, step.trigger.targetId),
    },
  });
}

</script>

<template>
  <section class="timeline-panel">
    <div v-if="!hasSlide" class="group-card empty-card">
      <h4>未选择页面</h4>
      <p class="group-copy">选择页面后即可配置步骤和动作。</p>
    </div>

    <template v-else>
      <div v-if="!hasNodes" class="group-card empty-card">
        <h4>暂无可编排对象</h4>
        <p class="group-copy">先添加文本、矩形或图片。</p>
      </div>

      <section class="group-card">
        <div class="group-head">
          <h4>步骤</h4>
          <div class="group-head-actions">
            <a-button
              v-if="showCollapseAllAction"
              class="text-button"
              type="text"
              @click="handleToggleAllStepsCollapsed"
            >
              {{ isEveryStepCollapsed ? "全部展开" : "全部收起" }}
            </a-button>
            <a-button
              class="text-button"
              type="text"
              :disabled="!hasNodes"
              @click="handleCreateStep"
            >
              新建步骤
            </a-button>
          </div>
        </div>

        <div v-if="(slide?.timeline.steps.length ?? 0) > 0" class="step-list">
          <article
            v-for="(step, stepIndex) in slide?.timeline.steps ?? []"
            :key="step.id"
            class="step-card"
            :class="{
              'is-collapsed': isStepCollapsed(step.id),
              'is-dragging': draggedStepId === step.id,
              'is-drop-before': dropState?.stepId === step.id && dropState.placement === 'before',
              'is-drop-after': dropState?.stepId === step.id && dropState.placement === 'after',
            }"
            @dragover="handleDragOver(step.id, $event)"
            @drop="handleDrop(step.id, $event)"
          >
            <header
              class="card-head"
              draggable="true"
              @dragend="resetDragState"
              @dragstart="handleDragStart(step.id, $event)"
            >
              <div class="card-title-row">
                <div class="card-title-topline">
                  <span class="card-index">步骤 {{ String(stepIndex + 1).padStart(2, "0") }}</span>
                  <strong class="step-title">{{ step.name }}</strong>
                </div>
                <div class="step-summary-row">
                  <span
                    v-for="summaryChip in resolveStepSummaryChips(step)"
                    :key="summaryChip.key"
                    class="summary-chip"
                    :class="`is-${summaryChip.tone}`"
                  >
                    {{ summaryChip.label }}
                  </span>
                </div>
              </div>

              <div class="step-card-actions">
                <a-button
                  class="text-button step-collapse-button"
                  type="text"
                  size="mini"
                  @click="handleToggleStepCollapsed(step.id)"
                >
                  {{ isStepCollapsed(step.id) ? "展开" : "收起" }}
                </a-button>
                <a-button
                  class="text-button"
                  type="text"
                  size="mini"
                  :disabled="stepIndex === 0"
                  @click="handleStepMove(step.id, stepIndex, -1)"
                >
                  上移
                </a-button>
                <a-button
                  class="text-button"
                  type="text"
                  size="mini"
                  :disabled="stepIndex >= (slide?.timeline.steps.length ?? 1) - 1"
                  @click="handleStepMove(step.id, stepIndex, 1)"
                >
                  下移
                </a-button>
                <a-button
                  class="text-button"
                  type="text"
                  size="mini"
                  @click="handleCreateStepAfter(step, stepIndex)"
                >
                  后插一步
                </a-button>
                <a-button
                  class="text-button"
                  type="text"
                  size="mini"
                  @click="handleDuplicateStep(step, stepIndex)"
                >
                  复制
                </a-button>
                <a-button
                  class="text-button"
                  type="text"
                  size="mini"
                  @click="handlePreviewStep(stepIndex)"
                >
                  从此预览
                </a-button>
                <a-button
                  class="danger-text-button"
                  status="danger"
                  type="text"
                  size="mini"
                  @click="handleRemoveStep(step.id)"
                >
                  删除
                </a-button>
              </div>
            </header>

            <div v-if="!isStepCollapsed(step.id)" class="step-card-body">
              <div class="field-grid step-field-grid">
                <div class="field field-span-2">
                  <span class="field-label">名称</span>
                  <a-input class="field-input" :model-value="step.name" @input="handleStepNameInput(step, $event)" />
                </div>

                <div class="field">
                  <span class="field-label">触发</span>
                  <a-select class="field-input" :model-value="step.trigger.type" popup-container="body" @change="handleStepTriggerTypeChange(step, $event)">
                    <a-option v-for="option in triggerOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </a-option>
                  </a-select>
                </div>

                <div v-if="step.trigger.type === 'node-click'" class="field">
                  <span class="field-label">对象</span>
                  <a-select
                    class="field-input"
                    :model-value="step.trigger.targetId"
                    popup-container="body"
                    @change="handleStepTriggerTargetChange(step, $event)"
                  >
                    <a-option v-for="option in nodeOptions" :key="option.value" :value="option.value">
                      {{ option.label }} · {{ option.detail }}
                    </a-option>
                  </a-select>
                </div>

                <div v-if="step.trigger.type === 'auto'" class="field">
                  <span class="field-label">延迟(ms)</span>
                  <a-input-number
                    class="field-input"
                    min="0"
                    :model-value="step.trigger.delayMs"
                    @change="handleStepDelayChange(step, $event)"
                  />
                </div>
              </div>

              <TimelineStepActionsEditor
                :has-nodes="hasNodes"
                :selected-node-id="props.selectedNodeId"
                :slide="props.slide ?? null"
                :step="step"
                @update-step="emitStep"
              />
            </div>
          </article>
        </div>
        <p v-else class="panel-empty">暂无步骤。</p>
      </section>
    </template>
  </section>
</template>
<style scoped src="./TimelinePanel.css"></style>
