<script setup lang="ts">
import type {
  CoursewareNode,
  NodePatch,
  NodeTimelineSummary,
  ReorderPosition,
} from "@canvas-courseware/core";
import { computed, nextTick, ref, watch } from "vue";
import {
  formatNodeGeometry,
  formatNodeTimelineSummaryLabel,
  formatNodeTypeLabel,
} from "../shared";
import type {
  LayerAlignMode,
  LayerDistributeMode,
} from "./useEditorBatchLayout";

/** 图层拖拽放置时的停靠方向。 */
type LayerDropPlacement = "before" | "after";

/** 浮层内图层拖拽命中的目标信息。 */
interface LayerDropState {
  /** 当前命中的节点 id。 */
  nodeId: string;
  /** 相对于命中节点的放置方向。 */
  placement: LayerDropPlacement;
}

/** 拖拽排序完成后抛给父层的载荷。 */
interface LayerReorderToIndexPayload {
  /** 被拖拽的节点 id。 */
  nodeId: string;
  /** 放下后的目标索引。 */
  index: number;
}

/** 浮层组件输入参数。 */
const props = withDefaults(
  defineProps<{
    /** 当前 slide 内的节点列表，顺序需与文档保持一致。 */
    nodes?: CoursewareNode[];
    /** 当前 slide 内各节点的步骤归属摘要。 */
    nodeTimelineSummaryMap?: Record<string, NodeTimelineSummary>;
    /** 当前 UI 层选中的节点 id 列表。 */
    selectedNodeIds?: string[];
  }>(),
  {
    nodes: () => [],
    nodeTimelineSummaryMap: () => ({}),
    selectedNodeIds: () => [],
  },
);

/** 浮层组件对外派发的交互意图。 */
const emit = defineEmits<{
  /** 选择某个节点。 */
  select: [nodeId: string];
  /** 更新某个节点的标准属性。 */
  "update-node": [nodeId: string, patch: NodePatch];
  /** 按位置语义调整层级。 */
  reorder: [nodeId: string, position: ReorderPosition];
  /** 直接按目标索引调整层级。 */
  "reorder-to-index": [payload: LayerReorderToIndexPayload];
  /** 对当前多选节点执行对齐。 */
  align: [mode: LayerAlignMode];
  /** 对当前多选节点执行分布。 */
  distribute: [mode: LayerDistributeMode];
  /** 请求右侧面板切到组件属性。 */
  "open-inspector": [];
  /** 请求右侧面板切到时间轴。 */
  "open-timeline": [];
}>();

/** 当前浮层是否处于展开态。 */
const isExpanded = ref(true);

/** 当前正在编辑名称的节点 id。 */
const editingNodeId = ref<string | null>(null);

/** 图层重命名输入框中的实时值。 */
const editingNodeName = ref("");

/** 当前被拖拽的节点 id。 */
const draggedNodeId = ref<string | null>(null);

/** 当前拖拽命中的落点信息。 */
const dropState = ref<LayerDropState | null>(null);

/** 图层卡片 DOM 引用，用于快速定位当前选中对象。 */
const layerItemElementMap = ref(new Map<string, HTMLElement>());

/** 当前首个选中的节点 id。 */
const primarySelectedNodeId = computed(() => props.selectedNodeIds[0] ?? null);

/** 当前首个选中的节点对象。 */
const primarySelectedNode = computed(() =>
  props.nodes.find((node) => node.id === primarySelectedNodeId.value),
);

/** 当前是否存在可定位的单个主选中对象。 */
const hasPrimarySelection = computed(() => Boolean(primarySelectedNode.value));

/** 当前是否正处于单选状态。 */
const hasSingleSelection = computed(
  () => props.selectedNodeIds.length === 1 && Boolean(primarySelectedNode.value),
);

/** 当前是否正处于多选状态。 */
const hasMultiSelection = computed(() => props.selectedNodeIds.length > 1);

/** 当前是否满足分布操作条件。 */
const canDistributeSelection = computed(() => props.selectedNodeIds.length > 2);

