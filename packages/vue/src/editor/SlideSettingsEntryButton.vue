<script setup lang="ts">
import { computed } from "vue";

/** 页面设置入口按钮的输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前激活页名称。 */
    slideName?: string | null;
    /** 当前激活页的 1-based 页序。 */
    slideIndex?: number | null;
  }>(),
  {
    slideName: null,
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

/** 页面设置入口里展示的页序标签。 */
const slideIndexLabel = computed(() =>
  props.slideIndex ? `P${props.slideIndex}` : "未选择页面",
);

/** 页面设置入口里展示的当前页名称。 */
const slideNameLabel = computed(() =>
  props.slideName?.trim() || "请先选择一个页面",
);

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

    <span class="slide-settings-entry__content">
      <span class="slide-settings-entry__title">当前页设置</span>
      <span class="slide-settings-entry__meta">{{ slideIndexLabel }} · {{ slideNameLabel }}</span>
    </span>
  </a-button>
</template>

<style scoped>
.slide-settings-entry {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: min(240px, 100%);
  min-height: 38px;
  padding-inline: 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.slide-settings-entry:deep(.arco-btn-content) {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.slide-settings-entry__content {
  display: grid;
  min-width: 0;
  gap: 1px;
  text-align: left;
}

.slide-settings-entry__title,
.slide-settings-entry__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slide-settings-entry__title {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cw-color-text);
}

.slide-settings-entry__meta {
  font-size: 11px;
  line-height: 1.4;
  color: var(--cw-color-muted);
}
</style>
