<script setup lang="ts">
import type {
  NodePatch,
  NodeTimelineSummary,
  ObjectFit,
  ReorderPosition,
  Slide,
  TextNode,
} from "@canvas-courseware/core";
import type {
  FabricEditorContextMenuRequest,
  FabricInlineTextEditingLayout,
} from "@canvas-courseware/fabric";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import FloatingLayerManager from "./FloatingLayerManager.vue";
import LocalImageFileTrigger from "./LocalImageFileTrigger.vue";
import SlideSettingsEntryButton from "./SlideSettingsEntryButton.vue";
import TextTool from "./TextTool.vue";
import type {
  LayerAlignMode,
  LayerDistributeMode,
} from "./useEditorBatchLayout";

/** 编辑区右键菜单的上下文类型。 */
type EditorContextMenuMode = "blank" | "single" | "multiple";

/** 独立浮层图层拖拽排序事件的载荷。 */
interface LayerReorderToIndexPayload {
  /** 被拖拽的节点 id。 */
  nodeId: string;
  /** 放下后的目标索引。 */
  index: number;
}

/** 图片替换事件的载荷。 */
interface ReplaceImagePayload {
  /** 需要替换的节点 id。 */
  nodeId: string;
  /** 用户刚刚选择的图片文件。 */
  file: File;
}

/** “设为背景”事件的载荷。 */
interface SetImageAsBackgroundPayload {
  /** 目标图片节点 id。 */
  nodeId: string;
  /** 在弹窗中展示的来源说明。 */
  sourceLabel: string;
  /** 建议回显的背景填充方式。 */
  preferredFit?: ObjectFit;
}

/** 编辑区右键菜单在组件内维护的定位状态。 */
interface EditorContextMenuState {
  /** 菜单相对工作区的 X 坐标。 */
  x: number;
  /** 菜单相对工作区的 Y 坐标。 */
  y: number;
  /** 触发时命中的 slide id。 */
  slideId: string | null;
  /** 触发时命中的节点 id。 */
  nodeId: string | null;
  /** 触发当前菜单时的标准选中节点集合。 */
  selectionNodeIds: string[];
}

/** 右键菜单预估宽度，用于避免贴边溢出。 */
const CONTEXT_MENU_WIDTH = 188;

/** 右键菜单与边缘之间的安全距离。 */
const CONTEXT_MENU_SAFE_MARGIN = 12;

/** 右键菜单预估高度，用于首版定位。 */
const CONTEXT_MENU_ESTIMATED_HEIGHT = 312;

/** 中央舞台壳层的只读输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前激活的 slide。 */
    activeSlide?: Slide | null;
    /** 把舞台内部创建出来的 canvas 节点回传给父层。 */
    setCanvasElement?: (canvasElement: HTMLCanvasElement | null) => void;
    /** 当前文本内联编辑态的浮层定位信息。 */
    inlineTextEditingLayout?: FabricInlineTextEditingLayout | null;
    /** 当前文本工具条绑定的文本节点。 */
    editingTextToolNode?: TextNode | null;
    /** 当前页面内节点的步骤归属摘要。 */
    nodeTimelineSummaryMap?: Record<string, NodeTimelineSummary>;
    /** 当前选中的节点 id 列表。 */
    selectedNodeIds?: string[];
    /** 当前三栏区域的可用高度。 */
    paneHeight?: number;
    /** 当前激活页的 1-based 页序。 */
    slideIndex?: number | null;
  }>(),
  {
    activeSlide: null,
    inlineTextEditingLayout: null,
    editingTextToolNode: null,
    nodeTimelineSummaryMap: () => ({}),
    selectedNodeIds: () => [],
    paneHeight: 320,
    slideIndex: null,
  },
);