/** 当前选中节点 id 的只读集合，供模板快速判断高亮态。 */
const selectedNodeIdSet = computed(() => new Set(props.selectedNodeIds));

/** 当前图层顺序摘要，用于节点顺序变化后触发滚动定位。 */
const nodeOrderKey = computed(() => props.nodes.map((node) => node.id).join("|"));

/** 单选时是否还可以继续上移。 */
const canMoveForward = computed(() => {
  if (!primarySelectedNodeId.value) {
    return false;
  }

  const currentIndex = props.nodes.findIndex((node) => node.id === primarySelectedNodeId.value);
  return currentIndex > -1 && currentIndex < props.nodes.length - 1;
});

/** 单选时是否还可以继续下移。 */
const canMoveBackward = computed(() => {
  if (!primarySelectedNodeId.value) {
    return false;
  }

  const currentIndex = props.nodes.findIndex((node) => node.id === primarySelectedNodeId.value);
  return currentIndex > 0;
});

/** 当前选中摘要文案。 */
const selectionSummary = computed(() => {
  if (!primarySelectedNode.value) {
    return "选择一个对象后，可直接切到属性或时间轴，并在浮层内完成重排。";
  }

  if (hasMultiSelection.value) {
    return `已选中 ${props.selectedNodeIds.length} 个对象，可直接做对齐与分布。`;
  }

  return `当前对象为「${primarySelectedNode.value.name}」，可直接改名、锁定、隐藏或调整层级。`;
});

/** 单张图层卡片的紧凑元信息。 */
const resolveNodeMetaLine = (node: CoursewareNode): string => formatNodeGeometry(node);

/** 读取某个节点的步骤归属摘要。 */
const resolveNodeTimelineSummary = (nodeId: string): NodeTimelineSummary | null =>
  props.nodeTimelineSummaryMap[nodeId] ?? null;

/** 判断某个节点当前是否处于选中态。 */
const isNodeSelected = (nodeId: string): boolean => selectedNodeIdSet.value.has(nodeId);

/** 当前选中对象的显隐动作文案。 */
const visibilityActionLabel = computed(() =>
  primarySelectedNode.value?.visible ? "预览隐藏" : "预览显示",
);

/** 当前选中对象的锁定动作文案。 */
const lockActionLabel = computed(() =>
  primarySelectedNode.value?.locked ? "解锁" : "锁定",
);

/** 生成图层卡片上需要展示的状态标签。 */
const resolveNodeStateTags = (node: CoursewareNode): string[] => {
  const tags: string[] = [];

  if (isNodeSelected(node.id)) {
    tags.push(hasMultiSelection.value ? "已纳入多选" : "当前选中");
  }

  if (!node.visible) {
    tags.push("预览隐藏");
  }

  if (node.locked) {
    tags.push("已锁定");
  }

  return tags;
};

/** 切换浮层展开状态。 */
const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

/** 选择某个节点。 */
const handleSelect = (nodeId: string) => {
  emit("select", nodeId);
};

/** 使用键盘选中某个图层项，补齐无鼠标场景。 */
const handleLayerKeydown = (event: KeyboardEvent, nodeId: string) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  handleSelect(nodeId);
};

/** 请求右侧面板切到组件属性。 */
const openInspector = () => {
  emit("open-inspector");
};

/** 请求右侧面板切到时间轴。 */
const openTimeline = () => {
  emit("open-timeline");
};

/** 按语义位置派发层级调整动作。 */
const handleReorder = (position: ReorderPosition) => {
  if (!primarySelectedNode.value) {
    return;
  }

  emit("reorder", primarySelectedNode.value.id, position);
};

/** 派发批量对齐动作。 */
const handleAlign = (mode: LayerAlignMode) => {
  if (!hasMultiSelection.value) {
    return;
  }

  emit("align", mode);
};

/** 派发批量分布动作。 */
const handleDistribute = (mode: LayerDistributeMode) => {
  if (!canDistributeSelection.value) {
    return;
  }

  emit("distribute", mode);
};

