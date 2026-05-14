<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** 空态主标题。 */
    title: string;
    /** 空态补充说明，控制在 1-2 行。 */
    description?: string;
    /** 主操作按钮文案。 */
    actionText?: string;
    /** 操作按钮是否使用主色强调。 */
    actionType?: "primary" | "outline" | "text";
    /** 当前是否使用紧凑布局。 */
    compact?: boolean;
  }>(),
  {
    description: "",
    actionText: "",
    actionType: "primary",
    compact: false,
  },
);

defineEmits<{
  /** 用户点击空态主操作。 */
  action: [];
}>();
</script>

<template>
  <div class="cw-empty-state" :class="{ 'is-compact': props.compact }">
    <div v-if="$slots.icon" class="cw-empty-state__icon" aria-hidden="true">
      <slot name="icon" />
    </div>

    <div class="cw-empty-state__content">
      <strong class="cw-empty-state__title">{{ props.title }}</strong>
      <p v-if="props.description" class="cw-empty-state__description">
        {{ props.description }}
      </p>
    </div>

    <a-button
      v-if="props.actionText"
      class="cw-empty-state__action"
      :type="props.actionType"
      @click="$emit('action')"
    >
      {{ props.actionText }}
    </a-button>
  </div>
</template>

<style scoped>
.cw-empty-state {
  display: grid;
  justify-items: center;
  gap: var(--cw-space-3);
  max-width: 20rem;
  margin: 0 auto;
  padding: var(--cw-space-6);
  border: 1px dashed color-mix(in srgb, var(--cw-color-primary) 26%, transparent);
  border-radius: var(--cw-radius-lg);
  background: rgba(255, 255, 255, 0.88);
  text-align: center;
}

.cw-empty-state.is-compact {
  gap: var(--cw-space-2);
  padding: var(--cw-space-5);
}

.cw-empty-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 18px;
  color: var(--cw-color-primary);
  background: color-mix(in srgb, var(--cw-color-primary-soft) 88%, #ffffff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cw-color-primary) 14%, transparent);
  font-size: 26px;
}

.cw-empty-state.is-compact .cw-empty-state__icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  font-size: 22px;
}

.cw-empty-state__content {
  display: grid;
  gap: 6px;
}

.cw-empty-state__title {
  font-size: 16px;
  line-height: 1.4;
  color: var(--cw-color-text);
}

.cw-empty-state__description {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--cw-color-muted);
}

.cw-empty-state__action {
  min-width: 112px;
}
</style>
