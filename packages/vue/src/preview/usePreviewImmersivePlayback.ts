import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/** 预览沉浸播放组合能力的初始化参数。 */
export interface UsePreviewImmersivePlaybackOptions {
  /** 当前预览壳层根节点引用。 */
  shellRef: Ref<HTMLElement | null>;
  /** 当前是否有可播放页面。 */
  hasActiveSlide: Readonly<Ref<boolean>>;
  /** 当前是否还能回退到上一步。 */
  canStepBackward: Readonly<Ref<boolean>>;
  /** 当前是否还能切到上一页。 */
  canActivatePreviousSlide: Readonly<Ref<boolean>>;
  /** 当前是否还能切到下一页。 */
  canActivateNextSlide: Readonly<Ref<boolean>>;
  /** 当前预览是否正聚焦在可响应快捷键的区域。 */
  isKeyboardScopeActive: () => boolean;
  /** 请求播放下一步。 */
  onPlayNextStep: () => void | Promise<void>;
  /** 请求回退到上一步。 */
  onStepBackward: () => void | Promise<void>;
  /** 请求重播当前页。 */
  onReplayCurrentSlide: () => void | Promise<void>;
  /** 请求切到上一页。 */
  onActivatePreviousSlide: () => void | Promise<void>;
  /** 请求切到下一页。 */
  onActivateNextSlide: () => void | Promise<void>;
}

/** 当前环境可用的全屏能力。 */
interface FullscreenApi {
  /** 进入全屏。 */
  request: (element: HTMLElement) => Promise<void>;
  /** 退出全屏。 */
  exit: () => Promise<void>;
  /** 读取当前全屏元素。 */
  getElement: () => Element | null;
  /** 订阅的浏览器事件名。 */
  eventName: string;
}

/** 为预览壳层提供沉浸式播放、全屏与键盘控制能力。 */
export function usePreviewImmersivePlayback(
  options: UsePreviewImmersivePlaybackOptions,
) {
  /** 当前是否已进入沉浸播放模式。 */
  const isImmersivePlayback = ref(false);

  /** 当前是否由本组件真正持有浏览器全屏。 */
  const isFullscreenActive = ref(false);

  /** 当前环境是否支持原生全屏 API。 */
  const fullscreenApi = resolveFullscreenApi();

  /** 当前沉浸入口展示的文案。 */
  const immersiveToggleLabel = computed(() =>
    isImmersivePlayback.value ? "退出沉浸播放" : "沉浸播放",
  );

  /** 退出沉浸模式时统一回收本地状态。 */
  const exitImmersivePlaybackState = createImmersiveStateResetter(
    isImmersivePlayback,
    isFullscreenActive,
  );

  /** 进入浏览器全屏；如果失败，则保留窗口内沉浸模式作为降级方案。 */
  const requestFullscreenIfAvailable = createFullscreenRequester(
    fullscreenApi,
    options.shellRef,
    isFullscreenActive,
  );

  /** 退出浏览器全屏。 */
  const exitFullscreenIfNeeded = createFullscreenExiter(
    fullscreenApi,
    options.shellRef,
    isFullscreenActive,
  );

  /** 切换沉浸播放状态。 */
  const toggleImmersivePlayback = async () => {
    if (!options.hasActiveSlide.value) {
      return;
    }

    if (isImmersivePlayback.value) {
      await exitFullscreenIfNeeded();
      exitImmersivePlaybackState();
      return;
    }

    isImmersivePlayback.value = true;
    await requestFullscreenIfAvailable();
  };

  /** 处理预览态键盘播放控制。 */
  const handlePreviewKeyboard = createPreviewKeyboardHandler(
    options,
    isImmersivePlayback,
    toggleImmersivePlayback,
  );

  /** 监听原生全屏变化，确保按 `Esc` 退出时状态能正确回写。 */
  const handleFullscreenChange = createFullscreenChangeHandler(
    fullscreenApi,
    options.shellRef,
    isImmersivePlayback,
    isFullscreenActive,
  );

  onMounted(() => {
    window.addEventListener("keydown", handlePreviewKeyboard);
    if (fullscreenApi) {
      document.addEventListener(fullscreenApi.eventName, handleFullscreenChange);
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", handlePreviewKeyboard);
    if (fullscreenApi) {
      document.removeEventListener(fullscreenApi.eventName, handleFullscreenChange);
    }
  });

  return {
    immersiveToggleLabel,
    isFullscreenActive,
    isImmersivePlayback,
    toggleImmersivePlayback,
  };
}

/** 解析当前浏览器支持的全屏 API。 */
function resolveFullscreenApi(): FullscreenApi | null {
  if (typeof document === "undefined") {
    return null;
  }

  const documentWithFullscreen = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenElement?: Element | null;
  };
  const elementPrototype = HTMLElement.prototype as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };

  if (typeof document.exitFullscreen === "function" && "requestFullscreen" in HTMLElement.prototype) {
    return {
      request: async (element) => {
        await element.requestFullscreen();
      },
      exit: async () => {
        await document.exitFullscreen();
      },
      getElement: () => document.fullscreenElement,
      eventName: "fullscreenchange",
    };
  }

  if (
    typeof documentWithFullscreen.webkitExitFullscreen === "function" &&
    typeof elementPrototype.webkitRequestFullscreen === "function"
  ) {
    return {
      request: async (element) => {
        await elementPrototype.webkitRequestFullscreen?.call(element);
      },
      exit: async () => {
        await documentWithFullscreen.webkitExitFullscreen?.call(documentWithFullscreen);
      },
      getElement: () => documentWithFullscreen.webkitFullscreenElement ?? null,
      eventName: "webkitfullscreenchange",
    };
  }

  return null;
}