/** 进入图层重命名编辑态。 */
const startRename = (node: CoursewareNode) => {
  editingNodeId.value = node.id;
  editingNodeName.value = node.name;
};

/** 退出图层重命名编辑态。 */
const cancelRename = () => {
  editingNodeId.value = null;
  editingNodeName.value = "";
};

/** 同步重命名输入框中的值。 */
const handleRenameInput = (value: string | number | undefined) => {
  editingNodeName.value = typeof value === "string" ? value : String(value ?? "");
};

/** 提交图层名称更新，空字符串时保留原名称。 */
const commitRename = (node: CoursewareNode) => {
  const nextName = editingNodeName.value.trim();
  const resolvedName = nextName || node.name;

  if (resolvedName !== node.name) {
    emit("update-node", node.id, {
      name: resolvedName,
    });
  }

  cancelRename();
};

/** 处理重命名输入框的回车确认与 Escape 取消。 */
const handleRenameKeydown = (event: KeyboardEvent, node: CoursewareNode) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitRename(node);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    cancelRename();
  }
};

/** 切换当前主选中对象的锁定状态。 */
const handlePrimaryLockToggle = () => {
  if (!primarySelectedNode.value || !hasSingleSelection.value) {
    return;
  }

  emit("update-node", primarySelectedNode.value.id, {
    locked: !primarySelectedNode.value.locked,
  });
};

/** 切换当前主选中对象在预览态中的默认显隐状态。 */
const handlePrimaryVisibilityToggle = () => {
  if (!primarySelectedNode.value || !hasSingleSelection.value) {
    return;
  }

  emit("update-node", primarySelectedNode.value.id, {
    visible: !primarySelectedNode.value.visible,
  });
};

/** 从模板 ref 的不同入参形态里解析出真正的 HTML 元素。 */
const resolveLayerItemElement = (value: unknown): HTMLElement | null => {
  if (value instanceof HTMLElement) {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "$el" in value &&
    value.$el instanceof HTMLElement
  ) {
    return value.$el;
  }

  return null;
};

/** 记录或清理图层卡片的 DOM 引用。 */
const registerLayerItemElement = (nodeId: string, element: unknown) => {
  const resolvedElement = resolveLayerItemElement(element);
  if (resolvedElement) {
    layerItemElementMap.value.set(nodeId, resolvedElement);
    return;
  }

  layerItemElementMap.value.delete(nodeId);
};

/** 把当前首个选中节点滚动定位到图层列表可视区域内。 */
const scrollPrimarySelectionIntoView = (behavior: ScrollBehavior) => {
  if (!primarySelectedNodeId.value) {
    return;
  }

  const element = layerItemElementMap.value.get(primarySelectedNodeId.value);
  if (!element) {
    return;
  }

  element.scrollIntoView({
    block: "nearest",
    behavior,
  });
};

/** 手动触发一次定位，供顶部快捷按钮复用。 */
const handleLocatePrimarySelection = () => {
  scrollPrimarySelectionIntoView("smooth");
};

/** 开始拖拽某个节点。 */
const handleDragStart = (nodeId: string, event: DragEvent) => {
  draggedNodeId.value = nodeId;
  dropState.value = null;

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", nodeId);
  }
};

/** 在拖拽经过某个节点时，计算当前是前插还是后插。 */
const handleDragOver = (nodeId: string, event: DragEvent) => {
  if (!draggedNodeId.value) {
    return;
  }

  event.preventDefault();

  if (draggedNodeId.value === nodeId) {
    dropState.value = null;
    return;
  }

  const currentTarget = event.currentTarget;
  if (!(currentTarget instanceof HTMLElement)) {
    return;
  }

  const bounds = currentTarget.getBoundingClientRect();
  const placement: LayerDropPlacement =
    event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";

  dropState.value = {
    nodeId,
    placement,
  };

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
};

/** 拖拽结束后清理高亮状态。 */
const resetDragState = () => {
  draggedNodeId.value = null;
  dropState.value = null;
};

