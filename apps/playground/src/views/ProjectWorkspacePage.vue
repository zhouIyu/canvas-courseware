<script setup lang="ts">
import { CoursewareEditor, CoursewarePreview } from "@canvas-courseware/vue";
import {
  computed,
  ref,
  type ComponentPublicInstance,
  watch,
  onBeforeUnmount,
  onMounted,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  attachWorkspaceDiagnosticsBridge,
  detachWorkspaceDiagnosticsBridge,
  workspaceDiagnosticLogger,
} from "../diagnostics/workspace-diagnostics";
import type { ProjectWorkspaceMode } from "../projects/types";
import WorkspaceTopbar from "../workspace/WorkspaceTopbar.vue";
import { useProjectWorkspacePersistence } from "../workspace/useProjectWorkspacePersistence";
import "./ProjectWorkspacePage.css";

/** 外部驱动预览器从指定步骤开始播放的请求结构。 */
interface PreviewPlaybackRequest {
  /** 用来区分重复请求的唯一 key。 */
  key: number;
  /** 需要切入的 slide id。 */
  slideId: string | null;
  /** 需要作为下一步焦点的步骤索引。 */
  stepIndex: number;
}

/** 编辑器对应用层暴露的应用协作能力。 */
interface CoursewareEditorExposed {
  /** 导出当前激活页的缩略图截图结果。 */
  captureActiveSlideThumbnail: () => Promise<{
    /** 已完成截图的 slide id。 */
    slideId: string;
    /** 当前 slide 对应的缩略图 data URL。 */
    thumbnail: string;
  } | null>;
  /** 判断当前是否仍处于文本内联编辑态。 */
  isInlineTextEditingActive: () => boolean;
  /** 读取当前自动保存需要暂缓的原因。 */
  getAutoSaveBlockReason: () => "inline-text-editing" | "canvas-transform" | null;
}

/** 当前路由实例。 */
const route = useRoute();

/** 当前路由跳转实例。 */
const router = useRouter();

/** 外部驱动预览器从指定步骤开始播放的请求。 */
const previewPlaybackRequest = ref<PreviewPlaybackRequest | null>(null);

/** 工作区内容容器引用，用来计算可用高度。 */
const workspaceStageRef = ref<HTMLElement | null>(null);

/** 编辑器组件引用，供保存前主动导出当前页缩略图。 */
const workspaceEditorRef = ref<(ComponentPublicInstance & CoursewareEditorExposed) | null>(null);

/** 当前工作区可分配给编辑器/预览器的净高度。 */
const workspaceViewportHeight = ref(0);

/** 当前项目 id。 */
const projectId = computed(() => String(route.params.projectId ?? ""));

/** 规范化后的工作模式。 */
const workspaceMode = computed<ProjectWorkspaceMode>(() => {
  const rawMode = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode;
  return rawMode === "preview" ? "preview" : "edit";
});

/** 统一传给编辑器和预览器的工作区高度。 */
const workspaceContentHeight = computed(() =>
  workspaceViewportHeight.value > 0 ? workspaceViewportHeight.value : undefined,
);

/** 收敛项目加载、自动保存与导入导出链路。 */
const {
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
  isLoading,
  isProjectMissing,
  projectTitle,
  saveStatusHint,
  saveStatusLabel,
  saveStatusTagColor,
  slideThumbnails,
} = useProjectWorkspacePersistence({
  projectId,
  workspaceMode,
  captureActiveSlideThumbnail: async () =>
    (await workspaceEditorRef.value?.captureActiveSlideThumbnail?.()) ?? null,
  resolveAutoSaveBlockReason: () =>
    workspaceEditorRef.value?.getAutoSaveBlockReason?.() ?? null,
});

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

/** 页面销毁时清理自动保存计时器。 */
onBeforeUnmount(() => {
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
      <WorkspaceTopbar
        :io-feedback="ioFeedback"
        :json-import-request="handleJsonImportRequest"
        :project-title="projectTitle"
        :save-status-hint="saveStatusHint"
        :save-status-label="saveStatusLabel"
        :save-status-tag-color="saveStatusTagColor"
        :workspace-mode="workspaceMode"
        @back="goBackToProjects"
        @change:mode="switchWorkspaceMode"
        @export="handleJsonExportClick"
        @save="handleSaveClick"
        @update:title="handleProjectTitleInput"
      />

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