/** 中央舞台壳层向外派发的交互意图。 */
const emit = defineEmits<{
  /** 请求打开当前页设置。 */
  "open-slide-settings": [];
  /** 请求更新一个节点。 */
  "update-node": [nodeId: string, patch: NodePatch];
  /** 请求选中一个节点。 */
  "select-layer": [nodeId: string];
  /** 请求按语义调整图层顺序。 */
  "reorder-layer": [nodeId: string, position: ReorderPosition];
  /** 请求按索引写回新的图层顺序。 */
  "reorder-layer-to-index": [payload: LayerReorderToIndexPayload];
  /** 请求执行批量对齐。 */
  "align-layers": [mode: LayerAlignMode];
  /** 请求执行批量分布。 */
  "distribute-layers": [mode: LayerDistributeMode];
  /** 请求新增文本。 */
  "add-text": [];
  /** 请求新增矩形。 */
  "add-rect": [];
  /** 请求导入一张本地图片。 */
  "import-image": [file: File];
  /** 请求替换一张图片。 */
  "replace-image": [payload: ReplaceImagePayload];
  /** 请求把一张图片设为背景。 */
  "set-image-as-background": [payload: SetImageAsBackgroundPayload];
  /** 请求复制当前选区。 */
  "copy-selection": [];
  /** 请求重复当前选区。 */
  "duplicate-selection": [];
  /** 请求删除当前选区。 */
  "delete-selection": [];
  /** 请求执行一次粘贴。 */
  "paste-selection": [];
  /** 请求清空当前选区。 */
  "clear-selection": [];
  /** 请求结束内联文本编辑态。 */
  "request-inline-text-editing-exit": [];
  /** 请求重新读取文本工具条布局。 */
  "refresh-inline-text-layout": [];
  /** 请求打开右侧属性面板。 */
  "open-inspector": [];
  /** 请求打开右侧时间轴面板。 */
  "open-timeline": [];
}>();

/** 工作区容器引用，用于挂载右键菜单与文本浮层。 */
const workspaceShellRef = ref<HTMLElement | null>(null);

/** 中间编辑区滚动容器的 DOM 引用。 */
const stageViewportRef = ref<HTMLDivElement | null>(null);

/** 当前编辑区右键菜单状态。 */
const contextMenuState = ref<EditorContextMenuState | null>(null);

/** 中间编辑区当前可用尺寸。 */
const stageViewportSize = ref({
  width: 0,
  height: 0,
});

/** 把数值约束到指定区间内，避免菜单超出容器。 */
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

/** 关闭当前右键菜单。 */
const closeContextMenu = () => {
  contextMenuState.value = null;
};

/** 按工作区可用空间规整右键菜单坐标。 */
const normalizeContextMenuPosition = (clientX: number, clientY: number) => {
  const hostRect = workspaceShellRef.value?.getBoundingClientRect();
  if (!hostRect) {
    return null;
  }

  return {
    x: clamp(
      clientX - hostRect.left,
      CONTEXT_MENU_SAFE_MARGIN,
      Math.max(hostRect.width - CONTEXT_MENU_WIDTH - CONTEXT_MENU_SAFE_MARGIN, CONTEXT_MENU_SAFE_MARGIN),
    ),
    y: clamp(
      clientY - hostRect.top,
      CONTEXT_MENU_SAFE_MARGIN,
      Math.max(hostRect.height - CONTEXT_MENU_ESTIMATED_HEIGHT, CONTEXT_MENU_SAFE_MARGIN),
    ),
  };
};

/** 打开编辑区右键菜单。 */
const openContextMenu = (payload: FabricEditorContextMenuRequest) => {
  const normalizedPosition = normalizeContextMenuPosition(payload.clientX, payload.clientY);
  if (!normalizedPosition) {
    return;
  }

  contextMenuState.value = {
    ...normalizedPosition,
    slideId: payload.slideId,
    nodeId: payload.nodeId,
    selectionNodeIds: [...payload.selectionNodeIds],
  };
};

/** 把 `<canvas>` 模板节点稳定写回父层传入的 ref。 */
const assignCanvasRef = (value: Element | ComponentPublicInstance | null) => {
  /**
   * 这里不能直接把 `Ref` 当作 prop 往下传。
   * Vue 模板会自动解包 `ref`，子组件最终拿到的会是当前值而不是 ref 本身，
   * 一旦初始值刚好是 `null`，这里再写 `.value` 就会在首屏挂载时直接崩溃。
   */
  props.setCanvasElement?.(value instanceof HTMLCanvasElement ? value : null);
};

/** 当前舞台容器的高度样式。 */
const stageStyle = computed(() => ({
  minHeight: `${props.paneHeight}px`,
}));

