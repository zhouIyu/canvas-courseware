<script setup lang="ts">
import type { CoursewareDocument, EditorSnapshot } from "@canvas-courseware/core";
import { CoursewareEditor, CoursewarePreview } from "@canvas-courseware/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  downloadCoursewareJson,
  formatCoursewareJsonError,
  readCoursewareJsonFile,
} from "../projects/courseware-json";
import { projectRepository } from "../projects/project-repository";
import type { ProjectRecord, ProjectWorkspaceMode } from "../projects/types";

/** 自动保存延时，单位毫秒。 */
const AUTO_SAVE_DELAY_MS = 800;

/** 工作台保存状态。 */
type SaveStatus = "saved" | "saving" | "dirty" | "error";

/** 导入导出反馈语义。 */
type IoFeedbackTone = "success" | "error";

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

/** JSON 导入输入框引用。 */
const jsonImportInputRef = ref<HTMLInputElement | null>(null);

/** 当前是否正在加载项目数据。 */
const isLoading = ref(true);

/** 当前是否找不到项目。 */
const isProjectMissing = ref(false);

/** 当前是否正在把仓库数据灌入页面，避免误触自动保存。 */
const isHydrating = ref(false);

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

/** 当前项目 id。 */
const projectId = computed(() => String(route.params.projectId ?? ""));

/** 规范化后的工作模式。 */
const workspaceMode = computed<ProjectWorkspaceMode>(() => {
  const rawMode = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode;
  return rawMode === "preview" ? "preview" : "edit";
});

/** 当前项目统计信息。 */
const projectStats = computed(() => {
  const document = documentModel.value;
  if (!document) {
    return {
      slideCount: 0,
      nodeCount: 0,
      stepCount: 0,
    };
  }

  return {
    slideCount: document.slides.length,
    nodeCount: document.slides.reduce((sum, slide) => sum + slide.nodes.length, 0),
    stepCount: document.slides.reduce((sum, slide) => sum + slide.timeline.steps.length, 0),
  };
});

/** 当前项目规模的聚合摘要。 */
const projectStatsLabel = computed(
  () =>
    `${projectStats.value.slideCount} 页 · ${projectStats.value.nodeCount} 个对象 · ${projectStats.value.stepCount} 个步骤`,
);

/** 当前预览应跟随的 slide。 */
const activeSlideId = computed(() =>
  editorSnapshot.value?.activeSlideId ?? documentModel.value?.slides[0]?.id ?? null,
);

/** 当前激活页面的序号摘要。 */
const activeSlideLabel = computed(() => {
  const document = documentModel.value;
  const slideId = activeSlideId.value;

  if (!document || !slideId) {
    return "未定位页面";
  }

  const activeIndex = document.slides.findIndex((slide) => slide.id === slideId);
  if (activeIndex === -1) {
    return "未定位页面";
  }

  return `第 ${activeIndex + 1} 页`;
});