/** 生成沉浸状态复位器，保证退出链路只维护一处。 */
function createImmersiveStateResetter(
  isImmersivePlayback: Ref<boolean>,
  isFullscreenActive: Ref<boolean>,
) {
  return () => {
    isImmersivePlayback.value = false;
    isFullscreenActive.value = false;
  };
}

/** 生成进入全屏能力，失败时自动回退到窗口内沉浸模式。 */
function createFullscreenRequester(
  fullscreenApi: FullscreenApi | null,
  shellRef: Ref<HTMLElement | null>,
  isFullscreenActive: Ref<boolean>,
) {
  return async () => {
    const element = shellRef.value;
    if (!fullscreenApi || !element) {
      isFullscreenActive.value = false;
      return;
    }

    try {
      await fullscreenApi.request(element);
      isFullscreenActive.value = true;
    } catch {
      isFullscreenActive.value = false;
    }
  };
}

/** 生成退出全屏能力，避免外层重复处理兼容分支。 */
function createFullscreenExiter(
  fullscreenApi: FullscreenApi | null,
  shellRef: Ref<HTMLElement | null>,
  isFullscreenActive: Ref<boolean>,
) {
  return async () => {
    if (!fullscreenApi) {
      isFullscreenActive.value = false;
      return;
    }

    if (fullscreenApi.getElement() !== shellRef.value) {
      isFullscreenActive.value = false;
      return;
    }

    try {
      await fullscreenApi.exit();
    } catch {
      /** 忽略退出失败，保持页面内沉浸模式也能正常收口。 */
    }

    isFullscreenActive.value = false;
  };
}

