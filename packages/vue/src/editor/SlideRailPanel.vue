<script setup lang="ts">
import type { Slide } from "@canvas-courseware/core";
import { computed, ref } from "vue";

/** slide 重命名事件的载荷。 */
interface SlideRenamePayload {
  /** 目标 slide id。 */
  slideId: string;
  /** 更新后的 slide 名称。 */
  name: string;
}

/** slide 拖拽排序事件的载荷。 */
interface SlideReorderPayload {
  /** 被拖拽的 slide id。 */
  slideId: string;
  /** 放下后的最终索引。 */
  index: number;
}

/** 当前拖拽指示器的停靠位置。 */
type SlideDropPlacement = "before" | "after";

/** 当前拖拽命中的目标信息。 */
interface SlideDropState {
  /** 当前命中的 slide id。 */
  slideId: string;
  /** 相对于命中 slide 的放置方向。 */
  placement: SlideDropPlacement;
}

/** 页面栏组件输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前文档里的全部 slide。 */
    slides: Slide[];
    /** 当前激活的 slide id。 */
    activeSlideId?: string | null;
  }>(),
  {
    activeSlideId: null,
  },
);

/** 页面栏向外派发的标准事件。 */
const emit = defineEmits<{
  /** 激活某一页。 */
  activate: [slideId: string];
  /** 新建第一页或末尾新页。 */
  create: [];
  /** 在指定页后快速新增下一页。 */
  "create-after": [slideId: string];
  /** 复制当前页。 */
  duplicate: [slideId: string];
  /** 删除指定页。 */
  remove: [slideId: string];
  /** 更新指定页名称。 */
  rename: [payload: SlideRenamePayload];
  /** 调整指定页顺序。 */
  reorder: [payload: SlideReorderPayload];
}>();

/** 当前正在编辑名称的 slide id。 */
const editingSlideId = ref<string | null>(null);

/** 当前名称输入框中的值。 */
const editingSlideName = ref("");

/** 当前被拖拽的 slide id。 */
const draggedSlideId = ref<string | null>(null);

/** 当前拖拽命中的落点信息。 */
const dropState = ref<SlideDropState | null>(null);

/** 页面数量摘要，供顶部说明复用。 */
const slideSummary = computed(() =>
  props.slides.length > 0 ? `共 ${props.slides.length} 页，可拖拽排序` : "还没有页面，先新建一页",
);

/** 激活指定页面。 */
const activateSlide = (slideId: string) => {
  emit("activate", slideId);
};

/** 用键盘触发页面卡片激活，补齐无鼠标场景。 */
const handleCardKeydown = (event: KeyboardEvent, slideId: string) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  activateSlide(slideId);
};

/** 进入页面名称编辑态。 */
const startRename = (slide: Slide) => {
  editingSlideId.value = slide.id;
  editingSlideName.value = slide.name;
};

/** 退出页面名称编辑态。 */
const cancelRename = () => {
  editingSlideId.value = null;
  editingSlideName.value = "";
};

/** 同步输入框中的页面名称。 */
const handleRenameInput = (value: string | number | undefined) => {
  editingSlideName.value = typeof value === "string" ? value : String(value ?? "");
};

/** 提交页面名称更新，空值时保留原名称。 */
const commitRename = (slide: Slide) => {
  const nextName = editingSlideName.value.trim();
  const resolvedName = nextName || slide.name;

  if (resolvedName !== slide.name) {
    emit("rename", {
      slideId: slide.id,
      name: resolvedName,
    });
  }

  cancelRename();
};

/** 处理名称编辑时的回车确认与 Escape 取消。 */
const handleRenameKeydown = (event: KeyboardEvent, slide: Slide) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitRename(slide);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    cancelRename();
  }
};

/** 开始拖拽一张页面卡片。 */
const handleDragStart = (slideId: string, event: DragEvent) => {
  draggedSlideId.value = slideId;
  dropState.value = null;

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", slideId);
  }
};