/** 当前工作模式的辅助说明。 */
const workspaceModeDescription = computed(() =>
  workspaceMode.value === "edit"
    ? "聚焦排版、图层和时间轴配置"
    : "聚焦播放顺序与逐步预览效果",
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

/** 把当前页面状态拼成一条可保存的项目记录。 */
const buildProjectRecord = (): ProjectRecord | null => {
  if (!documentModel.value || !projectId.value) {
    return null;
  }

  const normalizedTitle = projectTitle.value.trim() || "未命名课件";

  return {
    id: projectId.value,
    title: normalizedTitle,
    updatedAt: new Date().toISOString(),
    thumbnail: documentModel.value.slides[0]?.background.fill ?? null,
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

/** 执行一次显式或自动保存。 */
const persistProject = async (): Promise<boolean> => {
  const projectRecord = buildProjectRecord();
  if (!projectRecord) {
    return false;
  }

  clearSaveTimer();
  saveStatus.value = "saving";

  try {
    const savedRecord = projectRepository.save(projectRecord);
    projectTitle.value = savedRecord.title;
    lastSavedAt.value = savedRecord.updatedAt;
    saveStatus.value = "saved";
    return true;
  } catch {
    saveStatus.value = "error";
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
  saveTimer = setTimeout(() => {
    void persistProject();
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
    isProjectMissing.value = true;
    isLoading.value = false;
    isHydrating.value = false;
    documentModel.value = undefined;
    return;
  }

  projectTitle.value = projectRecord.title;
  documentModel.value = projectRecord.document;
  editorSnapshot.value = null;
  lastSavedAt.value = projectRecord.updatedAt;
  saveStatus.value = "saved";
  isLoading.value = false;

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

/** 跳回项目列表页。 */
const goBackToProjects = async () => {
  await router.push({
    name: "project-list",
  });
};

/** 手动保存当前项目。 */
const handleSaveClick = async () => {
  await persistProject();
};

/** 记录一条导入导出反馈，供顶部状态区展示。 */
const setIoFeedback = (tone: IoFeedbackTone, message: string) => {
  ioFeedback.value = {
    tone,
    message,
  };
};

/** 触发本地 JSON 文件选择。 */
const handleJsonImportClick = () => {
  jsonImportInputRef.value?.click();
};

/** 导出当前项目的标准 JSON。 */
const handleJsonExportClick = () => {
  const projectRecord = buildProjectRecord();
  if (!projectRecord) {
    return;
  }

  const exportedFileName = downloadCoursewareJson(projectRecord.document, projectRecord.title);
  setIoFeedback("success", `已导出 ${exportedFileName}`);
};

/** 把一份导入文档安全地应用到当前工作台并立即保存。 */
const applyImportedDocument = async (nextDocument: CoursewareDocument): Promise<boolean> => {
  const normalizedTitle =
    nextDocument.meta.title.trim() || projectTitle.value.trim() || "未命名课件";

  clearSaveTimer();
  isHydrating.value = true;
  editorSnapshot.value = null;
  projectTitle.value = normalizedTitle;
  documentModel.value = {
    ...nextDocument,
    meta: {
      ...nextDocument.meta,
      title: normalizedTitle,
    },
  };

  try {
    return await persistProject();
  } finally {
    queueMicrotask(() => {
      isHydrating.value = false;
    });
  }
};

/** 读取用户选择的 JSON 文件，并把合法文档导入当前项目。 */
const handleJsonImportChange = async (event: Event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const selectedFile = target.files?.[0];
  target.value = "";

  if (!selectedFile) {
    return;
  }

  try {
    const importedDocument = await readCoursewareJsonFile(selectedFile);
    const saved = await applyImportedDocument(importedDocument);

    if (saved) {
      setIoFeedback("success", `已导入 ${selectedFile.name} 并保存到本地项目`);
      return;
    }

    setIoFeedback("error", `已导入 ${selectedFile.name}，但本地保存失败`);
  } catch (error) {
    setIoFeedback("error", formatCoursewareJsonError(error));
  }
};

/** 顶部标题输入时同步更新项目名和文档名。 */
const handleProjectTitleInput = (event: Event) => {
  const target = event.target;
  const nextTitle = target instanceof HTMLInputElement ? target.value : projectTitle.value;
  projectTitle.value = nextTitle;
  syncDocumentTitle(nextTitle);
  scheduleAutoSave();
};

/** 接收编辑器当前快照，用来同步预览模式的页面位置。 */
const handleSnapshotChange = (snapshot: EditorSnapshot) => {
  editorSnapshot.value = snapshot;
};

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
});
</script>

<template>
  <main class="workspace-page">
    <div v-if="isLoading" class="state-shell">
      <strong>正在加载项目...</strong>
      <p>请稍候，正在恢复本地课件数据。</p>
    </div>

    <div v-else-if="isProjectMissing" class="state-shell">
      <strong>没有找到这个项目</strong>
      <p>项目可能已被删除，或者当前链接已经失效。</p>
      <button class="secondary-button" type="button" @click="goBackToProjects">
        返回项目列表
      </button>
    </div>

    <template v-else-if="documentModel">
      <header class="workspace-topbar">
        <div class="topbar-left">
          <div class="topbar-primary-row">
            <button class="back-button" type="button" @click="goBackToProjects">项目列表</button>

            <label class="title-field">
              <span class="title-label">项目标题</span>
              <input class="title-input" :value="projectTitle" @input="handleProjectTitleInput" />
            </label>
          </div>

          <div class="workspace-overview">
            <div class="workspace-signals">
              <span class="signal-pill accent">
                {{ workspaceMode === "edit" ? "编辑模式" : "预览模式" }}
              </span>
              <span class="signal-pill subtle">{{ activeSlideLabel }}</span>
              <span class="workspace-summary">{{ projectStatsLabel }}</span>
            </div>
            <p class="workspace-mode-copy">{{ workspaceModeDescription }}</p>
          </div>
        </div>

        <div class="topbar-right">
          <div class="topbar-controls">
            <div class="topbar-center">
              <button
                class="mode-button"
                :class="{ 'is-active': workspaceMode === 'preview' }"
                type="button"
                @click="switchWorkspaceMode('preview')"
              >
                预览
              </button>
              <button
                class="mode-button"
                :class="{ 'is-active': workspaceMode === 'edit' }"
                type="button"
                @click="switchWorkspaceMode('edit')"
              >
                编辑
              </button>
            </div>

            <div class="workspace-actions">
              <input
                ref="jsonImportInputRef"
                class="visually-hidden-input"
                type="file"
                accept=".json,application/json"
                @change="handleJsonImportChange"
              />
              <button
                class="secondary-button utility-button"
                type="button"
                @click="handleJsonImportClick"
              >
                导入 JSON
              </button>
              <button
                class="secondary-button utility-button"
                type="button"
                @click="handleJsonExportClick"
              >
                导出 JSON
              </button>
              <button class="primary-button" type="button" @click="handleSaveClick">保存</button>
            </div>
          </div>

          <div class="workspace-status-row">
            <div class="save-meta">
              <span class="save-status" :data-state="saveStatus">{{ saveStatusLabel }}</span>
              <small>{{ saveStatusHint }}</small>
            </div>

            <p
              v-if="ioFeedback"
              class="io-feedback"
              :data-tone="ioFeedback.tone"
              aria-live="polite"
            >
              {{ ioFeedback.message }}
            </p>
          </div>
        </div>
      </header>

      <section class="workspace-stage">
        <CoursewareEditor
          v-show="workspaceMode === 'edit'"
          v-model="documentModel"
          :show-header="false"
          class="workspace-editor"
          @snapshot-change="handleSnapshotChange"
        />

        <CoursewarePreview
          v-show="workspaceMode === 'preview'"
          :document="documentModel"
          :show-header="false"
          :slide-id="activeSlideId"
          class="workspace-preview"
        />
      </section>
    </template>
  </main>
</template>

<style scoped>
.workspace-page {
  display: grid;
  gap: var(--cw-space-4);
  min-width: 0;
  min-height: 100dvh;
  padding: 20px;
}

.workspace-topbar,
.workspace-stage,
.state-shell {
  min-width: 0;
  border: 1px solid var(--cw-color-border);
  border-radius: var(--cw-radius-xl);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.86)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-medium);
}

.workspace-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(420px, 0.95fr);
  gap: var(--cw-space-4);
  align-items: start;
  padding: 14px 18px;
}

.topbar-left,
.topbar-right {
  display: grid;
  min-width: 0;
  gap: var(--cw-space-3);
}

.workspace-overview {
  display: grid;
  gap: 6px;
}

.topbar-primary-row {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--cw-space-3);
}

