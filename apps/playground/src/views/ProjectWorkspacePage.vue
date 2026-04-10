<script setup lang="ts">
import type {
  CoursewareDocument,
  DiagnosticLogContext,
  EditorSnapshot,
} from "@canvas-courseware/core";
import type { RequestOption } from "@arco-design/web-vue";
import { CoursewareEditor, CoursewarePreview } from "@canvas-courseware/vue";
import { IconLeft } from "@arco-design/web-vue/es/icon";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  downloadCoursewareJson,
  formatCoursewareJsonError,
  readCoursewareJsonFile,
} from "../projects/courseware-json";
import {
  resolveProjectPrimaryThumbnail,
  sanitizeProjectSlideThumbnails,
} from "../projects/project-thumbnails";
import { projectRepository } from "../projects/project-repository";
import {
  attachWorkspaceDiagnosticsBridge,
  detachWorkspaceDiagnosticsBridge,
  workspaceDiagnosticLogger,
} from "../diagnostics/workspace-diagnostics";
import type {
  ProjectRecord,
  ProjectSlideThumbnailMap,
  ProjectWorkspaceMode,
} from "../projects/types";
import "./ProjectWorkspacePage.css";

/** 自动保存延时，单位毫秒。 */
const AUTO_SAVE_DELAY_MS = 800;

/** 工作台保存状态。 */
type SaveStatus = "saved" | "saving" | "dirty" | "error";

/** 导入导出反馈语义。 */
type IoFeedbackTone = "success" | "error";

/** 当前保存动作的触发来源。 */
type PersistTrigger = "manual" | "auto" | "import";

/** 模式切换控件传回值的兼容类型。 */
type WorkspaceModeToggleValue = string | number | boolean;

/** 外部驱动预览器从指定步骤开始播放的请求结构。 */
interface PreviewPlaybackRequest {
  /** 用来区分重复请求的唯一 key。 */
  key: number;
  /** 需要切入的 slide id。 */
  slideId: string | null;
  /** 需要作为下一步焦点的步骤索引。 */
  stepIndex: number;
}

/** 编辑器对应用层暴露的截图方法。 */
interface CoursewareEditorExposed {
  /** 导出当前激活页的缩略图截图结果。 */
  captureActiveSlideThumbnail: () => Promise<{
    /** 已完成截图的 slide id。 */
    slideId: string;
    /** 当前 slide 对应的缩略图 data URL。 */
    thumbnail: string;
  } | null>;
}

/** 编辑器切页前抛给应用层的缩略图截图结果。 */
interface SlideThumbnailCapturedPayload {
  /** 已完成截图的 slide id。 */
  slideId: string;
  /** 当前 slide 对应的缩略图 data URL。 */
  thumbnail: string;
}

/** 当前路由实例。 */
const route = useRoute();

/** 当前路由跳转实例。 */
const router = useRouter();

/** 当前项目标题。 */
const projectTitle = ref("");

/** 当前项目文档。 */
const documentModel = ref<CoursewareDocument>();

/** 当前编辑器快照，用于同步预览页面的 slide 对齐。 */
const editorSnapshot = ref<EditorSnapshot | null>(null);

/** 外部发给预览器的跳转请求。 */
const previewPlaybackRequest = ref<PreviewPlaybackRequest | null>(null);

/** 工作区内容容器引用，用来计算可用高度。 */
const workspaceStageRef = ref<HTMLElement | null>(null);

/** 编辑器组件引用，供保存前主动导出当前页缩略图。 */
const workspaceEditorRef = ref<(ComponentPublicInstance & CoursewareEditorExposed) | null>(null);

/** 当前是否正在加载项目数据。 */
const isLoading = ref(true);

/** 当前是否找不到项目。 */
const isProjectMissing = ref(false);

/** 当前是否正在把仓库数据灌入页面，避免误触自动保存。 */
const isHydrating = ref(false);

/** 当前项目内各 slide 的缩略图缓存。 */
const slideThumbnails = ref<ProjectSlideThumbnailMap>({});

