<script setup lang="ts">
import type { RequestOption } from "@arco-design/web-vue";
import {
  IconCheckCircleFill,
  IconEdit,
  IconExclamationCircleFill,
  IconLeft,
  IconLoading,
} from "@arco-design/web-vue/es/icon";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ProjectWorkspaceMode } from "../projects/types";
import type { WorkspaceSaveStatus } from "./useWorkspaceSaveStatus";

/** 工作台模式切换控件传回值的兼容类型。 */
type WorkspaceModeToggleValue = string | number | boolean;

/** 顶栏导入导出反馈的只读结构。 */
interface WorkspaceIoFeedback {
  /** 当前反馈序号。 */
  id: number;
  /** 当前反馈语义。 */
  tone: "success" | "error" | "warning";
  /** 当前反馈文案。 */
  message: string;
}

/** 工作台顶栏的只读输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前项目标题。 */
    projectTitle: string;
    /** 当前工作区模式。 */
    workspaceMode: ProjectWorkspaceMode;
    /** 当前保存状态枚举。 */
    saveStatus: WorkspaceSaveStatus;
    /** 保存状态对应的标签文案。 */
    saveStatusLabel: string;
    /** 保存状态展开时展示的辅助说明。 */
    saveStatusDetail: string;
    /** 最近一次需要在顶栏显式提示用户的反馈。 */
    ioFeedback?: WorkspaceIoFeedback | null;
    /** Arco Upload 使用的 JSON 导入请求处理器。 */
    jsonImportRequest: (option: RequestOption) => Promise<Record<string, never>> | Record<string, never>;
  }>(),
  {
    ioFeedback: null,
  },
);

/** 工作台顶栏向外派发的操作意图。 */
const emit = defineEmits<{
  /** 请求返回项目列表。 */
  back: [];
  /** 请求更新项目标题。 */
  "update:title": [title: string];
  /** 请求切换编辑 / 预览模式。 */
  "change:mode": [mode: ProjectWorkspaceMode];
  /** 请求导出当前项目 JSON。 */
  export: [];
  /** 请求保存当前项目。 */
  save: [];
}>();

/** 把顶部输入框的值统一转成字符串。 */
const handleProjectTitleInput = (value: string | number) => {
  emit("update:title", String(value ?? ""));
};

/** 判断当前值是否为工作台支持的模式。 */
const isWorkspaceMode = (value: WorkspaceModeToggleValue): value is ProjectWorkspaceMode =>
  value === "edit" || value === "preview";

/** 处理顶部模式切换。 */
const handleWorkspaceModeChange = (nextMode: WorkspaceModeToggleValue) => {
  if (!isWorkspaceMode(nextMode)) {
    return;
  }

  emit("change:mode", nextMode);
};

/** “已保存”态在 3 秒后收起文字，只保留状态图标。 */
const isSaveStatusTextCollapsed = ref(false);

/** “已保存”态收起文字的定时器。 */
let saveStatusCollapseTimer: ReturnType<typeof setTimeout> | null = null;

/** 清理保存状态文字收起定时器。 */
const clearSaveStatusCollapseTimer = () => {
  if (!saveStatusCollapseTimer) {
    return;
  }

  clearTimeout(saveStatusCollapseTimer);
  saveStatusCollapseTimer = null;
};

/** 根据当前状态同步顶部状态指示器的展开与收起。 */
const syncSaveStatusIndicator = (nextSaveStatus: WorkspaceSaveStatus) => {
  clearSaveStatusCollapseTimer();
  isSaveStatusTextCollapsed.value = false;
  if (nextSaveStatus !== "saved") {
    return;
  }

  saveStatusCollapseTimer = setTimeout(() => {
    isSaveStatusTextCollapsed.value = true;
  }, 3000);
};

/** 当前保存状态是否需要点击查看详情。 */
const isSaveStatusClickable = computed(() => props.saveStatus === "error");

/** 保存状态指示器的语义类名。 */
const saveStatusIndicatorClassName = computed(() => [
  "save-status-indicator",
  `is-${props.saveStatus}`,
  {
    "is-clickable": isSaveStatusClickable.value,
    "is-collapsed": props.saveStatus === "saved" && isSaveStatusTextCollapsed.value,
  },
]);

watch(
  () => props.saveStatus,
  (nextSaveStatus) => {
    syncSaveStatusIndicator(nextSaveStatus);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearSaveStatusCollapseTimer();
});
</script>

<template>
  <header class="workspace-topbar">
    <div class="topbar-main-row">
      <div class="topbar-primary-row">
        <a-button
          class="back-button"
          aria-label="返回项目列表"
          shape="circle"
          type="outline"
          @click="emit('back')"
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
            :custom-request="props.jsonImportRequest"
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

          <a-button class="utility-button" type="outline" @click="emit('export')">
            导出 JSON
          </a-button>

          <a-button type="primary" @click="emit('save')">保存</a-button>

          <a-popover
            :content="saveStatusDetail"
            :trigger="isSaveStatusClickable ? 'click' : 'hover'"
            position="bl"
          >
            <button
              :class="saveStatusIndicatorClassName"
              :data-save-status="saveStatus"
              :data-save-status-label="saveStatusLabel"
              type="button"
            >
              <IconCheckCircleFill v-if="saveStatus === 'saved'" class="save-status-icon" />
              <IconLoading v-else-if="saveStatus === 'saving'" class="save-status-icon" />
              <IconEdit v-else-if="saveStatus === 'dirty'" class="save-status-icon" />
              <IconExclamationCircleFill v-else class="save-status-icon" />
              <span class="save-status-text">{{ saveStatusLabel }}</span>
            </button>
          </a-popover>

          <div class="save-inline-meta">
            <a-tag bordered size="small">{{ saveStatusLabel }}</a-tag>
            <small>{{ saveStatusDetail }}</small>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="ioFeedback"
      class="io-feedback"
      :data-feedback-id="ioFeedback.id"
    >
      {{ ioFeedback.message }}
    </div>
  </header>
</template>
