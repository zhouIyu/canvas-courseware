<script setup lang="ts">
import { computed } from "vue";
import type { Slide, TimelineStep } from "@canvas-courseware/core";
import { resolveTimelineStepHeadlineSummary } from "./timeline-step-summary";
import type {
  TimelineStepDuplicatePayload,
  TimelineStepMenuAction,
} from "./timeline-panel-types";
import type { TimelineStepReorderPayload } from "./useTimelineStepDragSort";
import { formatAnimationKindLabel, formatTimelineActionLabel } from "../shared";

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
    isDragging: false,
    dropPlacement: null,
    canMoveUp: false,
    canMoveDown: false,
  },
);

/** 步骤卡片向外派发的标准化编辑意图。 */
const emit = defineEmits<{
  /** 删除当前步骤。 */
  "remove-step": [stepId: string];
  /** 调整当前步骤顺序。 */
  "reorder-step": [payload: TimelineStepReorderPayload];
  /** 复制当前步骤。 */
  "duplicate-step": [payload: TimelineStepDuplicatePayload];
  /** 从当前步骤切入预览。 */
  "preview-step": [stepIndex: number];
  /** 打开当前步骤的设置抽屉。 */
  "open-settings": [stepId: string];
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

/** 当前步骤在展开态下需要展示的触发详情。 */
const triggerDetailText = computed(() => {
  const trigger = props.step.trigger;

  switch (trigger.type) {
    case "auto":
      return `当前步骤会在上一动作完成后延迟 ${trigger.delayMs}ms 自动触发。`;
    case "node-click": {
      const targetNodeName =
        props.slide?.nodes.find((node) => node.id === trigger.targetId)?.name ??
        "已删除对象";
      return `需要点击对象“${targetNodeName}”后才会继续。`;
    }
    case "page-click":
    default:
      return "当前步骤会在页面点击后继续执行。";
  }
});

/** 展开态下的动作摘要列表，方便快速浏览而不在卡片里堆满表单。 */
const actionSummaryItems = computed(() =>
  props.step.actions.map((action, actionIndex) => {
    if (action.type === "play-animation") {
      const matchedAnimation = props.slide?.timeline.animations.find(
        (animation) => animation.id === action.animationId,
      );
      const targetNodeName =
        matchedAnimation?.targetId
          ? props.slide?.nodes.find((node) => node.id === matchedAnimation.targetId)?.name ??
            "已删除对象"
          : "未关联对象";
      const animationLabel = matchedAnimation
        ? `${formatAnimationKindLabel(matchedAnimation.kind)} · ${matchedAnimation.durationMs}ms`
        : "动画已丢失";

      return {
        key: action.id,
        indexLabel: `动作 ${actionIndex + 1}`,
        text: `${formatTimelineActionLabel(action.type)} · ${targetNodeName} · ${animationLabel}`,
      };
    }

    const targetNodeName =
      props.slide?.nodes.find((node) => node.id === action.targetId)?.name ?? "已删除对象";
    return {
      key: action.id,
      indexLabel: `动作 ${actionIndex + 1}`,
      text: `${formatTimelineActionLabel(action.type)} · ${targetNodeName}`,
    };
  }),
);

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

/** 请求打开当前步骤设置抽屉。 */
function handleOpenSettings(): void {
  emit("open-settings", props.step.id);
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
            class="text-button step-action-button is-settings"
            type="text"
            size="mini"
            aria-label="打开步骤设置"
            @click="handleOpenSettings"
          >
            <template #icon>
              <icon-settings />
            </template>
          </a-button>
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
      <p class="step-detail-copy">{{ triggerDetailText }}</p>
      <div class="step-action-overview">
        <div
          v-for="actionSummary in actionSummaryItems"
          :key="actionSummary.key"
          class="step-action-overview__item"
        >
          <span class="step-action-overview__index">{{ actionSummary.indexLabel }}</span>
          <span class="step-action-overview__text">{{ actionSummary.text }}</span>
        </div>
      </div>
      <a-button class="step-settings-entry" type="outline" size="small" @click="handleOpenSettings">
        打开完整设置
      </a-button>
    </div>
  </article>
</template>

<style scoped src="./TimelineStepCard.css"></style>