/** 根据中间区域宽高等比缩放画布，保证始终完整显示且不放大。 */
const canvasScale = computed(() => {
  if (
    !props.activeSlide ||
    stageViewportSize.value.width <= 0 ||
    stageViewportSize.value.height <= 0
  ) {
    return 1;
  }

  /** 预留滚动容器与画布包裹层的水平留白，保证边缘不贴死。 */
  const availableWidth = Math.max(stageViewportSize.value.width - 88, 180);
  /** 预留上下留白，保证缩放后画布仍完整可见。 */
  const availableHeight = Math.max(stageViewportSize.value.height - 80, 160);
  const widthScale = availableWidth / props.activeSlide.size.width;
  const heightScale = availableHeight / props.activeSlide.size.height;

  return Math.min(1, widthScale, heightScale);
});

/** 缩放后的画布外框尺寸，保证布局高度与展示尺寸一致。 */
const canvasFrameStyle = computed(() => {
  if (!props.activeSlide) {
    return {};
  }

  return {
    width: `${props.activeSlide.size.width * canvasScale.value}px`,
    height: `${props.activeSlide.size.height * canvasScale.value}px`,
  };
});

/** 实际渲染画布仍保持原始尺寸，只通过 transform 缩放。 */
const canvasSurfaceStyle = computed(() => {
  if (!props.activeSlide) {
    return {};
  }

  return {
    width: `${props.activeSlide.size.width}px`,
    height: `${props.activeSlide.size.height}px`,
    transform: `scale(${canvasScale.value})`,
    transformOrigin: "top left",
  };
});

/** 把视口坐标换算成工作区内的绝对定位，供文本浮层直接挂载。 */
const textToolStyle = computed<Record<string, string>>(() => {
  const hostRect = workspaceShellRef.value?.getBoundingClientRect();
  const layout = props.inlineTextEditingLayout;
  if (!hostRect || !layout) {
    return {};
  }

  return {
    left: `${layout.clientRect.left + layout.clientRect.width / 2 - hostRect.left}px`,
    top: `${layout.clientRect.top - hostRect.top - 14}px`,
  };
});

/** 当前右键菜单的定位样式。 */
const contextMenuStyle = computed(() =>
  contextMenuState.value
    ? {
        left: `${contextMenuState.value.x}px`,
        top: `${contextMenuState.value.y}px`,
      }
    : {},
);

/** 当前右键菜单对应的上下文模式。 */
const contextMenuMode = computed<EditorContextMenuMode>(() => {
  const selectionCount = contextMenuState.value?.selectionNodeIds.length ?? 0;
  if (selectionCount === 0) {
    return "blank";
  }

  return selectionCount === 1 ? "single" : "multiple";
});

/** 当前右键菜单是否为空白区上下文。 */
const contextMenuIsBlank = computed(() => contextMenuMode.value === "blank");

/** 当前右键菜单是否已命中对象级操作上下文。 */
const contextMenuHasObjectSelection = computed(() => contextMenuMode.value !== "blank");

/** 当前右键菜单唯一命中的节点 id。 */
const contextMenuSingleNodeId = computed(() =>
  contextMenuMode.value === "single" ? contextMenuState.value?.selectionNodeIds[0] ?? null : null,
);

/** 当前右键菜单命中的是否为一张已导入资源的图片节点。 */
const contextMenuTargetImageNode = computed(() => {
  if (!contextMenuSingleNodeId.value || !props.activeSlide) {
    return null;
  }

  const node = props.activeSlide.nodes.find(
    (candidate) => candidate.id === contextMenuSingleNodeId.value,
  );
  if (!node || node.type !== "image" || node.props.src.trim().length === 0) {
    return null;
  }

  return node;
});

/** 当前右键菜单是否可以展示“设为背景”快捷入口。 */
const contextMenuCanSetBackground = computed(() => Boolean(contextMenuTargetImageNode.value));

/** 当前右键菜单是否可以展示“更换图片”快捷入口。 */
const contextMenuCanReplaceImage = computed(() => Boolean(contextMenuTargetImageNode.value));

/** 在非画布区域右键时，仍然展示空白态编辑区菜单。 */
const handleStageViewportContextMenu = (event: MouseEvent) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("canvas")) {
    return;
  }

  emit("clear-selection");
  openContextMenu({
    clientX: event.clientX,
    clientY: event.clientY,
    slideId: props.activeSlide?.id ?? null,
    nodeId: null,
    selectionNodeIds: [],
  });
};

