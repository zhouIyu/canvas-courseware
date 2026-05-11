import type { CoursewareDocument, DiagnosticLogContext, EditorSnapshot } from "@canvas-courseware/core";
import type { RequestOption } from "@arco-design/web-vue";
import { computed, onBeforeUnmount, ref, watch, type ComputedRef } from "vue";
import { downloadCoursewareJson, formatCoursewareJsonError, readCoursewareJsonFile } from "../projects/courseware-json";
import { clearProjectAssetSourceCache, normalizeProjectDocumentAssetSources } from "../projects/project-assets";
import { projectRepository } from "../projects/project-repository";
import { workspaceDiagnosticLogger } from "../diagnostics/workspace-diagnostics";
import type { ProjectSlideThumbnailMap, ProjectWorkspaceMode } from "../projects/types";
import type { TimelineCollapsedStepIdsChangePayload } from "../projects/project-workspace-state";
import {
  cleanupRemovedWorkspaceAssets,
  hydrateWorkspaceProjectDocument,
  resolveRemovedWorkspaceAssetIds,
  resolveWorkspaceExportDocument,
  type WorkspaceProjectHydrationResult,
} from "./project-workspace-persistence/asset-helpers";
import { buildProjectWorkspaceRecord, mergeCapturedSlideThumbnail, type SlideThumbnailCapturedPayload } from "./project-workspace-persistence/record-helpers";
import { useProjectWorkspaceTimelineState } from "./useProjectWorkspaceTimelineState";
import { type WorkspaceSaveStatus, useWorkspaceSaveStatus } from "./useWorkspaceSaveStatus";

/** 自动保存延时，单位毫秒。 */
const AUTO_SAVE_DELAY_MS = 800;

/** 自动保存被连续编辑暂缓后的重试延时，单位毫秒。 */
const AUTO_SAVE_BLOCKED_RETRY_MS = 250;

/** 自动保存当前被暂缓时的原因枚举。 */
type AutoSaveBlockReason = "inline-text-editing" | "canvas-transform";

/** 工作台顶部反馈支持的语义色。 */
type WorkspaceFeedbackTone = "success" | "error" | "warning";

/** 工作台顶部反馈的来源类型。 */
type WorkspaceFeedbackKind = "operation" | "asset-hydration" | "thumbnail" | "save-resilience";

/** 顶部反馈条内部维护的一条结构化消息。 */
interface WorkspaceFeedbackEntry {
  /** 当前反馈属于哪一类能力。 */
  kind: WorkspaceFeedbackKind;
  /** 当前反馈语义。 */
  tone: WorkspaceFeedbackTone;
  /** 当前反馈文案。 */
  message: string;
}

/** 保存阶段归一化后的资源链路状态，供用户提示与日志上下文复用。 */
interface PersistAssetResilienceSummary {
  /** 当前环境下资源仓库是否可用。 */
  storageStatus: "available" | "unavailable";
  /** 当前文档仍引用的本地资产数量。 */
  assetCount: number;
  /** 本轮被改写成稳定资产引用的来源数量。 */
  rewrittenAssetCount: number;
  /** 本轮因仓库不可用而未能迁移的本地 data URL 数量。 */
  skippedLocalDataUrlCount: number;
}

/** 当前保存动作的触发来源。 */
type PersistTrigger = "manual" | "auto" | "import";

/** 持久化层对外暴露的输入参数。 */
export interface UseProjectWorkspacePersistenceOptions {
  /** 当前项目 id。 */
  projectId: ComputedRef<string>;
  /** 当前工作区模式。 */
  workspaceMode: ComputedRef<ProjectWorkspaceMode>;
  /** 保存前主动向编辑器拉取当前页缩略图。 */
  captureActiveSlideThumbnail: () => Promise<SlideThumbnailCapturedPayload | null>;
  /** 读取当前自动保存是否需要暂缓，以及暂缓原因。 */
  resolveAutoSaveBlockReason?: () => AutoSaveBlockReason | null;
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

