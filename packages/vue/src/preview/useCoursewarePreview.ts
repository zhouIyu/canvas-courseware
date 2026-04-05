import {
  createCoursewareDocument,
  type CoursewareDocument,
  type Slide,
} from "@canvas-courseware/core";
import { FabricPlayerAdapter, type FabricPlayerAdapterState } from "@canvas-courseware/fabric";
import {
  computed,
  onBeforeUnmount,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

/**
 * 预览器 composable 的输入参数。
 * 预览器只消费标准文档，不直接依赖编辑态 controller。
 */
export interface UseCoursewarePreviewOptions {
  /** 外部传入的课件文档。 */
  document?: CoursewareDocument;
  /** 初始激活的 slide。 */
  slideId?: string | null;
}

/**
 * 封装 Vue 预览器所需的播放器适配器与响应式状态。
 * 这里的目标是让 Vue 壳层只处理展示和控制，不关心 Fabric 内部细节。
 */
export function useCoursewarePreview(options: UseCoursewarePreviewOptions = {}) {
  /** 预览 canvas 的模板引用。 */
  const previewCanvasRef = useTemplateRef<HTMLCanvasElement>("previewCanvasRef");

  /** 记录最近一次已挂载的 canvas DOM，避免重复对同一节点重复 mount。 */
  let lastMountedCanvasElement: HTMLCanvasElement | null = null;

  /** 若外部未传文档，则准备一份兜底空文档，避免空状态报错。 */
  const initialDocument =
    options.document ??
    createCoursewareDocument({
      title: "Canvas Courseware Preview",
    });

  /** 当前预览使用的文档引用。 */
  const documentRef = shallowRef<CoursewareDocument | null>(initialDocument);

  /** Fabric 播放适配器，负责 step 与动画执行。 */
  const adapter = new FabricPlayerAdapter({
    document: documentRef.value,
    slideId: options.slideId ?? documentRef.value?.slides[0]?.id ?? null,
  });

  /** 当前播放器状态。 */
  const state = shallowRef<FabricPlayerAdapterState>(adapter.getState());

  /** 当前激活的 slide。 */
  const activeSlide = computed<Slide | undefined>(() => {
    const document = documentRef.value;
    if (!document) {
      return undefined;
    }

    const slideId = state.value.slideId ?? document.slides[0]?.id;
    return slideId
      ? document.slides.find((slide) => slide.id === slideId)
      : undefined;
  });

  /** 当前激活 slide 的总步骤数。 */
  const stepCount = computed(() => activeSlide.value?.timeline.steps.length ?? 0);

  /**
   * 在 DOM 可用后挂载播放器适配器。
   * 这一步只负责把当前文档和 canvas 建立连接。
   */
  const mountAdapter = async () => {
    if (!previewCanvasRef.value) {
      return;
    }

    await adapter.mount({
      canvasElement: previewCanvasRef.value,
      document: documentRef.value,
      slideId: state.value.slideId ?? undefined,
    });
  };

  /** 订阅播放器状态变化，让 Vue 层能实时刷新按钮和步骤信息。 */
  const unsubscribe = adapter.subscribe((nextState) => {
    state.value = nextState;
    documentRef.value = nextState.document;
  });

  /**
   * 当预览 canvas DOM 首次出现或被 Vue 重建时，重新挂载播放器。
   * 导入 JSON 后，`activeSlide` 可能会短暂失效，导致模板里的 canvas 被卸载再创建；
   * 如果只在 `onMounted` 时挂一次，Fabric 就会继续绑定旧节点，最终出现“状态正常但画布空白”的问题。
   */
  watch(
    previewCanvasRef,
    (canvasElement) => {
      if (!canvasElement) {
        lastMountedCanvasElement = null;
        return;
      }

      if (canvasElement === lastMountedCanvasElement) {
        return;
      }

      lastMountedCanvasElement = canvasElement;
      void mountAdapter();
    },
    {
      flush: "post",
    },
  );

  /** 组件卸载时销毁播放器和事件订阅。 */
  onBeforeUnmount(() => {
    unsubscribe();
    void adapter.dispose();
  });

  /** 用一份新文档替换当前预览文档，并回到初始播放状态。 */
  const replaceDocument = async (document: CoursewareDocument | null) => {
    documentRef.value = document;
    await adapter.setDocument(document);
  };

  /** 切换预览 slide，并重置该页播放进度。 */
  const activateSlide = async (slideId: string | null) => {
    await adapter.setSlideId(slideId);
  };

  /** 触发下一步，无论下一步是页面点击、对象点击还是自动步骤，都允许按钮强制推进。 */
  const playNextStep = async () => {
    await adapter.playNextStep(true);
  };

  /** 重置当前预览页的播放进度。 */
  const resetPreview = async () => {
    await adapter.reset();
  };

  /** 从指定步骤开始预览，并自动对齐目标 slide。 */
  const startPreviewFromStep = async (stepIndex: number, slideId?: string | null) => {
    await adapter.seekToStep(stepIndex, slideId);
  };

  return {
    activeSlide,
    adapter,
    activateSlide,
    documentRef,
    mountAdapter,
    playNextStep,
    previewCanvasRef,
    replaceDocument,
    resetPreview,
    state,
    startPreviewFromStep,
    stepCount,
  };
}