/** 在图层卡片上完成拖放并派发新的排序索引。 */
const handleDrop = (nodeId: string, event: DragEvent) => {
  event.preventDefault();

  if (!draggedNodeId.value || !dropState.value || draggedNodeId.value === nodeId) {
    resetDragState();
    return;
  }

  const nextIndex = resolveDropIndex(
    draggedNodeId.value,
    nodeId,
    dropState.value.placement,
    props.nodes,
  );

  if (nextIndex !== null) {
    emit("reorder-to-index", {
      nodeId: draggedNodeId.value,
      index: nextIndex,
    });
  }

  resetDragState();
};

/** 计算拖拽放下后对应的最终索引。 */
const resolveDropIndex = (
  draggedId: string,
  targetId: string,
  placement: LayerDropPlacement,
  nodes: CoursewareNode[],
) => {
  const sourceIndex = nodes.findIndex((node) => node.id === draggedId);
  const targetIndex = nodes.findIndex((node) => node.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return null;
  }

  const rawIndex = placement === "before" ? targetIndex : targetIndex + 1;
  const nextIndex = sourceIndex < rawIndex ? rawIndex - 1 : rawIndex;

  return nextIndex === sourceIndex ? null : nextIndex;
};

/** 图层数据变化时，若当前编辑对象被删除则自动退出编辑态。 */
watch(
  () => props.nodes,
  (nodes) => {
    if (!editingNodeId.value) {
      return;
    }

    if (!nodes.some((node) => node.id === editingNodeId.value)) {
      cancelRename();
    }
  },
  { deep: false },
);

/** 当选中节点或图层顺序发生变化时，自动把当前选中项滚动到列表中。 */
watch(
  [primarySelectedNodeId, nodeOrderKey],
  async ([nodeId], previousValues) => {
    if (!nodeId || !isExpanded.value) {
      return;
    }

    await nextTick();

    const [previousNodeId] = previousValues ?? [];
    scrollPrimarySelectionIntoView(previousNodeId ? "smooth" : "auto");
  },
  { immediate: true },
);
</script>

