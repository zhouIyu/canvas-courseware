import type { ObjectFit, Slide } from "@canvas-courseware/core";
import { computed, ref, type ComputedRef } from "vue";
import {
  DEFAULT_BACKGROUND_IMAGE_FIT,
  normalizeBackgroundImageFit,
} from "../shared";

/** 页面设置抽屉支持聚焦的分组 key。 */
export type SlideSettingsSection = "basic" | "background";

/** 页面设置抽屉反馈条支持的语气类型。 */
export type SlideSettingsFeedbackTone = "info" | "success";

/** “设为背景”确认弹层中暂存的来源信息。 */
interface PendingBackgroundImageAction {
  /** 当前待写入为页面背景的节点 id。 */
  nodeId: string;
  /** 反馈与确认弹层里展示给用户的来源摘要。 */
  sourceLabel: string;
  /** 当前来源建议采用的背景图填充方式。 */
  preferredFit: ObjectFit;
}

/** 打开页面设置抽屉时可携带的上下文参数。 */
export interface OpenSlideSettingsDrawerOptions {
  /** 当前希望默认展开的页面设置分组。 */
  section?: SlideSettingsSection;
  /** 抽屉顶部反馈条要展示的提示文案。 */
  feedbackMessage?: string | null;
  /** 抽屉顶部反馈条采用的语气。 */
  feedbackTone?: SlideSettingsFeedbackTone;
}

/** “设为背景”快捷链路传入的节点来源信息。 */
export interface OpenBackgroundImageFitModalOptions {
  /** 当前待设为背景的节点 id。 */
  nodeId: string;
  /** 用户可理解的来源文案。 */
  sourceLabel: string;
  /** 当前节点建议沿用的图片铺满方式。 */
  preferredFit?: ObjectFit | null;
}

/** 页面设置抽屉 composable 的输入参数。 */
export interface UseSlideSettingsDrawerOptions {
  /** 当前激活的 slide，用于在切页时同步清理上下文。 */
  activeSlide: ComputedRef<Slide | undefined>;
  /** 真正执行“设为背景”的标准命令入口。 */
  setSlideBackgroundImageFromNode: (
    nodeId: string,
    preferredFit?: ObjectFit,
  ) => string | null;
}

/**
 * 收口页面设置抽屉和“设为背景”快捷链路的状态。
 * 这样编辑器壳层只负责接线，不需要继续堆叠页面级 UI 细节。
 */