/** 当前保存状态。 */
const saveStatus = ref<SaveStatus>("saved");

/** 最近一次保存时间。 */
const lastSavedAt = ref<string | null>(null);

/** 最近一次导入导出的反馈消息。 */
const ioFeedback = ref<{
  /** 当前反馈语义。 */
  tone: IoFeedbackTone;
  /** 当前反馈文案。 */
  message: string;
} | null>(null);

/** 自动保存计时器。 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** 当前工作区可分配给编辑器/预览器的净高度。 */
const workspaceViewportHeight = ref(0);

/** 当前项目 id。 */
const projectId = computed(() => String(route.params.projectId ?? ""));

/** 规范化后的工作模式。 */
const workspaceMode = computed<ProjectWorkspaceMode>(() => {
  const rawMode = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode;
  return rawMode === "preview" ? "preview" : "edit";
});

/** 当前预览应跟随的 slide。 */
const activeSlideId = computed(() =>
  editorSnapshot.value?.activeSlideId ?? documentModel.value?.slides[0]?.id ?? null,
);

/** 统一传给编辑器和预览器的工作区高度。 */
const workspaceContentHeight = computed(() =>
  workspaceViewportHeight.value > 0 ? workspaceViewportHeight.value : undefined,
);

/** 当前保存状态的用户可读标签。 */
const saveStatusLabel = computed(() => {
  switch (saveStatus.value) {
    case "saving":
      return "保存中";
    case "dirty":
      return "未保存";
    case "error":
      return "保存失败";
    case "saved":
    default:
      return "已保存";
  }
});

/** 保存状态对应的标签色值。 */
const saveStatusTagColor = computed(() => {
  switch (saveStatus.value) {
    case "saving":
      return "#165dff";
    case "dirty":
      return "#ff7d00";
    case "error":
      return "#f53f3f";
    case "saved":
    default:
      return "#00b42a";
  }
});

/** 最近保存时间的辅助文案。 */
const saveStatusHint = computed(() => {
  if (!lastSavedAt.value) {
    return "本地项目会自动持久化";
  }

  return `最近保存：${new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(lastSavedAt.value))}`;
});

/** 清理自动保存计时器。 */
const clearSaveTimer = () => {
  if (!saveTimer) {
    return;
  }

  clearTimeout(saveTimer);
  saveTimer = null;
};

/** 统一拼装工作台日志所需的最小上下文，避免保存链路各处重复手写。 */
const buildWorkspaceDiagnosticContext = (
  context: DiagnosticLogContext = {},
): DiagnosticLogContext => ({
  projectId: projectId.value || null,
  activeSlideId: activeSlideId.value ?? null,
  workspaceMode: workspaceMode.value,
  ...context,
});

/** 把当前页面状态拼成一条可保存的项目记录。 */
const buildProjectRecord = (): ProjectRecord | null => {
  if (!documentModel.value || !projectId.value) {
    return null;
  }

  const normalizedTitle = projectTitle.value.trim() || "未命名课件";
  /** 保存前统一过滤掉已删除页面的截图缓存。 */
  const normalizedSlideThumbnails = sanitizeProjectSlideThumbnails(
    documentModel.value,
    slideThumbnails.value,
  );

  return {
    id: projectId.value,
    title: normalizedTitle,
    updatedAt: new Date().toISOString(),
    thumbnail: resolveProjectPrimaryThumbnail(documentModel.value, normalizedSlideThumbnails),
    slideThumbnails: normalizedSlideThumbnails,
    document: {
      ...documentModel.value,
      meta: {
        ...documentModel.value.meta,
        id: projectId.value,
        title: normalizedTitle,
      },
    },
  };
};

/** 保存前主动向编辑器拉取当前页截图，保证当前页封面与最新画布保持一致。 */
const syncActiveSlideThumbnailBeforeSave = async () => {
  const captured = await workspaceEditorRef.value?.captureActiveSlideThumbnail?.();
  if (!captured || !documentModel.value) {
    return;
  }

  slideThumbnails.value = {
    ...slideThumbnails.value,
    [captured.slideId]: captured.thumbnail,
  };
};