/** 点击菜单外区域时关闭右键菜单，并按需结束文本编辑态。 */
const handleGlobalPointerDown = (event: PointerEvent) => {
  const target = event.target;
  const clickedInsideEditorShell = target instanceof HTMLElement && target.closest(".editor-shell");
  const clickedTextTool = target instanceof HTMLElement && target.closest(".text-tool");
  const clickedCanvas = target instanceof HTMLElement && target.closest("canvas");
  const clickedContextMenu = target instanceof HTMLElement && target.closest(".stage-context-menu");
  const clickedBlankStage =
    target instanceof HTMLElement &&
    target.closest(".stage-scroll") &&
    !clickedCanvas &&
    !clickedTextTool &&
    !clickedContextMenu;

  if (clickedBlankStage || !clickedInsideEditorShell) {
    emit("request-inline-text-editing-exit");
  }

  if (!contextMenuState.value) {
    return;
  }

  if (
    target instanceof HTMLElement &&
    (target.closest(".stage-context-menu") || target.closest(".text-tool"))
  ) {
    return;
  }

  closeContextMenu();
};

/** 支持通过 Escape 关闭右键菜单。 */
const handleContextMenuKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    closeContextMenu();
  }
};

/** 读取中间编辑区当前可用尺寸，用于画布等比缩放。 */
const updateStageViewportSize = () => {
  const viewportRect = stageViewportRef.value?.getBoundingClientRect();
  stageViewportSize.value = {
    /**
     * 这里改为读取 border-box 尺寸，而不是 `clientWidth / clientHeight`。
     * 在部分浏览器里，选中 Fabric 对象后如果出现滚动条预留或临时布局抖动，
     * `clientWidth` 会短暂变小，进而把整块画布误判为“可用区域缩小”并重新缩放。
     */
    width: viewportRect ? Math.round(viewportRect.width) : 0,
    height: viewportRect ? Math.round(viewportRect.height) : 0,
  };

  if (props.inlineTextEditingLayout) {
    emit("refresh-inline-text-layout");
  }
};

/** 右键菜单中快速插入文本。 */
const handleContextMenuAddText = () => {
  closeContextMenu();
  emit("add-text");
};

/** 右键菜单中快速插入矩形。 */
const handleContextMenuAddRect = () => {
  closeContextMenu();
  emit("add-rect");
};

/** 右键菜单中直接从本地插入图片。 */
const handleContextMenuImageImport = async (file: File) => {
  closeContextMenu();
  emit("import-image", file);
};

/** 右键菜单中直接替换当前图片节点资源。 */
const handleContextMenuImageReplace = async (file: File) => {
  const imageNodeId = contextMenuTargetImageNode.value?.id;
  closeContextMenu();
  if (!imageNodeId) {
    return;
  }

  emit("replace-image", {
    nodeId: imageNodeId,
    file,
  });
};

/** 右键菜单中把当前图片节点直接转换成页面背景。 */
const handleContextMenuSetImageAsBackground = () => {
  const imageNode = contextMenuTargetImageNode.value;
  if (!imageNode) {
    return;
  }

  closeContextMenu();
  emit("set-image-as-background", {
    nodeId: imageNode.id,
    sourceLabel: `画布图片 · ${imageNode.name}`,
    preferredFit: imageNode.props.objectFit ?? props.activeSlide?.background.image?.fit,
  });
};

/** 右键菜单中复制当前选区。 */
const handleContextMenuCopy = () => {
  closeContextMenu();
  emit("copy-selection");
};

/** 右键菜单中快速重复当前选区。 */
const handleContextMenuDuplicate = () => {
  closeContextMenu();
  emit("duplicate-selection");
};

/** 右键菜单中删除当前选区。 */
const handleContextMenuDelete = () => {
  closeContextMenu();
  emit("delete-selection");
};

/** 右键菜单中执行一次粘贴。 */
const handleContextMenuPaste = () => {
  closeContextMenu();
  emit("paste-selection");
};

/** 转发浮层图层面板中的节点更新事件。 */
const handleFloatingLayerNodeUpdate = (nodeId: string, patch: NodePatch) => {
  emit("update-node", nodeId, patch);
};

/** 转发浮层图层面板中的层级调整事件。 */
const handleFloatingLayerReorder = (nodeId: string, position: ReorderPosition) => {
  emit("reorder-layer", nodeId, position);
};

/** 转发文本工具条中的节点更新事件。 */
const handleTextToolNodeUpdate = (nodeId: string, patch: NodePatch) => {
  emit("update-node", nodeId, patch);
};

