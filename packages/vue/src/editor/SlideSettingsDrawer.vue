<script setup lang="ts">
import type { Slide } from "@canvas-courseware/core";
import SlideSettingsPanel from "./SlideSettingsPanel.vue";
import type {
  SlideSettingsFeedbackTone,
  SlideSettingsSection,
} from "./useSlideSettingsDrawer";

/** 页面设置抽屉的输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前抽屉是否打开。 */
    visible?: boolean;
    /** 当前激活的 slide。 */
    slide?: Slide | null;
    /** 当前激活页的 1-based 页序。 */
    slideIndex?: number | null;
    /** 当前文档的页面总数。 */
    slideCount?: number;
    /** 当前抽屉优先聚焦的分组。 */
    preferredSection?: SlideSettingsSection;
    /** 用于驱动面板重置展开状态的焦点 token。 */
    focusToken?: number;
    /** 抽屉顶部反馈条要展示的提示文案。 */
    feedbackMessage?: string | null;
    /** 抽屉顶部反馈条要采用的语气。 */
    feedbackTone?: SlideSettingsFeedbackTone;
  }>(),
  {
    visible: false,
    slide: null,
    slideIndex: null,
    slideCount: 0,
    preferredSection: "basic",
    focusToken: 0,
    feedbackMessage: null,
    feedbackTone: "info",
  },
);

/** 页面设置抽屉向外抛出的交互事件。 */
const emit = defineEmits<{
  /** 请求关闭当前页面设置抽屉。 */
  close: [];
  /** 更新当前页面的基础信息。 */
  "update-slide": [patch: Partial<Pick<Slide, "name" | "size" | "background">>];
}>();

/** 关闭页面设置抽屉。 */
const handleClose = () => {
  emit("close");
};

/** 把页面设置里的编辑结果继续抛给外层标准命令入口。 */
const handleSlideUpdate = (
  patch: Partial<Pick<Slide, "name" | "size" | "background">>,
) => {
  emit("update-slide", patch);
};
</script>

<template>
  <a-drawer
    :closable="true"
    :footer="false"
    :mask="false"
    :visible="props.visible"
    class="slide-settings-drawer"
    placement="right"
    title="当前页设置"
    width="380px"
    @cancel="handleClose"
  >
    <div class="slide-settings-drawer__body">
      <SlideSettingsPanel
        :feedback-message="props.feedbackMessage"
        :feedback-tone="props.feedbackTone"
        :focus-token="props.focusToken"
        :preferred-section="props.preferredSection"
        :slide="props.slide"
        :slide-count="props.slideCount"
        :slide-index="props.slideIndex"
        @update-slide="handleSlideUpdate"
      />
    </div>
  </a-drawer>
</template>

<style scoped>
.slide-settings-drawer :deep(.arco-drawer-body) {
  padding: 0;
  background: #f6f8fb;
}

.slide-settings-drawer__body {
  padding: 16px;
}
</style>
