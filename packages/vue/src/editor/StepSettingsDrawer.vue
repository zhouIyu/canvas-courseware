<script setup lang="ts">
import type { Slide, TimelineStep } from "@canvas-courseware/core";
import StepSettingsForm from "./StepSettingsForm.vue";

/** 步骤设置抽屉的输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前抽屉是否打开。 */
    visible?: boolean;
    /** 当前步骤所属的 slide。 */
    slide?: Slide | null;
    /** 当前正在编辑的步骤。 */
    step?: TimelineStep | null;
    /** 当前步骤在列表中的索引。 */
    stepIndex?: number;
    /** 当前 slide 的总步骤数。 */
    stepCount?: number;
    /** 当前首个选中的节点 id，用来补默认触发目标。 */
    selectedNodeId?: string | null;
    /** 当前页面是否已经存在可编排对象。 */
    hasNodes?: boolean;
  }>(),
  {
    visible: false,
    slide: null,
    step: null,
    stepIndex: 0,
    stepCount: 0,
    selectedNodeId: null,
    hasNodes: false,
  },
);

/** 步骤设置抽屉向外抛出的交互事件。 */
const emit = defineEmits<{
  /** 请求关闭当前抽屉。 */
  close: [];
  /** 用最新配置回写整个步骤。 */
  "update-step": [step: TimelineStep];
}>();

/** 关闭步骤设置抽屉。 */
const handleClose = () => {
  emit("close");
};

/** 把表单里的最新步骤配置继续透传给外层标准命令入口。 */
const handleStepUpdate = (step: TimelineStep) => {
  emit("update-step", step);
};
</script>

<template>
  <a-drawer
    :closable="true"
    :footer="false"
    :mask="true"
    :visible="props.visible"
    class="step-settings-drawer"
    placement="right"
    title="步骤设置"
    width="420px"
    @cancel="handleClose"
  >
    <div class="step-settings-drawer__body">
      <StepSettingsForm
        v-if="props.step"
        :has-nodes="props.hasNodes"
        :selected-node-id="props.selectedNodeId"
        :slide="props.slide ?? null"
        :step="props.step"
        :step-count="props.stepCount"
        :step-index="props.stepIndex"
        @update-step="handleStepUpdate"
      />
      <div v-else class="step-settings-drawer__empty">
        <strong>未找到步骤</strong>
        <p>当前步骤可能已被删除或切换页面，请关闭抽屉后重新选择。</p>
      </div>
    </div>
  </a-drawer>
</template>

<style scoped>
.step-settings-drawer :deep(.arco-drawer-mask) {
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(2px);
}

.step-settings-drawer :deep(.arco-drawer) {
  background:
    linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(244, 247, 251, 0.98));
}

.step-settings-drawer :deep(.arco-drawer-header) {
  min-height: 64px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.step-settings-drawer :deep(.arco-drawer-title) {
  font-size: 18px;
  font-weight: 700;
}

.step-settings-drawer :deep(.arco-drawer-body) {
  padding: 0;
  background: transparent;
}

.step-settings-drawer__body {
  padding: 16px;
}

.step-settings-drawer__empty {
  display: grid;
  gap: 8px;
  padding: 24px;
  border: 1px dashed rgba(15, 23, 42, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
}

.step-settings-drawer__empty strong {
  font-size: 16px;
}

.step-settings-drawer__empty p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}
</style>