/** 在拖拽经过某张页面时，计算当前是前插还是后插。 */
const handleDragOver = (slideId: string, event: DragEvent) => {
  if (!draggedSlideId.value) {
    return;
  }

  event.preventDefault();

  if (draggedSlideId.value === slideId) {
    dropState.value = null;
    return;
  }

  const currentTarget = event.currentTarget;
  if (!(currentTarget instanceof HTMLElement)) {
    return;
  }

  const bounds = currentTarget.getBoundingClientRect();
  const placement: SlideDropPlacement =
    event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";

  dropState.value = {
    slideId,
    placement,
  };

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
};

/** 拖拽结束后清理高亮状态。 */
const resetDragState = () => {
  draggedSlideId.value = null;
  dropState.value = null;
};

/** 在页面卡片上完成拖放并派发新的排序索引。 */
const handleDrop = (slideId: string, event: DragEvent) => {
  event.preventDefault();

  if (!draggedSlideId.value || !dropState.value || draggedSlideId.value === slideId) {
    resetDragState();
    return;
  }

  const nextIndex = resolveDropIndex(
    draggedSlideId.value,
    slideId,
    dropState.value.placement,
    props.slides,
  );

  if (nextIndex !== null) {
    emit("reorder", {
      slideId: draggedSlideId.value,
      index: nextIndex,
    });
  }

  resetDragState();
};

/** 计算拖拽放下后对应的最终索引。 */
const resolveDropIndex = (
  draggedId: string,
  targetId: string,
  placement: SlideDropPlacement,
  slides: Slide[],
) => {
  const sourceIndex = slides.findIndex((slide) => slide.id === draggedId);
  const targetIndex = slides.findIndex((slide) => slide.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return null;
  }

  const rawIndex = placement === "before" ? targetIndex : targetIndex + 1;
  const nextIndex = sourceIndex < rawIndex ? rawIndex - 1 : rawIndex;

  return nextIndex === sourceIndex ? null : nextIndex;
};
</script>

<template>
  <section class="slide-rail">
    <div class="rail-toolbar">
      <div class="rail-copy">
        <h3>页面</h3>
        <p>{{ slideSummary }}</p>
      </div>

      <a-button class="rail-create-button" size="small" type="outline" @click="emit('create')">
        新建页面
      </a-button>
    </div>

    <div v-if="slides.length > 0" class="slide-list">
      <article
        v-for="(slide, index) in slides"
        :key="slide.id"
        class="slide-card-shell"
        :class="{
          'is-active': slide.id === activeSlideId,
          'is-dragging': slide.id === draggedSlideId,
          'is-drop-before': dropState?.slideId === slide.id && dropState.placement === 'before',
          'is-drop-after': dropState?.slideId === slide.id && dropState.placement === 'after',
        }"
        draggable="true"
        @dragend="resetDragState"
        @dragover="handleDragOver(slide.id, $event)"
        @dragstart="handleDragStart(slide.id, $event)"
        @drop="handleDrop(slide.id, $event)"
      >
        <div
          class="slide-card"
          :aria-pressed="slide.id === activeSlideId"
          role="button"
          tabindex="0"
          @click="activateSlide(slide.id)"
          @keydown="handleCardKeydown($event, slide.id)"
        >
          <div class="slide-card-top">
            <span class="slide-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="slide-drag-caption">拖拽排序</span>
          </div>

          <div class="slide-thumbnail" :style="{ background: slide.background.fill }">
            <span class="thumb-line long" />
            <span class="thumb-line short" />
            <span class="thumb-dots">
              <i />
              <i />
              <i />
            </span>
          </div>

          <div class="slide-card-copy">
            <div class="slide-name-row">
              <a-input
                v-if="editingSlideId === slide.id"
                class="slide-name-input"
                :model-value="editingSlideName"
                size="small"
                @blur="commitRename(slide)"
                @input="handleRenameInput"
                @keydown.stop="handleRenameKeydown($event, slide)"
              />
              <strong
                v-else
                class="slide-name"
                :title="slide.name"
                @dblclick.stop="startRename(slide)"
              >
                {{ slide.name }}
              </strong>
            </div>

            <div class="slide-meta">
              <span>{{ slide.nodes.length }} 个对象</span>
              <span>{{ slide.timeline.steps.length }} 步</span>
            </div>
          </div>
        </div>

        <div class="slide-card-actions">
          <a-button size="mini" type="text" @click.stop="emit('create-after', slide.id)">
            后插入
          </a-button>
          <a-button size="mini" type="text" @click.stop="emit('duplicate', slide.id)">
            复制
          </a-button>
          <a-button size="mini" type="text" @click.stop="startRename(slide)">
            命名
          </a-button>
          <span @click.stop>
            <a-popconfirm
              :content="`确认删除页面「${slide.name}」吗？`"
              position="top"
              @ok="emit('remove', slide.id)"
            >
              <a-button size="mini" status="danger" type="text">删除</a-button>
            </a-popconfirm>
          </span>
        </div>
      </article>
    </div>

    <a-empty v-else class="rail-empty" description="还没有页面">
      <a-button size="small" type="primary" @click="emit('create')">新建第一页</a-button>
    </a-empty>
  </section>
