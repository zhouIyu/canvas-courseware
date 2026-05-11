<script setup lang="ts">
import {
  createTimelineAction,
  createTimelineStep,
  type Slide,
  type TimelineStep,
} from "@canvas-courseware/core";
import { computed } from "vue";
import TimelineStepCard from "./TimelineStepCard.vue";
import type { TimelineStepDuplicatePayload } from "./timeline-panel-types";
import {
  useTimelineStepDragSort,
  type TimelineStepReorderPayload,
} from "./useTimelineStepDragSort";
import { useTimelineStepCollapseState } from "./useTimelineStepCollapseState";

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

/** 返回某个节点可以直接复用的第一条动画 id。 */
function resolveFirstAnimationIdForNode(targetId: string): string {
  return props.slide?.timeline.animations.find((animation) => animation.targetId === targetId)?.id ?? "";
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

/** 复制某个步骤，供外层在标准命令层中落盘。 */
function handleDuplicateStep(payload: TimelineStepDuplicatePayload): void {
  emit("duplicate-step", payload);
}

/** 请求外层从当前步骤切入预览。 */
function handlePreviewStep(stepIndex: number): void {
  emit("preview-step", stepIndex);
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
          <TimelineStepCard
            v-for="(step, stepIndex) in slide?.timeline.steps ?? []"
            :key="step.id"
            :can-move-down="stepIndex < (slide?.timeline.steps.length ?? 1) - 1"
            :can-move-up="stepIndex > 0"
            :drop-placement="dropState?.stepId === step.id ? dropState.placement : null"
            :has-nodes="hasNodes"
            :is-collapsed="isStepCollapsed(step.id)"
            :is-dragging="draggedStepId === step.id"
            :selected-node-id="props.selectedNodeId"
            :slide="props.slide ?? null"
            :step="step"
            :step-count="stepCount"
            :step-index="stepIndex"
            @drag-end="resetDragState"
            @drag-over="handleDragOver(step.id, $event)"
            @drag-start="handleDragStart(step.id, $event)"
            @drop="handleDrop(step.id, $event)"
            @duplicate-step="handleDuplicateStep"
            @preview-step="handlePreviewStep"
            @remove-step="handleRemoveStep"
            @reorder-step="emit('reorder-step', $event)"
            @toggle-collapsed="handleToggleStepCollapsed(step.id)"
            @update-step="emitStep"
          />
        </div>
        <p v-else class="panel-empty">暂无步骤。</p>
      </section>
    </template>
  </section>
</template>
<style scoped src="./TimelinePanel.css"></style>
