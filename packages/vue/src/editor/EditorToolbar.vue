<script setup lang="ts">
import LocalImageFileTrigger from "./LocalImageFileTrigger.vue";

/** 编辑器工具条的只读状态输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前是否允许执行撤销。 */
    canUndo?: boolean;
    /** 当前是否允许执行重做。 */
    canRedo?: boolean;
  }>(),
  {
    canUndo: false,
    canRedo: false,
  },
);

/** 编辑器工具条向外派发的操作意图。 */
const emit = defineEmits<{
  /** 新增文本节点。 */
  "add-text": [];
  /** 新增矩形节点。 */
  "add-rect": [];
  /** 新增空图片节点。 */
  "add-image": [];
  /** 从本地文件导入图片。 */
  "import-image": [file: File];
  /** 从本地文件直接设置当前页面背景图。 */
  "set-background-image": [file: File];
  /** 执行一次撤销。 */
  undo: [];
  /** 执行一次重做。 */
  redo: [];
}>();

/** 把文件选择事件转发给父层统一处理。 */
const handleImageFileSelect = (file: File) => {
  emit("import-image", file);
};

/** 把文件选择事件转发给父层，用于直接设置当前页背景图。 */
const handleBackgroundImageFileSelect = (file: File) => {
  emit("set-background-image", file);
};
</script>

<template>
  <section class="toolbar-shell panel-shell">
    <div class="toolbar-group toolbar-group-insert">
      <span class="toolbar-caption">插入</span>
      <a-button class="toolbar-action-button" type="text" @click="emit('add-text')">文本</a-button>
      <a-button class="toolbar-action-button" type="text" @click="emit('add-rect')">矩形</a-button>
      <LocalImageFileTrigger
        aria-label="插入图片"
        label="图片"
        variant="toolbar"
        @select="handleImageFileSelect"
      />
      <LocalImageFileTrigger
        aria-label="上传图片并设为当前页背景"
        label="设为背景"
        variant="toolbar"
        @select="handleBackgroundImageFileSelect"
      />
      <a-button class="toolbar-action-button" type="text" @click="emit('add-image')">图片框</a-button>
    </div>

    <div class="toolbar-group toolbar-group-history">
      <span class="toolbar-caption">历史</span>
      <a-button
        class="toolbar-action-button"
        type="text"
        :disabled="!props.canUndo"
        @click="emit('undo')"
      >
        撤销
      </a-button>
      <a-button
        class="toolbar-action-button"
        type="text"
        :disabled="!props.canRedo"
        @click="emit('redo')"
      >
        重做
      </a-button>
    </div>
  </section>
</template>

<style scoped>
.toolbar-shell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--cw-color-border) 92%, #ffffff);
  background: rgba(255, 255, 255, 0.96);
}

.panel-shell {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.toolbar-caption {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cw-color-muted);
}

.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.toolbar-group-insert,
.toolbar-group-history {
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid color-mix(in srgb, var(--cw-color-border) 88%, #ffffff);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.toolbar-group-insert .toolbar-caption,
.toolbar-group-history .toolbar-caption {
  padding: 0 8px 0 4px;
}

.toolbar-action-button {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-color-primary);
}

.toolbar-action-button:hover {
  color: #0f6bff;
  background: rgba(22, 93, 255, 0.08);
}

.toolbar-group-history :deep(.arco-btn.arco-btn-disabled) {
  color: color-mix(in srgb, var(--cw-color-muted) 80%, #ffffff);
}
</style>