</template>

<style scoped>
.slide-rail {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  padding: 10px 8px 12px;
  border: 1px solid color-mix(in srgb, var(--cw-color-border) 90%, #ffffff);
  border-radius: 16px;
  background: linear-gradient(180deg, #fbfcfe 0%, #f5f7fa 100%);
}

.rail-toolbar {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
}

.rail-copy {
  display: grid;
  gap: 4px;
}

.rail-copy h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--cw-color-text);
}

.rail-copy p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.rail-create-button {
  width: 100%;
  min-height: 34px;
  border-radius: 10px;
}

.slide-list {
  display: grid;
  gap: 10px;
  align-content: start;
  min-height: 0;
  padding-right: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.slide-card-shell {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  transition:
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard),
    opacity var(--cw-duration-fast) var(--cw-ease-standard);
}

.slide-card-shell::before,
.slide-card-shell::after {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  height: 2px;
  border-radius: 999px;
  background: transparent;
  transition: background var(--cw-duration-fast) var(--cw-ease-standard);
}

.slide-card-shell::before {
  top: -5px;
}

.slide-card-shell::after {
  bottom: -5px;
}

.slide-card-shell:hover {
  border-color: color-mix(in srgb, var(--cw-color-primary) 18%, var(--cw-color-border));
  background: rgba(255, 255, 255, 0.78);
}

.slide-card-shell.is-active {
  border-color: color-mix(in srgb, var(--cw-color-primary) 32%, var(--cw-color-border));
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 10px 20px rgba(9, 30, 66, 0.08);
}

.slide-card-shell.is-active::after {
  background: var(--cw-color-primary);
}

.slide-card-shell.is-dragging {
  opacity: 0.44;
}

.slide-card-shell.is-drop-before::before,
.slide-card-shell.is-drop-after::after {
  background: color-mix(in srgb, var(--cw-color-primary) 86%, #ffffff);
}

.slide-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  cursor: pointer;
  outline: none;
}

.slide-card:focus-visible {
  border-radius: 10px;
  box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.18);
}

.slide-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.slide-index {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cw-color-primary);
}

.slide-drag-caption {
  font-size: 11px;
  line-height: 1.4;
  color: var(--cw-color-muted);
}

.slide-thumbnail {
  display: grid;
  gap: 8px;
  justify-items: center;
  min-height: 78px;
  padding: 12px;
  border: 1px solid #dfe6ee;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
}

.thumb-line {
  display: block;
  height: 6px;
  border-radius: var(--cw-radius-pill);
  background: color-mix(in srgb, var(--cw-color-primary) 66%, #ffffff);
}

.thumb-line.long {
  width: 76px;
}

.thumb-line.short {
  width: 52px;
  opacity: 0.64;
}

.thumb-dots {
  display: flex;
  gap: 6px;
}

.thumb-dots i {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--cw-color-primary) 70%, #ffffff);
}

.slide-card-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.slide-name-row {
  min-width: 0;
}

.slide-name {
  display: block;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--cw-color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slide-name-input {
  width: 100%;
}

.slide-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.slide-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding-top: 2px;
}

.slide-card-actions :deep(.arco-btn) {
  min-height: 26px;
  padding-inline: 6px;
}

.slide-card-actions :deep(.arco-btn-status-danger.arco-btn-text) {
  color: var(--cw-color-danger);
}

.rail-empty {
  align-self: start;
  padding-top: 20px;
}
</style>