.topbar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: calc(var(--cw-radius-pill) + 4px);
  background: rgba(255, 255, 255, 0.9);
}

.topbar-right {
  display: grid;
  gap: var(--cw-space-2);
  justify-items: end;
}

.topbar-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--cw-space-2);
  min-width: 0;
}

.back-button,
.mode-button,
.primary-button,
.secondary-button {
  min-height: 44px;
  padding: 0 var(--cw-space-4);
  border-radius: var(--cw-radius-pill);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard);
}

.back-button,
.secondary-button {
  border: 1px solid rgba(13, 148, 136, 0.18);
  color: var(--cw-color-text);
  background: rgba(255, 255, 255, 0.92);
}

.mode-button {
  min-width: 108px;
  border: 0;
  color: var(--cw-color-muted);
  background: transparent;
}

.mode-button.is-active {
  color: #ffffff;
  background: linear-gradient(135deg, #5a8cff, #2d65f2);
}

.primary-button {
  border: 1px solid transparent;
  color: #ffffff;
  background: linear-gradient(135deg, var(--cw-color-primary), var(--cw-color-primary-2));
}

.back-button:hover,
.mode-button:hover,
.primary-button:hover,
.secondary-button:hover {
  transform: translateY(-1px);
}

.title-field {
  display: grid;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.title-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--cw-color-primary);
}

