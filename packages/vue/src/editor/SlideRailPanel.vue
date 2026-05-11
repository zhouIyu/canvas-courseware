<script setup lang="ts">
import type { Slide } from "@canvas-courseware/core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createSlideBackgroundStyle } from "../shared";

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

/** slide 右键菜单的定位状态。 */
interface SlideContextMenuState {
  /** 当前右键命中的 slide id。 */
  slideId: string;
  /** 菜单相对于页面栏根容器的横向偏移。 */
  x: number;
  /** 菜单相对于页面栏根容器的纵向偏移。 */
  y: number;
}

/** 右键菜单的预估宽度。 */
const SLIDE_CONTEXT_MENU_WIDTH = 176;

/** 右键菜单的预估高度。 */
const SLIDE_CONTEXT_MENU_HEIGHT = 156;

/** 右键菜单与边界之间的安全距离。 */
const SLIDE_CONTEXT_MENU_MARGIN = 10;

/** 页面栏组件输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前文档里的全部 slide。 */
    slides: Slide[];
    /** 当前激活的 slide id。 */
    activeSlideId?: string | null;
    /** slide 对应的缩略图 data URL，缺省时回退到背景样式。 */
    slideThumbnailMap?: Record<string, string | null>;
  }>(),
  {
    activeSlideId: null,
    slideThumbnailMap: () => ({}),
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

/** 页面栏根容器引用，供右键菜单定位与边界规整复用。 */
const slideRailRef = ref<HTMLElement | null>(null);

/** 页面卡片滚动容器引用，供右键菜单限制在列表区域内。 */
const slideListRef = ref<HTMLElement | null>(null);

/** 当前右键菜单的状态。 */
const contextMenuState = ref<SlideContextMenuState | null>(null);

/** 当前待确认删除的 slide id。 */
const pendingDeleteSlideId = ref<string | null>(null);

/** 页面数量摘要，供顶部说明复用。 */
const slideSummary = computed(() =>
  props.slides.length > 0 ? `共 ${props.slides.length} 页，可拖拽排序` : "还没有页面，先新建一页",
);

/** 根据 slide id 读取当前页面对象。 */
const resolveSlideById = (slideId: string) =>
  props.slides.find((slide) => slide.id === slideId) ?? null;

/** 当前右键菜单命中的 slide。 */
const contextMenuSlide = computed(() =>
  contextMenuState.value ? resolveSlideById(contextMenuState.value.slideId) : null,
);

/** 当前待确认删除的 slide。 */
const pendingDeleteSlide = computed(() =>
  pendingDeleteSlideId.value ? resolveSlideById(pendingDeleteSlideId.value) : null,
);

/** 当前右键菜单对应的定位样式。 */
const slideContextMenuStyle = computed(() => {
  if (!contextMenuState.value) {
    return {};
  }

  return {
    left: `${contextMenuState.value.x}px`,
    top: `${contextMenuState.value.y}px`,
  };
});

/** 生成 slide 缩略图背景样式，优先使用保存后的真实截图。 */
const resolveSlideThumbnailStyle = (slide: Slide) => {
  const thumbnail = props.slideThumbnailMap[slide.id];
  if (!thumbnail) {
    return createSlideBackgroundStyle(slide.background);
  }

  return {
    backgroundColor: slide.background.fill,
    backgroundImage: `url(${JSON.stringify(thumbnail)})`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  };
};

/** 判断某一页当前是否已经有真实缩略图。 */
const hasSlideThumbnail = (slideId: string) => Boolean(props.slideThumbnailMap[slideId]);

/** 激活指定页面。 */
const activateSlide = (slideId: string) => {
  closeContextMenu();
  emit("activate", slideId);
};

/** 用键盘触发页面卡片激活，补齐无鼠标场景。 */
const handleCardKeydown = (event: KeyboardEvent, slideId: string) => {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    openContextMenuFromKeyboard(slideId, event.currentTarget);
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  activateSlide(slideId);
};

/** 进入页面名称编辑态。 */
const startRename = (slide: Slide) => {
  closeContextMenu();
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

/** 关闭当前右键菜单。 */
const closeContextMenu = () => {
  contextMenuState.value = null;
};

/** 关闭删除确认弹窗。 */
const closeDeleteModal = () => {
  pendingDeleteSlideId.value = null;
};

/** 读取右键菜单在当前页面栏中的安全坐标。 */
const resolveContextMenuPosition = (clientX: number, clientY: number) => {
  const railBounds = slideRailRef.value?.getBoundingClientRect();
  if (!railBounds) {
    return {
      x: SLIDE_CONTEXT_MENU_MARGIN,
      y: SLIDE_CONTEXT_MENU_MARGIN,
    };
  }

  const listBounds = slideListRef.value?.getBoundingClientRect() ?? railBounds;
  const minX = listBounds.left - railBounds.left + SLIDE_CONTEXT_MENU_MARGIN;
  const maxX = listBounds.right - railBounds.left - SLIDE_CONTEXT_MENU_WIDTH - SLIDE_CONTEXT_MENU_MARGIN;
  const minY = listBounds.top - railBounds.top + SLIDE_CONTEXT_MENU_MARGIN;
  const maxY = listBounds.bottom - railBounds.top - SLIDE_CONTEXT_MENU_HEIGHT - SLIDE_CONTEXT_MENU_MARGIN;

  return {
    x: Math.min(Math.max(clientX - railBounds.left, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(clientY - railBounds.top, minY), Math.max(minY, maxY)),
  };
};

/** 打开指定页面对应的右键菜单。 */
const openContextMenu = (slideId: string, clientX: number, clientY: number) => {
  if (!resolveSlideById(slideId)) {
    return;
  }

  contextMenuState.value = {
    slideId,
    ...resolveContextMenuPosition(clientX, clientY),
  };
};

/** 判断当前右键目标是否应保留浏览器原生菜单。 */
const shouldKeepNativeContextMenu = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest("input, textarea, .arco-input-wrapper, .arco-textarea-wrapper"));

/** 在页面卡片上打开右键菜单。 */
const handleSlideCardContextMenu = (slideId: string, event: MouseEvent) => {
  if (draggedSlideId.value || shouldKeepNativeContextMenu(event.target)) {
    return;
  }

  event.preventDefault();
  openContextMenu(slideId, event.clientX, event.clientY);
};

/** 通过键盘为当前聚焦页面卡片打开右键菜单。 */
const openContextMenuFromKeyboard = (slideId: string, currentTarget: EventTarget | null) => {
  if (!(currentTarget instanceof HTMLElement)) {
    return;
  }

  const bounds = currentTarget.getBoundingClientRect();
  openContextMenu(slideId, bounds.right - 12, bounds.top + Math.min(bounds.height / 2, 48));
};

/** 从右键菜单中在当前页后插入一页。 */
const handleContextMenuCreateAfter = () => {
  if (!contextMenuState.value) {
    return;
  }

  const { slideId } = contextMenuState.value;
  closeContextMenu();
  emit("create-after", slideId);
};

/** 从右键菜单中复制当前页。 */
const handleContextMenuDuplicate = () => {
  if (!contextMenuState.value) {
    return;
  }

  const { slideId } = contextMenuState.value;
  closeContextMenu();
  emit("duplicate", slideId);
};

/** 从右键菜单中打开删除确认弹窗。 */
const handleContextMenuDelete = () => {
  if (!contextMenuState.value) {
    return;
  }

  pendingDeleteSlideId.value = contextMenuState.value.slideId;
  closeContextMenu();
};

/** 确认删除当前弹窗中的目标页。 */
const handleDeleteConfirm = () => {
  if (!pendingDeleteSlide.value) {
    return;
  }

  emit("remove", pendingDeleteSlide.value.id);
  closeDeleteModal();
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
  closeContextMenu();
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

/** 页面栏滚动时关闭旧菜单，避免悬浮在错误位置。 */
const handleSlideListScroll = () => {
  closeContextMenu();
};

/** 点击页面栏外部时关闭右键菜单。 */
const handleDocumentPointerDown = (event: PointerEvent) => {
  const target = event.target;

  if (target instanceof HTMLElement && target.closest(".slide-context-menu")) {
    return;
  }

  closeContextMenu();
};

/** 按下 Escape 时关闭右键菜单与删除确认弹窗。 */
const handleWindowKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Escape") {
    return;
  }

  closeContextMenu();
  closeDeleteModal();
};

watch(
  () => editingSlideId.value,
  (slideId) => {
    if (slideId) {
      closeContextMenu();
    }
  },
);

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  window.removeEventListener("keydown", handleWindowKeydown);
});
</script>

