<script setup lang="ts">
import {
  createTimelineAction,
  createTimelineStep,
  type Slide,
  type TimelineAction,
  type TimelineStep,
} from "@canvas-courseware/core";
import { computed } from "vue";
import {
  formatAnimationKindLabel,
  formatNodeTypeLabel,
  formatTimelineActionLabel,
} from "../shared";

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

/** 时间轴动作类型选项。 */
const actionTypeOptions = [
  {
    label: formatTimelineActionLabel("show-node"),
    value: "show-node",
  },
  {
    label: formatTimelineActionLabel("hide-node"),
    value: "hide-node",
  },
  {
    label: formatTimelineActionLabel("play-animation"),
    value: "play-animation",
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

/** 时间轴面板向外派发的标准化编辑意图。 */
const emit = defineEmits<{
  /** 新增或更新一个时间轴步骤。 */
  "upsert-step": [step: TimelineStep];
  /** 删除一个时间轴步骤。 */
  "remove-step": [stepId: string];
}>();

/** 当前是否已经有激活页面。 */
const hasSlide = computed(() => Boolean(props.slide));

/** 当前页面是否已经有对象可供 timeline 配置。 */
const hasNodes = computed(() => (props.slide?.nodes.length ?? 0) > 0);

/** 当前页面的节点选项，供动作和动画配置下拉框复用。 */
const nodeOptions = computed(() =>
  (props.slide?.nodes ?? []).map((node) => ({
    value: node.id,
    label: node.name,
    detail: formatNodeTypeLabel(node.type),
  })),
);

/** 当前页面的动画选项，供动作和摘要展示复用。 */
const animationOptions = computed(() =>
  (props.slide?.timeline.animations ?? []).map((animation) => ({
    value: animation.id,
    targetId: animation.targetId,
    label: `${formatAnimationKindLabel(animation.kind)} · ${resolveNodeName(animation.targetId)}`,
    detail: `${animation.durationMs}ms`,
  })),
);

/** 当前最适合作为默认目标节点的 id。 */
const preferredNodeId = computed(
  () => props.selectedNodeId ?? props.slide?.nodes[0]?.id ?? "",
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

/** 根据节点 id 解析一个更适合 UI 展示的节点名称。 */
function resolveNodeName(nodeId: string): string {
  const node = props.slide?.nodes.find((item) => item.id === nodeId);
  return node?.name ?? "未匹配对象";
}

/** 返回当前页面的第一条动画 id，供动作切换时兜底使用。 */
function resolveFirstAnimationId(): string {
  return props.slide?.timeline.animations[0]?.id ?? "";
}

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

/** 统一根据 union 字段重建 timeline 动作，避免分支更新时漏字段。 */
function buildTimelineAction(
  actionId: string,
  type: TimelineAction["type"],
  options: {
    targetId?: string;
    animationId?: string;
  },
): TimelineAction {
  switch (type) {
    case "hide-node":
      return {
        id: actionId,
        type,
        targetId: options.targetId ?? "",
      };
    case "play-animation":
      return {
        id: actionId,
        type,
        animationId: options.animationId ?? "",
      };
    case "show-node":
    default:
      return {
        id: actionId,
        type: "show-node",
        targetId: options.targetId ?? "",
        animationId: options.animationId || undefined,
      };
  }
}

/** 统一向外发出 step 更新。 */
function emitStep(step: TimelineStep): void {
  emit("upsert-step", step);
}

/** 计算某个动作在当前表单里可选的动画列表。 */
function resolveAnimationOptionsForAction(action: TimelineAction) {
  if (action.type === "show-node") {
    return animationOptions.value.filter((animation) => animation.targetId === action.targetId);
  }

  if (action.type === "play-animation") {
    return animationOptions.value;
  }

  return [];
}

/** 读取动作当前真正可用的动画值，避免 show-node 选到别的对象的动画。 */
function resolveActionAnimationValue(action: TimelineAction): string {
  if (action.type === "play-animation") {
    return action.animationId;
  }

  if (action.type !== "show-node" || !action.animationId) {
    return "";
  }

  const matchedAnimation = props.slide?.timeline.animations.find(
    (animation) =>
      animation.id === action.animationId && animation.targetId === action.targetId,
  );

  return matchedAnimation?.id ?? "";
}

/** 读取动作当前最合理的目标节点。 */
function resolveActionTargetId(action: TimelineAction): string {
  if (action.type === "show-node" || action.type === "hide-node") {
    return action.targetId;
  }

  const animation = props.slide?.timeline.animations.find(
    (item) => item.id === action.animationId,
  );
  return animation?.targetId ?? preferredNodeId.value;
}

/** 在某个步骤中替换指定动作，并保持其余动作顺序不变。 */
function updateStepAction(
  step: TimelineStep,
  actionId: string,
  updater: (action: TimelineAction) => TimelineAction,
): void {
  emitStep({
    ...step,
    actions: step.actions.map((action) => (action.id === actionId ? updater(action) : action)),
  });
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

/** 给某个步骤新增一条动作。 */
function handleAddAction(step: TimelineStep): void {
  emitStep({
    ...step,
    actions: [
      ...step.actions,
      createTimelineAction({
        type: "show-node",
        targetId: preferredNodeId.value,
        animationId: resolveFirstAnimationIdForNode(preferredNodeId.value) || undefined,
      }),
    ],
  });
}

/** 删除步骤中的一条动作。 */
function handleRemoveAction(step: TimelineStep, actionId: string): void {
  emitStep({
    ...step,
    actions: step.actions.filter((action) => action.id !== actionId),
  });
}

/** 更新动作类型，并自动对齐目标节点和动画引用。 */
function handleActionTypeChange(
  step: TimelineStep,
  actionId: string,
  value: string | number | boolean | undefined,
): void {
  const nextType = readTextInputValue(value) as TimelineAction["type"];

  updateStepAction(step, actionId, (action) => {
    const currentTargetId = resolveActionTargetId(action) || preferredNodeId.value;
    const currentAnimationId =
      action.type === "show-node" || action.type === "play-animation"
        ? action.animationId
        : undefined;
    const nextAnimationId =
      nextType === "show-node"
        ? resolveFirstAnimationIdForNode(currentTargetId) || undefined
        : currentAnimationId || resolveFirstAnimationId() || undefined;

    return buildTimelineAction(action.id, nextType, {
      targetId: currentTargetId,
      animationId: nextAnimationId,
    });
  });
}

/** 更新动作目标节点，并在 show-node 时自动收敛到同目标动画。 */
function handleActionTargetChange(
  step: TimelineStep,
  actionId: string,
  value: string | number | boolean | undefined,
): void {
  const nextTargetId = readTextInputValue(value);

  updateStepAction(step, actionId, (action) => {
    if (action.type !== "show-node" && action.type !== "hide-node") {
      return action;
    }

    return buildTimelineAction(action.id, action.type, {
      targetId: nextTargetId,
      animationId:
        action.type === "show-node"
          ? resolveFirstAnimationIdForNode(nextTargetId) || undefined
          : undefined,
    });
  });
}

/** 更新动作关联动画。 */
function handleActionAnimationChange(
  step: TimelineStep,
  actionId: string,
  value: string | number | boolean | undefined,
): void {
  const nextAnimationId = readTextInputValue(value);

  updateStepAction(step, actionId, (action) => {
    if (action.type === "hide-node") {
      return action;
    }

    return buildTimelineAction(action.id, action.type, {
      targetId: resolveActionTargetId(action),
      animationId: nextAnimationId || undefined,
    });
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
          <a-button
            class="soft-button"
            type="outline"
            :disabled="!hasNodes"
            @click="handleCreateStep"
          >
            新建步骤
          </a-button>
        </div>

        <div v-if="(slide?.timeline.steps.length ?? 0) > 0" class="step-list">
          <article
            v-for="(step, stepIndex) in slide?.timeline.steps ?? []"
            :key="step.id"
            class="step-card"
          >
            <header class="card-head">
              <div class="card-title-row">
                <span class="card-index">步骤 {{ String(stepIndex + 1).padStart(2, "0") }}</span>
              </div>

              <a-button class="danger-button" status="danger" type="outline" @click="handleRemoveStep(step.id)">删除步骤</a-button>
            </header>

            <div class="field-grid">
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

            <div class="subsection-head">
              <strong>动作</strong>
              <a-button
                class="ghost-button"
                type="outline"
                size="small"
                :disabled="!hasNodes"
                @click="handleAddAction(step)"
              >
                添加动作
              </a-button>
            </div>

            <div v-if="step.actions.length > 0" class="action-list">
              <article
                v-for="(action, actionIndex) in step.actions"
                :key="action.id"
                class="action-card"
              >
                <div class="action-head">
                  <div class="action-copy">
                    <strong>动作 {{ actionIndex + 1 }}</strong>
                  </div>
                  <a-button
                    class="danger-text-button"
                    status="danger"
                    type="text"
                    @click="handleRemoveAction(step, action.id)"
                  >
                    删除
                  </a-button>
                </div>

                <div class="field-grid">
                  <div class="field">
                    <span class="field-label">类型</span>
                    <a-select
                      class="field-input"
                      :model-value="action.type"
                      popup-container="body"
                      @change="handleActionTypeChange(step, action.id, $event)"
                    >
                      <a-option
                        v-for="option in actionTypeOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </div>

                  <div v-if="action.type !== 'play-animation'" class="field">
                    <span class="field-label">对象</span>
                    <a-select
                      class="field-input"
                      :model-value="resolveActionTargetId(action)"
                      popup-container="body"
                      @change="handleActionTargetChange(step, action.id, $event)"
                    >
                      <a-option v-for="option in nodeOptions" :key="option.value" :value="option.value">
                        {{ option.label }} · {{ option.detail }}
                      </a-option>
                    </a-select>
                  </div>

                  <div
                    v-if="action.type !== 'hide-node'"
                    class="field"
                    :class="{ 'field-span-2': action.type === 'play-animation' }"
                  >
                    <span class="field-label">动画</span>
                    <a-select
                      class="field-input"
                      :model-value="resolveActionAnimationValue(action)"
                      popup-container="body"
                      @change="handleActionAnimationChange(step, action.id, $event)"
                    >
                      <a-option v-if="action.type === 'show-node'" value="">无</a-option>
                      <a-option
                        v-if="action.type === 'play-animation' && resolveAnimationOptionsForAction(action).length === 0"
                        value=""
                      >
                        请先到组件属性中创建动画
                      </a-option>
                      <a-option
                        v-for="option in resolveAnimationOptionsForAction(action)"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }} · {{ option.detail }}
                      </a-option>
                    </a-select>
                  </div>
                </div>
              </article>
            </div>
            <p v-else class="panel-empty">暂无动作。</p>
          </article>
        </div>
        <p v-else class="panel-empty">暂无步骤。</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.timeline-panel {
  display: grid;
  gap: var(--cw-space-3);
  padding: var(--cw-space-4);
  border: 1px solid var(--cw-color-border);
  border-radius: var(--cw-radius-lg);
  background:
    linear-gradient(180deg, rgba(22, 93, 255, 0.04), rgba(255, 255, 255, 0.98)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-weak);
}

.group-head,
.card-head,
.subsection-head,
.action-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cw-space-3);
}

.group-head h4 {
  margin: 0;
}

.group-card,
.step-card,
.animation-card,
.action-card {
  display: grid;
  gap: var(--cw-space-2);
  padding: 14px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-md);
  background: rgba(255, 255, 255, 0.92);
}

.card-index {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 var(--cw-space-3);
  border-radius: var(--cw-radius-pill);
  font-size: 13px;
  color: var(--cw-color-text);
  background: rgba(19, 78, 74, 0.08);
}

.card-index.subtle {
  color: var(--cw-color-primary);
  background: rgba(22, 93, 255, 0.12);
}

.group-copy,
.panel-empty {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.step-list,
.animation-list,
.action-list {
  display: grid;
  gap: var(--cw-space-2);
}

.card-title-row,
.action-copy {
  display: grid;
  gap: var(--cw-space-2);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-2);
}

.field {
  display: grid;
  gap: 6px;
}

.advanced-fields {
  margin: 0;
  padding: 12px;
  border: 1px dashed rgba(22, 93, 255, 0.24);
  border-radius: var(--cw-radius-md);
  background: rgba(248, 250, 252, 0.72);
}

.advanced-fields > summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-color-muted);
}

.advanced-fields[open] > summary {
  margin-bottom: var(--cw-space-2);
}

.advanced-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-2);
}

.field-span-2 {
  grid-column: span 2;
}

.field-label {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--cw-color-muted);
}

.field-input {
  width: 100%;
}

.field-input:deep(.arco-input-wrapper),
.field-input:deep(.arco-select-view),
.field-input:deep(.arco-input-number) {
  width: 100%;
  min-height: 40px;
}

.soft-button,
.ghost-button,
.danger-button,
.danger-text-button {
  min-height: 38px;
  font-size: 13px;
}

.danger-text-button {
  min-height: 32px;
}

.empty-card {
  text-align: left;
}

@media (max-width: 768px) {
  .timeline-panel,
  .group-card,
  .step-card,
  .animation-card,
  .action-card {
    padding: var(--cw-space-4);
  }

  .summary-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .advanced-grid {
    grid-template-columns: 1fr;
  }

  .field-span-2 {
    grid-column: span 1;
  }

  .panel-head,
  .group-head,
  .card-head,
  .subsection-head,
  .action-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
