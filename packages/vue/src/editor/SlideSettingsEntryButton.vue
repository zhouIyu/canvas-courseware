<script setup lang="ts">
import { computed } from "vue";

/** 页面设置入口按钮的输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前激活页的 1-based 页序。 */
    slideIndex?: number | null;
  }>(),
  {
    slideIndex: null,
  },
);

/** 页面设置入口按钮对外抛出的事件。 */
const emit = defineEmits<{
  /** 请求打开当前页设置抽屉。 */
  open: [];
}>();

/** 当前入口按钮是否应处于禁用态。 */
const isDisabled = computed(() => !props.slideIndex);

/** 点击按钮时统一抛出打开抽屉意图。 */
const handleOpen = () => {
  if (isDisabled.value) {
    return;
  }

  emit("open");
};
</script>

<template>
  <a-button
    class="slide-settings-entry"
    :disabled="isDisabled"
    aria-label="打开页面设置"
    size="small"
    type="outline"
    @click="handleOpen"
  >
    <template #icon>
      <icon-settings />
    </template>
  </a-button>
</template>

<style scoped>
.slide-settings-entry {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow:
    0 10px 24px rgba(15, 23, 42, 0.08),
    0 1px 2px rgba(15, 23, 42, 0.04);
}

.slide-settings-entry:hover {
  color: var(--cw-color-primary);
  border-color: rgba(22, 93, 255, 0.28);
  background: rgba(244, 249, 255, 0.98);
}

.slide-settings-entry:deep(.arco-btn-icon) {
  font-size: 18px;
}
</style>