<template>
  <section ref="slideRailRef" class="slide-rail">
    <div class="rail-toolbar">
      <div class="rail-copy">
        <h3>页面</h3>
        <p>{{ slideSummary }}</p>
      </div>

      <a-button class="rail-create-button" size="small" type="outline" @click="emit('create')">
        新建页面
      </a-button>
    </div>

    <div
      v-if="slides.length > 0"
      ref="slideListRef"
      class="slide-list"
      @scroll="handleSlideListScroll"
    >
      <article
        v-for="(slide, index) in slides"
        :key="slide.id"
        class="slide-card-shell"
        :class="{
          'is-active': slide.id === activeSlideId,
          'is-context-open': contextMenuState?.slideId === slide.id,
          'is-dragging': slide.id === draggedSlideId,
          'is-drop-before': dropState?.slideId === slide.id && dropState.placement === 'before',
          'is-drop-after': dropState?.slideId === slide.id && dropState.placement === 'after',
        }"
        draggable="true"
        @contextmenu="handleSlideCardContextMenu(slide.id, $event)"
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
            <div class="slide-card-flags">
              <span class="slide-state-pill" :class="{ 'is-active': slide.id === activeSlideId }">
                {{ slide.id === activeSlideId ? "当前页" : "右键管理" }}
              </span>
              <span class="slide-drag-caption">拖拽排序</span>
            </div>
          </div>

          <div class="slide-thumbnail" :style="resolveSlideThumbnailStyle(slide)">
            <template v-if="!hasSlideThumbnail(slide.id)">
              <span class="thumb-line long" />
              <span class="thumb-line short" />
              <span class="thumb-dots">
                <i />
                <i />
                <i />
              </span>
            </template>
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

            <div class="slide-card-hint">
              <span>双击命名</span>
              <span>右键更多</span>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div
      v-if="contextMenuState && contextMenuSlide"
      class="slide-context-menu"
      :style="slideContextMenuStyle"
      @contextmenu.prevent
    >
      <div class="slide-context-menu__group">
        <a-button class="slide-context-menu__item" type="text" @click="handleContextMenuCreateAfter">
          后插入
        </a-button>
        <a-button class="slide-context-menu__item" type="text" @click="handleContextMenuDuplicate">
          复制页面
        </a-button>
        <a-button class="slide-context-menu__item danger" type="text" @click="handleContextMenuDelete">
          删除页面
        </a-button>
      </div>
    </div>

    <a-empty v-else class="rail-empty" description="还没有页面">
      <a-button size="small" type="primary" @click="emit('create')">新建第一页</a-button>
    </a-empty>

    <a-modal
      :visible="Boolean(pendingDeleteSlide)"
      :mask-closable="false"
      cancel-text="取消"
      ok-text="确认删除"
      title="删除页面"
      @cancel="closeDeleteModal"
      @ok="handleDeleteConfirm"
    >
      <div class="slide-delete-modal">
        <p class="slide-delete-modal__headline">
          确认删除页面「{{ pendingDeleteSlide?.name ?? "" }}」吗？
        </p>
        <p class="slide-delete-modal__copy">
          删除后会同时移除该页上的对象和播放步骤，不会影响其他页面内容。
        </p>
      </div>
    </a-modal>
  </section>
