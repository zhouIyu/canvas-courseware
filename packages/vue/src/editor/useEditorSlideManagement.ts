import {
  cloneSlide,
  createSlide,
  EditorController,
  type EditorSnapshot,
  type Slide,
} from "@canvas-courseware/core";
import type { ComputedRef, ShallowRef } from "vue";

/** slide 管理 composable 的输入参数。 */
export interface UseEditorSlideManagementOptions {
  /** 标准控制器，用于派发 slide 相关命令。 */
  controller: EditorController;
  /** 当前 editor snapshot。 */
  snapshot: ShallowRef<EditorSnapshot>;
  /** 当前激活的 slide。 */
  activeSlide: ComputedRef<Slide | undefined>;
}

/**
 * 统一封装 slide 的新增、复制、删除和重排能力。
 * 这样编辑器主 composable 只负责组装能力，不必继续堆积页面管理细节。
 */
export function useEditorSlideManagement(options: UseEditorSlideManagementOptions) {
  /** 生成编辑器中新页面的默认命名。 */
  const createSlideName = () => `第${options.snapshot.value.document.slides.length + 1}页`;

  /**
   * 根据参考页生成一张新的空白 slide。
   * 新建页只继承常用画布尺寸和基础背景色，不继承背景图资源，
   * 这样可以保证“新建页面”和“复制页面”在背景初始化上的边界清晰。
   */
  const createDraftSlide = (referenceSlide?: Slide) =>
    createSlide({
      name: createSlideName(),
      width: referenceSlide?.size.width,
      height: referenceSlide?.size.height,
      backgroundFill: referenceSlide?.background.fill ?? "#FFFFFF",
    });

  /** 统一派发 slide 创建并切到新页，避免各个入口重复写两条命令。 */
  const insertSlideAndActivate = (slide: Slide, index?: number) => {
    options.controller.execute({
      type: "slide.create",
      slide,
      index,
    });
    options.controller.execute({
      type: "slide.activate",
      slideId: slide.id,
    });
  };

  /** 根据 slide id 解析当前页面及其所在索引。 */
  const resolveSlideContext = (slideId: string) => {
    const index = options.snapshot.value.document.slides.findIndex((slide) => slide.id === slideId);
    if (index === -1) {
      return null;
    }

    return {
      index,
      slide: options.snapshot.value.document.slides[index],
    };
  };

  /** 新增 slide，并自动切换到新页。 */
  const addSlide = () => {
    insertSlideAndActivate(createDraftSlide(options.activeSlide.value));
  };

  /** 在指定页面后快速新增下一页，并自动切换过去。 */
  const addSlideAfter = (slideId: string) => {
    const slideContext = resolveSlideContext(slideId);
    if (!slideContext) {
      return;
    }

    insertSlideAndActivate(createDraftSlide(slideContext.slide), slideContext.index + 1);
  };

  /** 复制一张现有页面，并把完整内容插到原页面之后。 */
  const duplicateSlideById = (slideId: string) => {
    const slideContext = resolveSlideContext(slideId);
    if (!slideContext) {
      return;
    }

    insertSlideAndActivate(cloneSlide(slideContext.slide), slideContext.index + 1);
  };

  /** 删除指定页面。 */
  const removeSlide = (slideId: string) => {
    options.controller.execute({
      type: "slide.delete",
      slideId,
    });
  };

  /** 按最终索引重排页面顺序。 */
  const reorderSlide = (slideId: string, index: number) => {
    options.controller.execute({
      type: "slide.reorder",
      slideId,
      index,
    });
  };

  return {
    addSlide,
    addSlideAfter,
    duplicateSlideById,
    removeSlide,
    reorderSlide,
  };
}