/** 执行一次显式或自动保存。 */
const persistProject = async (trigger: PersistTrigger = "manual"): Promise<boolean> => {
  await syncActiveSlideThumbnailBeforeSave();
  const projectRecord = buildProjectRecord();
  if (!projectRecord) {
    workspaceDiagnosticLogger.warn({
      event: "project.save.skipped",
      message: "项目保存已跳过，因为当前没有可持久化的数据",
      context: buildWorkspaceDiagnosticContext({
        trigger,
      }),
    });
    return false;
  }

  clearSaveTimer();
  saveStatus.value = "saving";

  workspaceDiagnosticLogger.info({
    event: "project.save.started",
    message: trigger === "auto" ? "已触发自动保存" : "已触发项目保存",
    context: buildWorkspaceDiagnosticContext({
      trigger,
      slideCount: projectRecord.document.slides.length,
    }),
  });

  try {
    const savedRecord = projectRepository.save(projectRecord);
    projectTitle.value = savedRecord.title;
    lastSavedAt.value = savedRecord.updatedAt;
    saveStatus.value = "saved";

    workspaceDiagnosticLogger.info({
      event: "project.save.completed",
      message: trigger === "auto" ? "自动保存成功" : "项目保存成功",
      context: buildWorkspaceDiagnosticContext({
        trigger,
        updatedAt: savedRecord.updatedAt,
        slideCount: savedRecord.document.slides.length,
      }),
    });

    return true;
  } catch (error) {
    saveStatus.value = "error";
    workspaceDiagnosticLogger.error({
      event: "project.save.failed",
      message: trigger === "auto" ? "自动保存失败" : "项目保存失败",
      context: buildWorkspaceDiagnosticContext({
        trigger,
      }),
      error,
    });
    return false;
  }
};

/** 标记当前页面已变更，并启动自动保存。 */
const scheduleAutoSave = () => {
  if (isHydrating.value || !documentModel.value) {
    return;
  }

  saveStatus.value = "dirty";
  clearSaveTimer();
  workspaceDiagnosticLogger.debug({
    event: "project.autosave.scheduled",
    message: "已重新安排自动保存",
    context: buildWorkspaceDiagnosticContext({
      delayMs: AUTO_SAVE_DELAY_MS,
    }),
  });
  saveTimer = setTimeout(() => {
    void persistProject("auto");
  }, AUTO_SAVE_DELAY_MS);
};

/** 将顶部项目标题同步进文档元信息。 */
const syncDocumentTitle = (nextTitle: string) => {
  if (!documentModel.value) {
    return;
  }

  const normalizedTitle = nextTitle || "未命名课件";
  documentModel.value = {
    ...documentModel.value,
    meta: {
      ...documentModel.value.meta,
      title: normalizedTitle,
    },
  };
};

/** 加载当前路由对应的项目。 */
const loadProject = () => {
  projectRepository.ensureSeededProjects();
  isLoading.value = true;
  isProjectMissing.value = false;
  isHydrating.value = true;
  ioFeedback.value = null;
  clearSaveTimer();

  const projectRecord = projectRepository.get(projectId.value);
  if (!projectRecord) {
    workspaceDiagnosticLogger.warn({
      event: "project.load.missing",
      message: "当前项目不存在或已被删除",
      context: buildWorkspaceDiagnosticContext(),
    });
    isProjectMissing.value = true;
    isLoading.value = false;
    isHydrating.value = false;
    documentModel.value = undefined;
    return;
  }

  projectTitle.value = projectRecord.title;
  documentModel.value = projectRecord.document;
  slideThumbnails.value = projectRecord.slideThumbnails;
  editorSnapshot.value = null;
  previewPlaybackRequest.value = null;
  lastSavedAt.value = projectRecord.updatedAt;
  saveStatus.value = "saved";
  isLoading.value = false;

  workspaceDiagnosticLogger.info({
    event: "project.load.completed",
    message: "已加载本地项目",
    context: buildWorkspaceDiagnosticContext({
      slideCount: projectRecord.document.slides.length,
    }),
  });

  queueMicrotask(() => {
    isHydrating.value = false;
  });
};