</template>

<style scoped>
.slide-rail {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  padding: 8px 6px 10px;
  border: 1px solid color-mix(in srgb, var(--cw-color-border) 90%, #ffffff);
  border-radius: 16px;
  background: linear-gradient(180deg, #fbfcfe 0%, #f5f7fa 100%);
}

.rail-toolbar {
  display: grid;
  gap: 8px;
  margin-bottom: 8px;
}

.rail-copy {
  display: grid;
  gap: 2px;
}

.rail-copy h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--cw-color-text);
}

.rail-copy p {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--cw-color-muted);
}

.rail-create-button {
  width: 100%;
  min-height: 32px;
  border-radius: 10px;
}

.slide-list {
  display: grid;
  gap: var(--cw-slide-list-gap, 8px);
  align-content: start;
  min-height: 0;
  padding-right: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.slide-card-shell {
  position: relative;
  display: grid;
  gap: 6px;
  padding: var(--cw-slide-card-shell-padding, 6px);
  border: 1px solid transparent;
  border-radius: 12px;
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

.slide-card-shell.is-context-open {
  border-color: color-mix(in srgb, var(--cw-color-primary) 30%, var(--cw-color-border));
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(242, 248, 255, 0.98));
  box-shadow: 0 14px 28px rgba(9, 30, 66, 0.12);
}

.slide-card-shell.is-active::after {
  background: var(--cw-color-primary);
}

.slide-card-shell.is-context-open::after {
  background: color-mix(in srgb, var(--cw-color-primary) 86%, #ffffff);
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
  gap: 8px;
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
  gap: 6px;
}

.slide-card-flags {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}

.slide-index {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cw-color-primary);
}

.slide-state-pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: var(--cw-radius-pill);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  color: var(--cw-color-muted);
  background: rgba(226, 232, 240, 0.72);
  transition:
    color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard);
}