/** 判断当前是否应该忽略预览快捷键，避免输入态误触。 */
function shouldIgnorePreviewKeyboardEvent(
  event: KeyboardEvent,
  isKeyboardScopeActive: () => boolean,
): boolean {
  if (!isKeyboardScopeActive()) {
    return true;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target instanceof HTMLInputElement) {
    return isTextEntryInput(target);
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "textarea" || tagName === "select";
}

/** 判断当前输入控件是否属于文本录入上下文，避免播放快捷键打断输入流程。 */
function isTextEntryInput(target: HTMLInputElement): boolean {
  const normalizedType = target.type.trim().toLowerCase();
  return ![
    "button",
    "checkbox",
    "radio",
    "reset",
    "submit",
  ].includes(normalizedType);
}

/** 生成预览快捷键处理器。 */
function createPreviewKeyboardHandler(
  options: UsePreviewImmersivePlaybackOptions,
  isImmersivePlayback: Ref<boolean>,
  toggleImmersivePlayback: () => Promise<void>,
) {
  return (event: KeyboardEvent) => {
    if (shouldIgnorePreviewKeyboardEvent(event, options.isKeyboardScopeActive)) {
      return;
    }

    if (handleImmersiveExitShortcut(event, isImmersivePlayback, toggleImmersivePlayback)) {
      return;
    }

    if (!options.hasActiveSlide.value) {
      return;
    }

    if (handlePrimaryPlaybackShortcut(event, options)) {
      return;
    }

    if (handleSlideNavigationShortcut(event, options)) {
      return;
    }

    void handleImmersiveToggleShortcut(event, toggleImmersivePlayback);
  };
}

/** 处理沉浸播放退出快捷键。 */
function handleImmersiveExitShortcut(
  event: KeyboardEvent,
  isImmersivePlayback: Ref<boolean>,
  toggleImmersivePlayback: () => Promise<void>,
): boolean {
  if (event.key !== "Escape" || !isImmersivePlayback.value) {
    return false;
  }

  event.preventDefault();
  void toggleImmersivePlayback();
  return true;
}

/** 处理推进、回退与重播这类主播放快捷键。 */
function handlePrimaryPlaybackShortcut(
  event: KeyboardEvent,
  options: UsePreviewImmersivePlaybackOptions,
): boolean {
  if (event.key === "ArrowRight" || event.key === " " || event.key === "Enter") {
    event.preventDefault();
    void options.onPlayNextStep();
    return true;
  }

  if (event.key === "ArrowLeft" && options.canStepBackward.value) {
    event.preventDefault();
    void options.onStepBackward();
    return true;
  }

  if (
    (event.key === "Backspace" || event.key === "r" || event.key === "R") &&
    !event.metaKey &&
    !event.ctrlKey
  ) {
    event.preventDefault();
    void options.onReplayCurrentSlide();
    return true;
  }

  return false;
}

/** 处理跨页面切换快捷键。 */
function handleSlideNavigationShortcut(
  event: KeyboardEvent,
  options: UsePreviewImmersivePlaybackOptions,
): boolean {
  if (event.key === "PageUp" && options.canActivatePreviousSlide.value) {
    event.preventDefault();
    void options.onActivatePreviousSlide();
    return true;
  }

  if (event.key === "PageDown" && options.canActivateNextSlide.value) {
    event.preventDefault();
    void options.onActivateNextSlide();
    return true;
  }

  return false;
}

/** 处理沉浸播放开关快捷键。 */
function handleImmersiveToggleShortcut(
  event: KeyboardEvent,
  toggleImmersivePlayback: () => Promise<void>,
): boolean {
  if (event.key.toLowerCase() !== "f" || event.metaKey || event.ctrlKey) {
    return false;
  }

  event.preventDefault();
  void toggleImmersivePlayback();
  return true;
}

/** 生成全屏状态同步处理器。 */
function createFullscreenChangeHandler(
  fullscreenApi: FullscreenApi | null,
  shellRef: Ref<HTMLElement | null>,
  isImmersivePlayback: Ref<boolean>,
  isFullscreenActive: Ref<boolean>,
) {
  return () => {
    if (!fullscreenApi) {
      return;
    }

    const fullscreenElement = fullscreenApi.getElement();
    const isCurrentShellFullscreen = fullscreenElement === shellRef.value;

    isFullscreenActive.value = isCurrentShellFullscreen;
    if (!fullscreenElement || !isCurrentShellFullscreen) {
      isImmersivePlayback.value = false;
    }
  };
}