/** 把路由 query 规范成受支持的编辑模式。 */
const normalizeWorkspaceMode = async () => {
  const rawMode = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode;
  if (rawMode === "edit" || rawMode === "preview") {
    return;
  }

  await router.replace({
    name: "project-workspace",
    params: {
      projectId: projectId.value,
    },
    query: {
      ...route.query,
      mode: "edit",
    },
  });
};

/** 切换顶部编辑/预览模式。 */
const switchWorkspaceMode = async (mode: ProjectWorkspaceMode) => {
  await router.replace({
    name: "project-workspace",
    params: {
      projectId: projectId.value,
    },
    query: {
      ...route.query,
      mode,
    },
  });
};

/** 处理模式分段控件变更。 */
const handleWorkspaceModeChange = (nextMode: WorkspaceModeToggleValue) => {
  if (nextMode === "edit" || nextMode === "preview") {
    void switchWorkspaceMode(nextMode);
  }
};

/** 跳回项目列表页。 */
const goBackToProjects = async () => {
  await router.push({
    name: "project-list",
  });
};

/** 手动保存当前项目。 */
const handleSaveClick = async () => {
  await persistProject("manual");
};

/** 记录一条导入导出反馈，供顶部状态区展示。 */
const setIoFeedback = (tone: IoFeedbackTone, message: string) => {
  ioFeedback.value = {
    tone,
    message,
  };
};

/** 导出当前项目的标准 JSON。 */
const handleJsonExportClick = () => {
  const projectRecord = buildProjectRecord();
  if (!projectRecord) {
    workspaceDiagnosticLogger.warn({
      event: "project.export.skipped",
      message: "JSON 导出已跳过，因为当前没有可导出的项目数据",
      context: buildWorkspaceDiagnosticContext(),
    });
    return;
  }

  const exportedFileName = downloadCoursewareJson(projectRecord.document, projectRecord.title);
  setIoFeedback("success", `已导出 ${exportedFileName}`);
  workspaceDiagnosticLogger.info({
    event: "project.export.completed",
    message: "已导出课件 JSON",
    context: buildWorkspaceDiagnosticContext({
      fileName: exportedFileName,
      slideCount: projectRecord.document.slides.length,
    }),
  });
};

/** 把一份导入文档安全地应用到当前工作台并立即保存。 */
const applyImportedDocument = async (nextDocument: CoursewareDocument): Promise<boolean> => {
  const normalizedTitle =
    nextDocument.meta.title.trim() || projectTitle.value.trim() || "未命名课件";

  clearSaveTimer();
  isHydrating.value = true;
  editorSnapshot.value = null;
  projectTitle.value = normalizedTitle;
  slideThumbnails.value = {};
  documentModel.value = {
    ...nextDocument,
    meta: {
      ...nextDocument.meta,
      title: normalizedTitle,
    },
  };

  try {
    return await persistProject("import");
  } finally {
    queueMicrotask(() => {
      isHydrating.value = false;
    });
  }
};