  /** 当前项目本地工作区状态，单独持久化到项目记录中。 */
  const {
    handleTimelineCollapsedStepIdsChange: updateTimelineCollapsedStepIds,
    hydrateWorkspaceState,
    resetWorkspaceState,
    workspaceState,
  } = useProjectWorkspaceTimelineState();

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

  /** 最近一次导入导出类反馈。 */
  const operationFeedback = ref<WorkspaceFeedbackEntry | null>(null);

  /** 最近一次需要保留的资源类反馈。 */
  const resourceFeedback = ref<WorkspaceFeedbackEntry | null>(null);

  /** 顶部统一展示的反馈，优先展示最新的显式操作结果。 */
  const ioFeedback = computed(() => {
    const feedback = operationFeedback.value ?? resourceFeedback.value;
    if (!feedback) {
      return null;
    }

    return {
      tone: feedback.tone,
      message: feedback.message,
    };
  });

  /** 自动保存计时器。 */
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** 当前这一轮自动保存是否已经记录过“因连续编辑而暂缓”的日志。 */
  let hasLoggedAutoSaveBlock = false;

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

  /** 读取当前自动保存是否需要暂缓，以及暂缓原因。 */
  const resolveAutoSaveBlockReason = () => options.resolveAutoSaveBlockReason?.() ?? null;