export function useSlideSettingsDrawer(options: UseSlideSettingsDrawerOptions) {
  /** 当前页面设置抽屉是否可见。 */
  const isSlideSettingsDrawerVisible = ref(false);

  /** 当前页面设置抽屉希望优先聚焦的分组。 */
  const slideSettingsPreferredSection = ref<SlideSettingsSection>("basic");

  /** 每次切换抽屉上下文时自增，驱动子组件重置展开状态。 */
  const slideSettingsFocusToken = ref(0);

  /** 页面设置抽屉顶部当前反馈文案。 */
  const slideSettingsFeedbackMessage = ref<string | null>(null);

  /** 页面设置抽屉顶部当前反馈语气。 */
  const slideSettingsFeedbackTone = ref<SlideSettingsFeedbackTone>("info");

  /** “设为背景”流程中暂存的待确认操作。 */
  const pendingBackgroundImageAction = ref<PendingBackgroundImageAction | null>(null);

  /** 当前“设为背景”确认动作是否正在提交。 */
  const isApplyingBackgroundImageFit = ref(false);

  /** 当前“设为背景”确认弹层是否展示。 */
  const isBackgroundImageFitModalVisible = computed(() =>
    Boolean(pendingBackgroundImageAction.value),
  );

  /** 当前“设为背景”确认弹层中的来源说明。 */
  const backgroundImageFitModalSourceLabel = computed(
    () => pendingBackgroundImageAction.value?.sourceLabel ?? "当前图片",
  );

  /** 当前“设为背景”确认弹层中的默认填充方式。 */
  const backgroundImageFitModalInitialFit = computed(
    () =>
      pendingBackgroundImageAction.value?.preferredFit ??
      options.activeSlide.value?.background.image?.fit ??
      DEFAULT_BACKGROUND_IMAGE_FIT,
  );

  /** 清空页面设置顶部反馈条，避免旧成功提示残留到下一次打开。 */
  const clearSlideSettingsFeedback = () => {
    slideSettingsFeedbackMessage.value = null;
    slideSettingsFeedbackTone.value = "info";
  };

  /** 统一打开页面设置抽屉，并同步重置当前需要聚焦的分组。 */
  const openSlideSettingsDrawer = (openOptions: OpenSlideSettingsDrawerOptions = {}) => {
    slideSettingsPreferredSection.value = openOptions.section ?? "basic";
    slideSettingsFocusToken.value += 1;
    isSlideSettingsDrawerVisible.value = true;

    if (openOptions.feedbackMessage) {
      slideSettingsFeedbackMessage.value = openOptions.feedbackMessage;
      slideSettingsFeedbackTone.value = openOptions.feedbackTone ?? "info";
      return;
    }

    clearSlideSettingsFeedback();
  };

  /** 关闭页面设置抽屉，并回收顶部反馈状态。 */
  const closeSlideSettingsDrawer = () => {
    isSlideSettingsDrawerVisible.value = false;
    clearSlideSettingsFeedback();
  };

  /** 关闭“设为背景”确认弹层，并清理暂存来源。 */
  const closeBackgroundImageFitModal = () => {
    pendingBackgroundImageAction.value = null;
    isApplyingBackgroundImageFit.value = false;
  };

  /** 打开“设为背景”确认弹层，并把当前节点来源暂存在本地。 */
  const openBackgroundImageFitModal = (
    modalOptions: OpenBackgroundImageFitModalOptions,
  ) => {
    pendingBackgroundImageAction.value = {
      nodeId: modalOptions.nodeId,
      sourceLabel: modalOptions.sourceLabel,
      preferredFit: normalizeBackgroundImageFit(
        modalOptions.preferredFit ??
          options.activeSlide.value?.background.image?.fit,
        DEFAULT_BACKGROUND_IMAGE_FIT,
      ),
    };
  };

  /**
   * 统一关闭页面设置相关的覆盖层状态。
   * 切页或上下文切换时调用，避免旧页面的抽屉和弹层悬浮到新页面上。
   */
  const resetSlideSettingsContext = () => {
    closeSlideSettingsDrawer();
    closeBackgroundImageFitModal();
  };

  /** 根据弹层确认结果，真正执行“设为背景”写入并回跳到背景配置分组。 */
  const handleBackgroundImageFitConfirm = async (fit: ObjectFit) => {
    const pendingAction = pendingBackgroundImageAction.value;
    if (!pendingAction) {
      return;
    }

    isApplyingBackgroundImageFit.value = true;

    try {
      const backgroundSource = options.setSlideBackgroundImageFromNode(
        pendingAction.nodeId,
        fit,
      );
      if (!backgroundSource) {
        throw new Error("当前图片还没有可用资源，暂时不能设为背景");
      }

      /**
       * 成功后统一回跳到页面设置的“背景配置”分组。
       * 这样普通入口和快捷链路最终都落到同一页面级结果表达上。
       */
      openSlideSettingsDrawer({
        section: "background",
        feedbackTone: "success",
        feedbackMessage: `已将${pendingAction.sourceLabel}设为当前页背景，可继续调整背景色与铺满方式。`,
      });
      closeBackgroundImageFitModal();
    } catch (error) {
      isApplyingBackgroundImageFit.value = false;
      const message =
        error instanceof Error ? error.message : "背景图设置失败，请重试";
      window.alert(message);
      console.error(error);
    }
  };

  return {
    backgroundImageFitModalInitialFit,
    backgroundImageFitModalSourceLabel,
    clearSlideSettingsFeedback,
    closeBackgroundImageFitModal,
    closeSlideSettingsDrawer,
    handleBackgroundImageFitConfirm,
    isApplyingBackgroundImageFit,
    isBackgroundImageFitModalVisible,
    isSlideSettingsDrawerVisible,
    openBackgroundImageFitModal,
    openSlideSettingsDrawer,
    resetSlideSettingsContext,
    slideSettingsFeedbackMessage,
    slideSettingsFeedbackTone,
    slideSettingsFocusToken,
    slideSettingsPreferredSection,
  };
}
