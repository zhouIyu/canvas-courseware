<script setup lang="ts">
import type { ObjectFit } from "@canvas-courseware/core";
import { computed, ref, watch } from "vue";
import {
  BACKGROUND_IMAGE_FIT_OPTIONS,
  normalizeBackgroundImageFit,
} from "../shared";

/** 背景图填充方式确认弹层的输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前弹层是否展示。 */
    visible?: boolean;
    /** 打开弹层时默认选中的填充方式。 */
    initialFit?: ObjectFit;
    /** 当前待处理资源的来源说明。 */
    sourceLabel?: string;
    /** 当前确认动作是否处于提交中。 */
    confirmLoading?: boolean;
  }>(),
  {
    visible: false,
    initialFit: "cover",
    sourceLabel: "当前图片",
    confirmLoading: false,
  },
);

/** 背景图填充方式确认弹层向外派发的事件。 */
const emit = defineEmits<{
  /** 用户点击确认后，把最终选中的填充方式回传给父层。 */
  confirm: [fit: ObjectFit];
  /** 用户取消本次“设为背景”流程。 */
  cancel: [];
}>();

/** 弹层内部维护的填充方式草稿。 */
const draftFit = ref<ObjectFit>(props.initialFit);

/** 当前选中项的完整配置，便于展示说明文案。 */
const activeOption = computed(
  () =>
    BACKGROUND_IMAGE_FIT_OPTIONS.find((option) => option.value === draftFit.value) ??
    BACKGROUND_IMAGE_FIT_OPTIONS[0],
);

/** 在弹层每次打开时，把内部草稿重置为父层传入的默认值。 */
const syncDraftFit = () => {
  draftFit.value = normalizeBackgroundImageFit(props.initialFit, "cover");
};

/** 处理单个填充方式卡片的点击。 */
const handleFitSelect = (fit: ObjectFit) => {
  draftFit.value = fit;
};

/** 处理弹层右下角确认按钮。 */
const handleConfirm = () => {
  emit("confirm", draftFit.value);
};

/** 监听弹层显隐，在重新打开时恢复默认草稿。 */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      return;
    }

    syncDraftFit();
  },
);
</script>

<template>
  <a-modal
    :visible="props.visible"
    :confirm-loading="props.confirmLoading"
    :mask-closable="false"
    class="background-fit-modal"
    title="选择背景填充方式"
    ok-text="确认设为背景"
    cancel-text="取消"
    @cancel="emit('cancel')"
    @ok="handleConfirm"
  >
    <div class="background-fit-modal__body">
      <section class="background-fit-modal__summary">
        <div class="background-fit-modal__copy">
          <span class="background-fit-modal__label">当前来源</span>
          <h3>{{ props.sourceLabel }}</h3>
          <p>确认后会把当前图片写入页面背景，并保留页面设置中的后续手动调整能力。</p>
        </div>
        <a-tag color="arcoblue" bordered>{{ activeOption.label }}</a-tag>
      </section>

      <section class="background-fit-modal__options">
        <button
          v-for="option in BACKGROUND_IMAGE_FIT_OPTIONS"
          :key="option.value"
          type="button"
          class="background-fit-option"
          :class="{ 'background-fit-option--active': draftFit === option.value }"
          @click="handleFitSelect(option.value)"
        >
          <div class="background-fit-option__header">
            <strong>{{ option.label }}</strong>
            <span>{{ option.value }}</span>
          </div>
          <p>{{ option.description }}</p>
        </button>
      </section>

      <p class="background-fit-modal__hint">
        竖图或信息图建议优先选择“完整显示”，避免默认铺满时主体被过度裁切。
      </p>
    </div>
  </a-modal>
</template>

<style scoped>
.background-fit-modal__body {
  display: grid;
  gap: 18px;
}

.background-fit-modal__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(22, 93, 255, 0.06), rgba(255, 255, 255, 0.96));
}

.background-fit-modal__copy {
  display: grid;
  gap: 6px;
}

.background-fit-modal__copy h3,
.background-fit-modal__copy p {
  margin: 0;
}

.background-fit-modal__label {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: 0.06em;
  color: var(--cw-color-muted);
  text-transform: uppercase;
}

.background-fit-modal__copy h3 {
  font-size: 18px;
  line-height: 1.4;
  color: var(--cw-color-text);
}

.background-fit-modal__copy p {
  font-size: 13px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.background-fit-modal__options {
  display: grid;
  gap: 12px;
}

.background-fit-option {
  display: grid;
  gap: 8px;
  width: 100%;
  padding: 16px;
  border: 1px solid rgba(19, 78, 74, 0.1);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.background-fit-option:hover {
  border-color: rgba(22, 93, 255, 0.28);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.background-fit-option--active {
  border-color: rgba(22, 93, 255, 0.48);
  background: linear-gradient(180deg, rgba(22, 93, 255, 0.08), rgba(255, 255, 255, 0.96));
  box-shadow: 0 16px 36px rgba(22, 93, 255, 0.12);
}

.background-fit-option__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.background-fit-option__header strong {
  font-size: 15px;
  line-height: 1.4;
  color: var(--cw-color-text);
}

.background-fit-option__header span {
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-muted);
  text-transform: uppercase;
}

.background-fit-option p,
.background-fit-modal__hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

@media (max-width: 640px) {
  .background-fit-modal__summary {
    flex-direction: column;
  }
}
</style>