  /** 安排下一次自动保存执行时机，供首次调度和短间隔重试复用。 */
  const queueAutoSave = (delayMs: number) => {
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      void flushAutoSave();
    }, delayMs);
  };

  /** 当前仍处于连续编辑态时，先保留脏状态并在短间隔后重试自动保存。 */
  const deferAutoSave = (blockReason: AutoSaveBlockReason) => {
    saveStatus.value = "dirty";
    if (!hasLoggedAutoSaveBlock) {
      workspaceDiagnosticLogger.debug({
        event: "project.autosave.deferred",
        message: "当前仍在连续编辑，自动保存已暂缓",
        context: buildWorkspaceDiagnosticContext({
          reason: blockReason,
          retryDelayMs: AUTO_SAVE_BLOCKED_RETRY_MS,
        }),
      });
      hasLoggedAutoSaveBlock = true;
    }

    queueAutoSave(AUTO_SAVE_BLOCKED_RETRY_MS);
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

  /** 读取当前工作台真正对应的活动页 id，供缩略图告警补齐上下文。 */
  const resolveCurrentSlideId = () =>
    editorSnapshot.value?.activeSlideId ?? documentModel.value?.slides[0]?.id ?? null;

  /** 生成项目打开阶段的恢复摘要，避免用户只能从诊断日志理解当前状态。 */
  const resolveHydrationFeedback = (
    hydrationResult: WorkspaceProjectHydrationResult,
  ): WorkspaceFeedbackEntry | null => {
    switch (hydrationResult.status) {
      case "failed":
        return {
          kind: "asset-hydration",
          tone: "warning",
          message: "项目已打开，但本地图片资源恢复失败；当前先按原始引用展示，建议重新检查相关图片资源。",
        };
      case "partial-missing":
        return {
          kind: "asset-hydration",
          tone: "warning",
          message:
            hydrationResult.missingAssetIds.length === 1
              ? "项目已恢复，但有 1 个本地图片资源缺失，相关位置仍保留原始引用。"
              : `项目已恢复，但有 ${hydrationResult.missingAssetIds.length} 个本地图片资源缺失，相关位置仍保留原始引用。`,
        };
      case "storage-unavailable":
        if (
          hydrationResult.restoredAssetCount === 0
          && hydrationResult.missingAssetIds.length === 0
          && hydrationResult.referencedLocalAssetCount === 0
        ) {
          return null;
        }

        return {
          kind: "asset-hydration",
          tone: "warning",
          message: "当前环境无法访问本地图片仓库，项目已按原始引用恢复；若图片未显示，需在支持 IndexedDB 的环境中重新打开。",
        };
      case "complete":
      default:
        if (hydrationResult.restoredAssetCount === 0) {
          return null;
        }

        return {
          kind: "asset-hydration",
          tone: "success",
          message:
            hydrationResult.restoredAssetCount === 1
              ? "项目已恢复，1 个本地图片资源已从本地仓库加载。"
              : `项目已恢复，${hydrationResult.restoredAssetCount} 个本地图片资源已从本地仓库加载。`,
        };
    }
  };

  /** 生成保存阶段的韧性反馈，补齐资源仓库不可用时的显式提示。 */
  const resolvePersistResilienceFeedback = (
    summary: PersistAssetResilienceSummary,
  ): WorkspaceFeedbackEntry | null => {
    if (summary.storageStatus !== "unavailable" || summary.skippedLocalDataUrlCount === 0) {
      return null;
    }

    return {
      kind: "save-resilience",
      tone: "warning",
      message: "当前环境无法访问本地图片仓库，项目已保存，但本地图片将继续以原始 data URL 形式保留。",
    };
  };

  /** 写入一条操作类反馈，供导入、导出等显式动作复用。 */
  const setOperationFeedback = (
    tone: WorkspaceFeedbackTone,
    message: string,
  ) => {
    operationFeedback.value = {
      kind: "operation",
      tone,
      message,
    };
  };

  /** 写入一条资源类反馈，避免缺失资产或缩略图失败时继续静默。 */
  const setResourceFeedback = (
    kind: Exclude<WorkspaceFeedbackKind, "operation">,
    tone: WorkspaceFeedbackTone,
    message: string,
  ) => {
    resourceFeedback.value = {
      kind,
      tone,
      message,
    };
  };

  /** 按需清理资源类反馈，避免旧警告在问题消失后继续残留。 */
  const clearResourceFeedback = (
    kind?: Exclude<WorkspaceFeedbackKind, "operation">,
  ) => {
    if (!resourceFeedback.value) {
      return;
    }

    if (!kind || resourceFeedback.value.kind === kind) {
      resourceFeedback.value = null;
    }
  };

  /** 把当前页面状态拼成一条可保存的项目记录。 */
  const buildProjectRecord = () => buildProjectWorkspaceRecord({
    projectId: options.projectId.value,
    projectTitle: projectTitle.value,
    documentModel: documentModel.value,
    slideThumbnails: slideThumbnails.value,
    workspaceState: workspaceState.value,
  });

  /** 保存前主动向编辑器拉取当前页截图，保证当前页封面与最新画布保持一致。 */
  const syncActiveSlideThumbnailBeforeSave = async () => {
    try {
      const captured = await options.captureActiveSlideThumbnail();
      if (!captured) {
        if (resolveCurrentSlideId()) {
          setResourceFeedback(
            "thumbnail",
            "warning",
            "当前页面已保存，但本页资源暂时无法生成封面截图，项目列表中的缩略图可能不会立即更新。",
          );
          workspaceDiagnosticLogger.warn({
            event: "project.thumbnail.capture.skipped",
            message: "保存前未能拿到当前页缩略图，已保留上一版封面继续保存项目",
            context: buildWorkspaceDiagnosticContext({
              slideId: resolveCurrentSlideId(),
            }),
          });
        }
        return;
      }

      clearResourceFeedback("thumbnail");
      slideThumbnails.value = mergeCapturedSlideThumbnail(slideThumbnails.value, captured);
    } catch (error) {
      setResourceFeedback(
        "thumbnail",
        "warning",
        "当前页面已保存，但封面截图更新失败，项目列表中的缩略图可能不会立即更新。",
      );
      workspaceDiagnosticLogger.warn({
        event: "project.thumbnail.capture.failed",
        message: "保存前导出当前页缩略图失败，已跳过封面更新继续保存项目",
        context: buildWorkspaceDiagnosticContext({
          slideId: resolveCurrentSlideId(),
        }),
        error,
      });
    }
  };

  /** 真正执行一次自动保存；若仍被连续编辑阻塞，则延后重试。 */
  const flushAutoSave = async () => {
    if (isHydrating.value || !documentModel.value) {
      return;
    }

    const autoSaveBlockReason = resolveAutoSaveBlockReason();
    if (autoSaveBlockReason) {
      deferAutoSave(autoSaveBlockReason);
      return;
    }

    await persistProject("auto");
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

    hasLoggedAutoSaveBlock = false;
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
      const previousProjectRecord = projectRepository.get(projectRecord.id);
      const normalizedAssets = await normalizeProjectDocumentAssetSources(
        projectRecord.document,
        projectRecord.id,
      );
      const persistAssetResilienceSummary: PersistAssetResilienceSummary = {
        storageStatus: normalizedAssets.storageStatus,
        assetCount: normalizedAssets.assetIds.length,
        rewrittenAssetCount: normalizedAssets.rewrittenAssetCount,
        skippedLocalDataUrlCount: normalizedAssets.skippedLocalDataUrlCount,
      };
      const persistResilienceFeedback = resolvePersistResilienceFeedback(
        persistAssetResilienceSummary,
      );
      const savedRecord = projectRepository.save({
        ...projectRecord,
        document: normalizedAssets.document,
      });
      projectTitle.value = savedRecord.title;
      lastSavedAt.value = savedRecord.updatedAt;
      saveStatus.value = "saved";
      operationFeedback.value = null;
      if (persistResilienceFeedback) {
        resourceFeedback.value = persistResilienceFeedback;
      } else {
        clearResourceFeedback("save-resilience");
      }
      void cleanupRemovedWorkspaceAssets(
        resolveRemovedWorkspaceAssetIds(
          previousProjectRecord?.document,
          normalizedAssets.assetIds,
        ),
        {
          buildDiagnosticContext: buildWorkspaceDiagnosticContext,
          diagnosticLogger: workspaceDiagnosticLogger,
        },
      );

      workspaceDiagnosticLogger.info({
        event: "project.save.completed",
        message: trigger === "auto" ? "自动保存成功" : "项目保存成功",
        context: buildWorkspaceDiagnosticContext({
          trigger,
          updatedAt: savedRecord.updatedAt,
          assetCount: normalizedAssets.assetIds.length,
          assetStorageStatus: persistAssetResilienceSummary.storageStatus,
          rewrittenAssetCount: normalizedAssets.rewrittenAssetCount,
          slideCount: savedRecord.document.slides.length,
        }),
      });

      return true;
    } catch (error) {
      saveStatus.value = "error";
      setOperationFeedback(
        "error",
        trigger === "auto"
          ? "自动保存失败，请稍后重试；当前修改仍保留在页面中。"
          : "项目保存失败，请稍后重试；当前修改仍保留在页面中。",
      );
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

    hasLoggedAutoSaveBlock = false;
    saveStatus.value = "dirty";
    workspaceDiagnosticLogger.debug({
      event: "project.autosave.scheduled",
      message: "已重新安排自动保存",
      context: buildWorkspaceDiagnosticContext({
        delayMs: AUTO_SAVE_DELAY_MS,
      }),
    });
    queueAutoSave(AUTO_SAVE_DELAY_MS);
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
  const loadProject = async () => {
    projectRepository.ensureSeededProjects();
    isLoading.value = true;
    isProjectMissing.value = false;
    isHydrating.value = true;
    operationFeedback.value = null;
    clearResourceFeedback();
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

    const hydrationResult = await hydrateWorkspaceProjectDocument(projectRecord, {
      buildDiagnosticContext: buildWorkspaceDiagnosticContext,
      diagnosticLogger: workspaceDiagnosticLogger,
    });
    const hydrationFeedback = resolveHydrationFeedback(hydrationResult);
    if (hydrationFeedback) {
      resourceFeedback.value = hydrationFeedback;
    } else {
      clearResourceFeedback("asset-hydration");
    }

    projectTitle.value = projectRecord.title;
    documentModel.value = hydrationResult.document;
    slideThumbnails.value = projectRecord.slideThumbnails;
    hydrateWorkspaceState(projectRecord);
    editorSnapshot.value = null;
    lastSavedAt.value = projectRecord.updatedAt;
    saveStatus.value = "saved";
    isLoading.value = false;

    workspaceDiagnosticLogger.info({
      event: "project.load.completed",
      message: "已加载本地项目",
      context: buildWorkspaceDiagnosticContext({
        slideCount: projectRecord.document.slides.length,
        assetHydrationStatus: hydrationResult.status,
        restoredAssetCount: hydrationResult.restoredAssetCount,
        missingAssetCount: hydrationResult.missingAssetIds.length,
      }),
    });

    queueMicrotask(() => {
      isHydrating.value = false;
    });
  };

  /** 记录一条导入导出反馈，供顶部状态区展示。 */
  const setIoFeedback = (tone: WorkspaceFeedbackTone, message: string) => {
    setOperationFeedback(tone, message);
  };

  /** 导出当前项目的标准 JSON。 */
  const handleJsonExportClick = async () => {
    const projectRecord = buildProjectRecord();
    if (!projectRecord) {
      workspaceDiagnosticLogger.warn({
        event: "project.export.skipped",
        message: "JSON 导出已跳过，因为当前没有可导出的项目数据",
        context: buildWorkspaceDiagnosticContext(),
      });
      return;
    }

    try {
      const exportDocument = await resolveWorkspaceExportDocument(projectRecord);
      const exportedFileName = downloadCoursewareJson(exportDocument, projectRecord.title);
      setIoFeedback("success", `已导出 ${exportedFileName}`);
      workspaceDiagnosticLogger.info({
        event: "project.export.completed",
        message: "已导出课件 JSON",
        context: buildWorkspaceDiagnosticContext({
          fileName: exportedFileName,
          slideCount: exportDocument.slides.length,
        }),
      });
    } catch (error) {
      setIoFeedback("error", formatCoursewareJsonError(error));
      workspaceDiagnosticLogger.error({
        event: "project.export.failed",
        message: "课件 JSON 导出失败",
        context: buildWorkspaceDiagnosticContext(),
        error,
      });
    }
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
    resetWorkspaceState();
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
    const nextSlideThumbnails = mergeCapturedSlideThumbnail(slideThumbnails.value, payload);
    if (nextSlideThumbnails === slideThumbnails.value) {
      return;
    }

    slideThumbnails.value = nextSlideThumbnails;
    scheduleAutoSave();
  };

  /** 接收时间轴面板的折叠态变化，并走项目级自动保存链路持久化。 */
  const handleTimelineCollapsedStepIdsChange = (
    payload: TimelineCollapsedStepIdsChangePayload,
  ) => {
    if (!updateTimelineCollapsedStepIds(payload)) {
      return;
    }

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
    (nextProjectId, previousProjectId) => {
      if (previousProjectId && previousProjectId !== nextProjectId) {
        clearProjectAssetSourceCache(previousProjectId);
      }

      void loadProject();
    },
    { immediate: true },
  );

  /** 页面销毁时清理自动保存计时器。 */
  onBeforeUnmount(() => {
    clearSaveTimer();
    clearProjectAssetSourceCache(options.projectId.value);
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
    handleTimelineCollapsedStepIdsChange,
    ioFeedback,
    isHydrating,
    isLoading,
    isProjectMissing,
    projectTitle,
    saveStatusHint,
    saveStatusLabel,
    saveStatusTagColor,
    slideThumbnails,
    workspaceState,
  };
}