<template>
  <section class="floating-layer-manager" :class="{ 'is-collapsed': !isExpanded }">
    <div class="floating-layer-manager__header">
      <div class="floating-layer-manager__heading">
        <span class="floating-layer-manager__eyebrow">组件管理</span>
        <strong>{{ nodes.length }} 个对象</strong>
        <p v-if="isExpanded">{{ selectionSummary }}</p>
      </div>

      <a-button
        class="floating-layer-manager__toggle"
        size="small"
        type="text"
        @click="toggleExpanded"
      >
        {{ isExpanded ? "收起" : "展开" }}
      </a-button>
    </div>

    <template v-if="isExpanded">
      <div class="floating-layer-manager__actions">
        <a-button
          size="mini"
          type="outline"
          :disabled="!hasPrimarySelection"
          @click="handleLocatePrimarySelection"
        >
          {{ hasMultiSelection ? "定位首个" : "定位选中" }}
        </a-button>
        <a-button
          size="mini"
          type="outline"
          :disabled="!hasPrimarySelection"
          @click="openInspector"
        >
          组件属性
        </a-button>
        <a-button
          size="mini"
          type="outline"
          :disabled="!hasPrimarySelection"
          @click="openTimeline"
        >
          时间轴
        </a-button>
        <a-button
          size="mini"
          type="outline"
          :disabled="!hasSingleSelection"
          @click="primarySelectedNode && startRename(primarySelectedNode)"
        >
          命名
        </a-button>
        <a-button
          size="mini"
          type="outline"
          :disabled="!hasSingleSelection"
          @click="handlePrimaryVisibilityToggle"
        >
          {{ visibilityActionLabel }}
        </a-button>
        <a-button
          size="mini"
          type="outline"
          :disabled="!hasSingleSelection"
          @click="handlePrimaryLockToggle"
        >
          {{ lockActionLabel }}
        </a-button>
      </div>

      <div v-if="hasSingleSelection" class="floating-layer-manager__actions secondary">
        <a-button size="mini" type="outline" :disabled="!canMoveForward" @click="handleReorder('front')">
          置顶
        </a-button>
        <a-button size="mini" type="outline" :disabled="!canMoveForward" @click="handleReorder('forward')">
          上移
        </a-button>
        <a-button size="mini" type="outline" :disabled="!canMoveBackward" @click="handleReorder('backward')">
          下移
        </a-button>
        <a-button size="mini" type="outline" :disabled="!canMoveBackward" @click="handleReorder('back')">
          置底
        </a-button>
      </div>

      <div v-if="hasMultiSelection" class="floating-layer-manager__actions secondary">
        <a-button size="mini" type="outline" @click="handleAlign('left')">左对齐</a-button>
        <a-button size="mini" type="outline" @click="handleAlign('h-center')">水平居中</a-button>
        <a-button size="mini" type="outline" @click="handleAlign('right')">右对齐</a-button>
        <a-button size="mini" type="outline" @click="handleAlign('top')">顶对齐</a-button>
        <a-button size="mini" type="outline" @click="handleAlign('v-center')">垂直居中</a-button>
        <a-button size="mini" type="outline" @click="handleAlign('bottom')">底对齐</a-button>
        <a-button size="mini" type="outline" :disabled="!canDistributeSelection" @click="handleDistribute('horizontal')">
          水平分布
        </a-button>
        <a-button size="mini" type="outline" :disabled="!canDistributeSelection" @click="handleDistribute('vertical')">
          垂直分布
        </a-button>
      </div>

      <div v-if="nodes.length > 0" class="floating-layer-manager__list">
        <article
          v-for="node in nodes"
          :key="node.id"
          :ref="(element) => registerLayerItemElement(node.id, element)"
          class="floating-layer-item"
          :class="{
            'is-active': isNodeSelected(node.id),
            'is-dragging': draggedNodeId === node.id,
            'is-drop-before': dropState?.nodeId === node.id && dropState.placement === 'before',
            'is-drop-after': dropState?.nodeId === node.id && dropState.placement === 'after',
          }"
          draggable="true"
          @dragend="resetDragState"
          @dragover="handleDragOver(node.id, $event)"
          @dragstart="handleDragStart(node.id, $event)"
          @drop="handleDrop(node.id, $event)"
        >
          <div
            class="floating-layer-item__main"
            :aria-pressed="isNodeSelected(node.id)"
            role="button"
            tabindex="0"
            @click="handleSelect(node.id)"
            @keydown="handleLayerKeydown($event, node.id)"
          >
            <div class="floating-layer-item__head">
              <span class="floating-layer-item__drag">⋮⋮</span>
              <a-input
                v-if="editingNodeId === node.id"
                class="floating-layer-item__name-input"
                :model-value="editingNodeName"
                size="small"
                @blur="commitRename(node)"
                @click.stop
                @input="handleRenameInput"
                @keydown.stop="handleRenameKeydown($event, node)"
                @mousedown.stop
              />
              <strong
                v-else
                class="floating-layer-item__name"
                :title="node.name"
                @dblclick.stop="startRename(node)"
              >
                {{ node.name }}
              </strong>
              <span class="floating-layer-item__type">{{ formatNodeTypeLabel(node.type) }}</span>
            </div>

            <div v-if="resolveNodeStateTags(node).length > 0" class="floating-layer-item__tags">
              <span
                v-for="tag in resolveNodeStateTags(node)"
                :key="`${node.id}-${tag}`"
                class="floating-layer-item__tag"
              >
                {{ tag }}
              </span>
            </div>

            <small class="floating-layer-item__meta">{{ resolveNodeMetaLine(node) }}</small>
            <div class="floating-layer-item__summary">
              <span>播放</span>
              <span>{{ formatNodeTimelineSummaryLabel(resolveNodeTimelineSummary(node.id)) }}</span>
            </div>
          </div>
        </article>
      </div>

      <p v-else class="floating-layer-manager__empty">
        当前页面还没有组件，先从上方工具栏插入文本、矩形或图片。
      </p>
    </template>
  </section>
</template>

<style scoped src="./FloatingLayerManager.css"></style>