/** 通过 Arco Upload 接收一份 JSON 文件，并把合法文档导入当前项目。 */
const handleJsonImportRequest = async (option: RequestOption) => {
  const selectedFile = option.fileItem.file;
  if (!selectedFile) {
    workspaceDiagnosticLogger.warn({
      event: "project.import.skipped",
      message: "JSON 导入已跳过，因为没有选择文件",
      context: buildWorkspaceDiagnosticContext(),
    });
    option.onError?.(new Error("未选择文件"));
    return {};
  }

  try {
    workspaceDiagnosticLogger.info({
      event: "project.import.started",
      message: "已开始导入课件 JSON",
      context: buildWorkspaceDiagnosticContext({
        fileName: selectedFile.name,
      }),
    });

    const importedDocument = await readCoursewareJsonFile(selectedFile);
    const saved = await applyImportedDocument(importedDocument);

    if (saved) {
      setIoFeedback("success", `已导入 ${selectedFile.name} 并保存到本地项目`);
      workspaceDiagnosticLogger.info({
        event: "project.import.completed",
        message: "已导入并保存课件 JSON",
        context: buildWorkspaceDiagnosticContext({
          fileName: selectedFile.name,
          slideCount: importedDocument.slides.length,
        }),
      });
      option.onSuccess?.();
      return {};
    }

    setIoFeedback("error", `已导入 ${selectedFile.name}，但本地保存失败`);
    workspaceDiagnosticLogger.error({
      event: "project.import.persist-failed",
      message: "课件 JSON 已导入，但保存到本地项目失败",
      context: buildWorkspaceDiagnosticContext({
        fileName: selectedFile.name,
      }),
    });
    option.onError?.(new Error("save_failed"));
  } catch (error) {
    setIoFeedback("error", formatCoursewareJsonError(error));
    workspaceDiagnosticLogger.error({
      event: "project.import.failed",
      message: "课件 JSON 导入失败",
      context: buildWorkspaceDiagnosticContext({
        fileName: selectedFile.name,
      }),
      error,
    });
    option.onError?.(error);
  }

  return {};
};

/** 顶部标题输入时同步更新项目名和文档名。 */
const handleProjectTitleInput = (nextValue: string | number) => {
  const nextTitle = String(nextValue ?? "");
  projectTitle.value = nextTitle;
  syncDocumentTitle(nextTitle);
  scheduleAutoSave();
};

/** 接收编辑器当前快照，用来同步预览模式的页面位置。 */
const handleSnapshotChange = (snapshot: EditorSnapshot) => {
  editorSnapshot.value = snapshot;
};

/** 接收编辑器切页前导出的缩略图，并按项目级缓存落盘。 */
const handleSlideThumbnailCaptured = (payload: SlideThumbnailCapturedPayload) => {
  if (slideThumbnails.value[payload.slideId] === payload.thumbnail) {
    return;
  }

  slideThumbnails.value = {
    ...slideThumbnails.value,
    [payload.slideId]: payload.thumbnail,
  };
  scheduleAutoSave();
};

/** 从编辑器时间轴发起预览请求，并切换到预览模式。 */
const handleTimelinePreviewRequest = (payload: {
  slideId: string;
  stepIndex: number;
}) => {
  previewPlaybackRequest.value = {
    key: (previewPlaybackRequest.value?.key ?? 0) + 1,
    slideId: payload.slideId,
    stepIndex: payload.stepIndex,
  };

  void switchWorkspaceMode("preview");
};

/** 刷新当前工作区可用高度，扣除容器内边距后再传给内部壳层。 */
const updateWorkspaceViewportHeight = () => {
  const element = workspaceStageRef.value;
  if (!element) {
    workspaceViewportHeight.value = 0;
    return;
  }

  const styles = window.getComputedStyle(element);
  const verticalPadding =
    Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  workspaceViewportHeight.value = Math.max(element.clientHeight - verticalPadding, 0);
};

/** 监听工作区高度变化，保证视口高度分配始终正确。 */
let workspaceStageResizeObserver: ResizeObserver | null = null;

/** 项目 id 或模式变化时，刷新页面状态。 */
watch(
  () => route.query.mode,
  () => {
    void normalizeWorkspaceMode();
  },
  { immediate: true },
);

/** 项目 id 变化时重新加载当前项目。 */
watch(
  () => projectId.value,
  () => {
    loadProject();
  },
  { immediate: true },
);

/** 文档变化时启动自动保存。 */
watch(
  () => documentModel.value,
  (nextDocument, previousDocument) => {
    if (!nextDocument || nextDocument === previousDocument) {
      return;
    }

    scheduleAutoSave();
  },
);

/** 页面销毁时清理自动保存计时器。 */
onBeforeUnmount(() => {
  clearSaveTimer();
  workspaceStageResizeObserver?.disconnect();
  workspaceStageResizeObserver = null;
  detachWorkspaceDiagnosticsBridge();
});