.title-input {
  width: 100%;
  min-height: 46px;
  padding: 0 16px;
  border: 1px solid rgba(19, 78, 74, 0.12);
  border-radius: var(--cw-radius-pill);
  font-size: 16px;
  color: var(--cw-color-text);
  background: #ffffff;
}

.workspace-status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--cw-space-3);
}

.save-meta {
  display: grid;
  justify-items: end;
  gap: 4px;
}

.save-status {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: var(--cw-radius-pill);
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-color-text);
  background: rgba(19, 78, 74, 0.08);
}

.save-status[data-state="saved"] {
  color: var(--cw-color-primary);
  background: rgba(13, 148, 136, 0.12);
}

.save-status[data-state="dirty"] {
  color: var(--cw-color-accent);
  background: rgba(234, 88, 12, 0.12);
}

.save-status[data-state="error"] {
  color: var(--cw-color-danger);
  background: rgba(220, 38, 38, 0.12);
}

.save-meta small {
  font-size: 12px;
  color: var(--cw-color-muted);
}

.workspace-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
  justify-content: flex-end;
  gap: var(--cw-space-2);
}

.workspace-signals {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cw-space-2);
}

.signal-pill {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: var(--cw-radius-pill);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--cw-color-text);
  background: rgba(19, 78, 74, 0.08);
}

.signal-pill.accent {
  color: var(--cw-color-primary);
  background: rgba(13, 148, 136, 0.12);
}

.signal-pill.subtle {
  color: var(--cw-color-muted);
  background: rgba(100, 116, 139, 0.12);
}

.workspace-summary {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--cw-color-text);
}

.workspace-mode-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.utility-button {
  min-height: 38px;
  padding: 0 14px;
  font-size: 13px;
}

.io-feedback {
  margin: 0;
  max-width: 32ch;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.io-feedback[data-tone="success"] {
  color: var(--cw-color-primary);
}

.io-feedback[data-tone="error"] {
  color: var(--cw-color-danger);
}

.visually-hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.workspace-stage {
  min-width: 0;
  padding: 12px;
}

.workspace-editor,
.workspace-preview {
  min-width: 0;
}

.state-shell {
  display: grid;
  gap: var(--cw-space-3);
  justify-items: center;
  margin: auto 0;
  padding: 64px 24px;
  text-align: center;
}

.state-shell strong {
  font-size: 22px;
  color: var(--cw-color-text);
}

.state-shell p {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--cw-color-muted);
}

@media (max-width: 1180px) {
  .workspace-topbar {
    grid-template-columns: 1fr;
  }

  .topbar-controls,
  .topbar-right {
    justify-content: flex-start;
    justify-items: start;
  }

  .workspace-status-row,
  .save-meta {
    justify-items: start;
  }

  .workspace-status-row {
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .workspace-page {
    padding: 12px;
  }

  .topbar-primary-row,
  .topbar-controls {
    flex-wrap: wrap;
  }

  .topbar-center,
  .workspace-actions {
    justify-content: flex-start;
  }

  .io-feedback {
    text-align: left;
  }
}
</style>
