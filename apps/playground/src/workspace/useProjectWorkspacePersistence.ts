import type { CoursewareDocument, DiagnosticLogContext, EditorSnapshot } from "@canvas-courseware/core";
import type { RequestOption } from "@arco-design/web-vue";
import { computed, onBeforeUnmount, ref, watch, type ComputedRef } from "vue";
import { downloadCoursewareJson, formatCoursewareJsonError, readCoursewareJsonFile } from "../projects/courseware-json";
import { resolveProjectPrimaryThumbnail, sanitizeProjectSlideThumbnails } from "../projects/project-thumbnails";
import { projectRepository } from "../projects/project-repository";
import { workspaceDiagnosticLogger } from "../diagnostics/workspace-diagnostics";
import type { ProjectRecord, ProjectSlideThumbnailMap, ProjectWorkspaceMode } from "../projects/types";
import { type WorkspaceSaveStatus, useWorkspaceSaveStatus } from "./useWorkspaceSaveStatus";

/** 自动保存延时，单位毫秒。 */
const AUTO_SAVE_DELAY_MS = 800;

/** 导入导出反馈语义。 */
type IoFeedbackTone = "success" | "error";

/** 当前保存动作的触发来源。 */
type PersistTrigger = "manual" | "auto" | "import";

/** 编辑器切页前抛给应用层的缩略图截图结果。 */
interface SlideThumbnailCapturedPayload {
  /** 已完成截图的 slide id。 */
  slideId: string;
  /** 当前 slide 对应的缩略图 data URL。 */
  thumbnail: string;
}

/** 持久化层对外暴露的输入参数。 */
export interface UseProjectWorkspacePersistenceOptions {
  /** 当前项目 id。 */
  projectId: ComputedRef<string>;
  /** 当前工作区模式。 */
  workspaceMode: ComputedRef<ProjectWorkspaceMode>;
  /** 保存前主动向编辑器拉取当前页缩略图。 */
  captureActiveSlideThumbnail: () => Promise<SlideThumbnailCapturedPayload | null>;
}

/** 收敛项目加载、保存、自动保存与导入导出职责。 */
export function useProjectWorkspacePersistence(
  options: UseProjectWorkspacePersistenceOptions,
) {
  /** 当前项目标题。 */
  const projectTitle = ref("");

  /** 当前项目文档。 */
  const documentModel = ref<CoursewareDocument>();

  /** 当前编辑器快照，用于同步预览页面的 slide 对齐。 */
  const editorSnapshot = ref<EditorSnapshot | null>(null);

  /** 当前预览应跟随的 slide id。 */
  const activeSlideId = computed(() =>
    editorSnapshot.value?.activeSlideId ?? documentModel.value?.slides[0]?.id ?? null,
  );

  /** 当前项目内各 slide 的缩略图缓存。 */
  const slideThumbnails = ref<ProjectSlideThumbnailMap>({});

  /** 当前是否正在加载项目数据。 */
  const isLoading = ref(true);

  /** 当前是否找不到项目。 */
  const isProjectMissing = ref(false);

  /** 当前是否正在把仓库数据灌入页面，避免误触自动保存。 */
  const isHydrating = ref(false);

  /** 当前保存状态。 */
  const saveStatus = ref<WorkspaceSaveStatus>("saved");

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

  /** 组合顶部保存状态文案与颜色。 */
  const { saveStatusHint, saveStatusLabel, saveStatusTagColor } = useWorkspaceSaveStatus(
    saveStatus,
    lastSavedAt,
  );

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
    projectId: options.projectId.value || null,
    activeSlideId: activeSlideId.value ?? null,
    workspaceMode: options.workspaceMode.value,
    ...context,
  });

  /** 把当前页面状态拼成一条可保存的项目记录。 */
  const buildProjectRecord = (): ProjectRecord | null => {
    if (!documentModel.value || !options.projectId.value) {
      return null;
    }

    const normalizedTitle = projectTitle.value.trim() || "未命名课件";
    /** 保存前统一过滤掉已删除页面的截图缓存。 */
    const normalizedSlideThumbnails = sanitizeProjectSlideThumbnails(
      documentModel.value,
      slideThumbnails.value,
    );

    return {
      id: options.projectId.value,
      title: normalizedTitle,
      updatedAt: new Date().toISOString(),
      thumbnail: resolveProjectPrimaryThumbnail(documentModel.value, normalizedSlideThumbnails),
      slideThumbnails: normalizedSlideThumbnails,
      document: {
        ...documentModel.value,
        meta: {
          ...documentModel.value.meta,
          id: options.projectId.value,
          title: normalizedTitle,
        },
      },
    };
  };

  /** 保存前主动向编辑器拉取当前页截图，保证当前页封面与最新画布保持一致。 */
  const syncActiveSlideThumbnailBeforeSave = async () => {
    const captured = await options.captureActiveSlideThumbnail();
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

    const projectRecord = projectRepository.get(options.projectId.value);
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
  const handleProjectTitleInput = (nextTitle: string) => {
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

  /** 手动保存当前项目。 */
  const handleSaveClick = async () => {
    await persistProject("manual");
  };

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

  /** 项目 id 变化时重新加载当前项目。 */
  watch(
    () => options.projectId.value,
    () => {
      loadProject();
    },
    { immediate: true },
  );

  /** 页面销毁时清理自动保存计时器。 */
  onBeforeUnmount(() => {
    clearSaveTimer();
  });

  return {
    activeSlideId,
    documentModel,
    editorSnapshot,
    handleJsonExportClick,
    handleJsonImportRequest,
    handleProjectTitleInput,
    handleSaveClick,
    handleSlideThumbnailCaptured,
    handleSnapshotChange,
    ioFeedback,
    isHydrating,
    isLoading,
    isProjectMissing,
    projectTitle,
    saveStatusHint,
    saveStatusLabel,
    saveStatusTagColor,
    slideThumbnails,
  };
}