.slide-state-pill.is-active,
.slide-card-shell:hover .slide-state-pill,
.slide-card-shell.is-context-open .slide-state-pill {
  color: var(--cw-color-primary);
  background: color-mix(in srgb, var(--cw-color-primary) 12%, #ffffff);
}

.slide-drag-caption {
  font-size: 10px;
  line-height: 1.4;
  color: var(--cw-color-muted);
}

.slide-thumbnail {
  display: grid;
  gap: 6px;
  justify-items: center;
  min-height: var(--cw-slide-thumbnail-min-height, 64px);
  padding: 10px 8px;
  border: 1px solid #dfe6ee;
  border-radius: 10px;
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
  width: 58px;
}

.thumb-line.short {
  width: 40px;
  opacity: 0.64;
}

.thumb-dots {
  display: flex;
  gap: 5px;
}

.thumb-dots i {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--cw-color-primary) 70%, #ffffff);
}

.slide-card-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.slide-name-row {
  min-width: 0;
}

.slide-name {
  display: block;
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
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
  gap: 4px 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--cw-color-muted);
}

.slide-card-hint {
  display: var(--cw-slide-card-hint-display, flex);
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 10px;
  line-height: 1.4;
  color: color-mix(in srgb, var(--cw-color-muted) 78%, #ffffff);
  transition: color var(--cw-duration-fast) var(--cw-ease-standard);
}

.slide-card-shell:hover .slide-card-hint,
.slide-card-shell.is-active .slide-card-hint,
.slide-card-shell.is-context-open .slide-card-hint {
  color: var(--cw-color-primary);
}

.slide-context-menu {
  position: absolute;
  z-index: 16;
  width: 176px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--cw-color-primary) 14%, var(--cw-color-border));
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 18px 40px rgba(15, 23, 42, 0.16),
    0 1px 2px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(14px);
}

.slide-context-menu__group {
  display: grid;
  gap: 2px;
}

.slide-context-menu__item {
  justify-content: flex-start;
  min-height: 34px;
  border-radius: 10px;
}

.slide-context-menu__group :deep(.arco-btn) {
  width: 100%;
  justify-content: flex-start;
}

.slide-context-menu__group :deep(.arco-btn-content) {
  width: 100%;
  justify-content: flex-start;
}

.slide-context-menu__item.danger {
  color: var(--cw-color-danger);
}

.slide-delete-modal {
  display: grid;
  gap: 10px;
}

.slide-delete-modal__headline,
.slide-delete-modal__copy {
  margin: 0;
}

.slide-delete-modal__headline {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.6;
  color: var(--cw-color-text);
}

.slide-delete-modal__copy {
  font-size: 13px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.rail-empty {
  align-self: start;
  padding-top: 20px;
}
</style>
