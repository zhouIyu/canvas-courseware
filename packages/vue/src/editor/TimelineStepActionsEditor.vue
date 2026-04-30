<script setup lang="ts">
import {
  createTimelineAction,
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

/** 动作编辑器的只读输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前步骤所属的 slide。 */
    slide?: Slide | null;
    /** 当前正在编辑的步骤。 */
    step: TimelineStep;
    /** 当前首个选中的节点 id，用来给新动作提供默认目标。 */
    selectedNodeId?: string | null;
    /** 当前页面是否已经存在可编排对象。 */
    hasNodes: boolean;
  }>(),
  {
    slide: null,
    selectedNodeId: null,
  },
);

/** 动作编辑器向外派发的步骤更新事件。 */
const emit = defineEmits<{
  /** 用最新动作配置回写整个步骤。 */
  "update-step": [step: TimelineStep];
}>();

/** 当前页面的节点选项，供动作目标对象下拉框复用。 */
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
    label: `${formatAnimationKindLabel(animation.kind)} · ${animation.durationMs}ms`,
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

/** 返回当前页面的第一条动画 id，供动作切换时兜底使用。 */
function resolveFirstAnimationId(): string {
  return props.slide?.timeline.animations[0]?.id ?? "";
}

/** 返回某个节点可以直接复用的第一条动画 id。 */
function resolveFirstAnimationIdForNode(targetId: string): string {
  return props.slide?.timeline.animations.find((animation) => animation.targetId === targetId)?.id ?? "";
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

/** 用统一出口回写最新步骤，避免父组件感知动作级实现细节。 */
function emitStep(step: TimelineStep): void {
  emit("update-step", step);
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
  actionId: string,
  updater: (action: TimelineAction) => TimelineAction,
): void {
  emitStep({
    ...props.step,
    actions: props.step.actions.map((action) => (action.id === actionId ? updater(action) : action)),
  });
}

/** 给当前步骤新增一条动作。 */
function handleAddAction(): void {
  emitStep({
    ...props.step,
    actions: [
      ...props.step.actions,
      createTimelineAction({
        type: "show-node",
        targetId: preferredNodeId.value,
        animationId: resolveFirstAnimationIdForNode(preferredNodeId.value) || undefined,
      }),
    ],
  });
}

/** 删除步骤中的一条动作。 */
function handleRemoveAction(actionId: string): void {
  emitStep({
    ...props.step,
    actions: props.step.actions.filter((action) => action.id !== actionId),
  });
}

/** 更新动作类型，并自动对齐目标节点和动画引用。 */
function handleActionTypeChange(
  actionId: string,
  value: string | number | boolean | undefined,
): void {
  const nextType = readTextInputValue(value) as TimelineAction["type"];

  updateStepAction(actionId, (action) => {
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
  actionId: string,
  value: string | number | boolean | undefined,
): void {
  const nextTargetId = readTextInputValue(value);

  updateStepAction(actionId, (action) => {
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
  actionId: string,
  value: string | number | boolean | undefined,
): void {
  const nextAnimationId = readTextInputValue(value);

  updateStepAction(actionId, (action) => {
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
  <div class="timeline-step-actions-editor">
    <div class="subsection-head">
      <strong>动作</strong>
      <a-button
        class="text-button"
        type="text"
        size="small"
        :disabled="!hasNodes"
        @click="handleAddAction"
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
            @click="handleRemoveAction(action.id)"
          >
            删除
          </a-button>
        </div>

        <div class="field-grid action-field-grid">
          <div class="field">
            <span class="field-label">类型</span>
            <a-select
              class="field-input"
              :model-value="action.type"
              popup-container="body"
              @change="handleActionTypeChange(action.id, $event)"
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
              @change="handleActionTargetChange(action.id, $event)"
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
              @change="handleActionAnimationChange(action.id, $event)"
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
                {{ option.label }}
              </a-option>
            </a-select>
          </div>
        </div>
      </article>
    </div>
    <p v-else class="panel-empty">暂无动作。</p>
  </div>
</template>

<style scoped src="./TimelineStepActionsEditor.css"></style>
