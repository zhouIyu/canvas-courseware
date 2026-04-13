<script setup lang="ts">
import type { RequestOption } from "@arco-design/web-vue";
import { IconLeft } from "@arco-design/web-vue/es/icon";
import type { ProjectWorkspaceMode } from "../projects/types";

/** 工作台模式切换控件传回值的兼容类型。 */
type WorkspaceModeToggleValue = string | number | boolean;

/** 顶栏导入导出反馈的只读结构。 */
interface WorkspaceIoFeedback {
  /** 当前反馈语义。 */
  tone: "success" | "error";
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
    /** 保存状态对应的标签文案。 */
    saveStatusLabel: string;
    /** 保存状态对应的标签颜色。 */
    saveStatusTagColor: string;
    /** 保存状态对应的辅助提示。 */
    saveStatusHint: string;
    /** 最近一次导入导出的反馈。 */
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
</template>