/** 监听舞台尺寸变化，让布局与画布缩放及时同步。 */
let stageViewportResizeObserver: ResizeObserver | null = null;

watch(
  () => props.activeSlide?.id ?? null,
  () => {
    closeContextMenu();
  },
);

onMounted(() => {
  updateStageViewportSize();
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("keydown", handleContextMenuKeydown);

  if (!stageViewportRef.value) {
    return;
  }

  stageViewportResizeObserver = new ResizeObserver(() => {
    updateStageViewportSize();
  });
  stageViewportResizeObserver.observe(stageViewportRef.value);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("keydown", handleContextMenuKeydown);
  stageViewportResizeObserver?.disconnect();
  stageViewportResizeObserver = null;
});

/** 暴露给父层的舞台交互方法。 */
defineExpose({
  openContextMenu,
});
</script>

<template>
  <section ref="workspaceShellRef" class="workspace-shell panel-shell">
    <div class="stage-floating-tools">
      <SlideSettingsEntryButton
        :slide-index="slideIndex"
        @open="emit('open-slide-settings')"
      />

      <FloatingLayerManager
        :nodes="activeSlide?.nodes ?? []"
        :node-timeline-summary-map="nodeTimelineSummaryMap"
        :selected-node-ids="selectedNodeIds"
        @select="emit('select-layer', $event)"
        @update-node="handleFloatingLayerNodeUpdate"
        @reorder="handleFloatingLayerReorder"
        @reorder-to-index="emit('reorder-layer-to-index', $event)"
        @align="emit('align-layers', $event)"
        @distribute="emit('distribute-layers', $event)"
        @open-inspector="emit('open-inspector')"
        @open-timeline="emit('open-timeline')"
      />
    </div>

    <TextTool
      :node="editingTextToolNode"
      :overlay-style="textToolStyle"
      @update-node="handleTextToolNodeUpdate"
    />

    <div
      ref="stageViewportRef"
      class="stage-scroll"
      :style="stageStyle"
      @contextmenu.prevent="handleStageViewportContextMenu"
    >
      <div class="stage-backdrop">
        <div v-if="activeSlide" class="stage-scale-frame" :style="canvasFrameStyle">
          <div class="stage-surface" :style="canvasSurfaceStyle">
            <canvas :ref="assignCanvasRef" />
          </div>
        </div>
        <div v-else class="empty-stage">
          <strong>还没有可编辑的页面</strong>
          <p>先新增一个 slide，再开始插入文本、矩形或图片。</p>
        </div>
      </div>
    </div>

    <div
      v-if="contextMenuState"
      class="stage-context-menu"
      :style="contextMenuStyle"
      @contextmenu.prevent
    >
      <template v-if="contextMenuIsBlank">
        <div class="stage-context-menu__group">
          <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuAddText">
            插入文本
          </a-button>
          <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuAddRect">
            插入矩形
          </a-button>
          <LocalImageFileTrigger
            aria-label="从右键菜单插入图片"
            label="插入图片"
            variant="menu"
            @select="handleContextMenuImageImport"
          />
        </div>
        <div class="stage-context-menu__divider" />
      </template>

      <template v-else>
        <template v-if="contextMenuCanReplaceImage">
          <div class="stage-context-menu__group">
            <LocalImageFileTrigger
              aria-label="从右键菜单更换图片"
              label="更换图片"
              variant="menu"
              @select="handleContextMenuImageReplace"
            />
            <a-button
              v-if="contextMenuCanSetBackground"
              class="stage-context-menu__item"
              type="text"
              @click="handleContextMenuSetImageAsBackground"
            >
              设为背景
            </a-button>
          </div>
          <div class="stage-context-menu__divider" />
        </template>

        <div v-if="contextMenuHasObjectSelection" class="stage-context-menu__group">
          <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuCopy">
            复制所选
          </a-button>
          <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuDuplicate">
            重复所选
          </a-button>
          <a-button class="stage-context-menu__item danger" type="text" @click="handleContextMenuDelete">
            删除所选
          </a-button>
        </div>
        <div class="stage-context-menu__divider" />
      </template>

      <div class="stage-context-menu__group">
        <a-button class="stage-context-menu__item" type="text" @click="handleContextMenuPaste">
          粘贴
        </a-button>
      </div>
    </div>
  </section>
</template>

<style scoped src="./CoursewareEditor.css"></style>