onMounted(() => {
  attachWorkspaceDiagnosticsBridge();
  updateWorkspaceViewportHeight();

  if (!workspaceStageRef.value) {
    return;
  }

  workspaceStageResizeObserver = new ResizeObserver(() => {
    updateWorkspaceViewportHeight();
  });
  workspaceStageResizeObserver.observe(workspaceStageRef.value);
});
</script>

<template>
  <main class="workspace-page">
    <section v-if="isLoading" class="state-shell">
      <a-spin size="large" />
      <strong>正在加载项目...</strong>
      <p>请稍候，正在恢复本地课件数据。</p>
    </section>

    <section v-else-if="isProjectMissing" class="state-shell">
      <a-result status="404" subtitle="项目可能已被删除，或者当前链接已经失效。" title="没有找到这个项目">
        <template #extra>
          <a-button type="primary" @click="goBackToProjects">返回项目列表</a-button>
        </template>
      </a-result>
    </section>

    <template v-else-if="documentModel">
      <header class="workspace-topbar">
        <div class="topbar-main-row">
          <div class="topbar-primary-row">
            <a-button
              class="back-button"
              aria-label="返回项目列表"
              shape="circle"
              type="outline"
              @click="goBackToProjects"
            >
              <template #icon>
                <IconLeft />
              </template>
            </a-button>

            <label class="title-field">
              <a-input
                aria-label="项目标题"
                :model-value="projectTitle"
                class="title-input"
                placeholder="请输入项目标题"
                @input="handleProjectTitleInput"
              />
            </label>
            <a-radio-group
              class="workspace-mode-switch"
              :model-value="workspaceMode"
              size="small"
              type="button"
              @change="handleWorkspaceModeChange"
            >
              <a-radio value="edit">编辑</a-radio>
              <a-radio value="preview">预览</a-radio>
            </a-radio-group>

            <div class="workspace-actions">
              <a-upload
                accept=".json,application/json"
                :auto-upload="true"
                :custom-request="handleJsonImportRequest"
                :show-file-list="false"
                :show-upload-button="true"
                class="workspace-upload"
              >
                <template #upload-button>
                  <a-button class="utility-button" type="outline">
                    导入 JSON
                  </a-button>
                </template>
              </a-upload>
              <a-button class="utility-button" type="outline" @click="handleJsonExportClick">
                导出 JSON
              </a-button>
              <a-button type="primary" @click="handleSaveClick">保存</a-button>
              <div class="save-inline-meta">
                <a-tag :color="saveStatusTagColor" bordered>{{ saveStatusLabel }}</a-tag>
                <small>{{ saveStatusHint }}</small>
              </div>
            </div>
          </div>
        </div>

        <a-alert
          v-if="ioFeedback"
          :show-icon="true"
          :type="ioFeedback.tone"
          class="io-feedback"
        >
          {{ ioFeedback.message }}
        </a-alert>
      </header>

      <section ref="workspaceStageRef" class="workspace-stage">
        <CoursewareEditor
          ref="workspaceEditorRef"
          v-show="workspaceMode === 'edit'"
          v-model="documentModel"
          :diagnostic-logger="workspaceDiagnosticLogger"
          :height="workspaceContentHeight"
          :slide-thumbnail-map="slideThumbnails"
          :show-header="false"
          class="workspace-editor"
          @snapshot-change="handleSnapshotChange"
          @slide-thumbnail-captured="handleSlideThumbnailCaptured"
          @timeline-preview-request="handleTimelinePreviewRequest"
        />

        <CoursewarePreview
          v-show="workspaceMode === 'preview'"
          :document="documentModel"
          :height="workspaceContentHeight"
          :preview-request="previewPlaybackRequest"
          :show-header="false"
          :slide-thumbnail-map="slideThumbnails"
          :slide-id="activeSlideId"
          class="workspace-preview"
        />
      </section>
    </template>
  </main>
</template>
