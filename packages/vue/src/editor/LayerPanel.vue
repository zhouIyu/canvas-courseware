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

/** 图层面板的只读输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前 slide 的节点列表，顺序需与文档保持一致。 */
    nodes?: CoursewareNode[];
    /** 当前 slide 内各节点的步骤归属摘要。 */
    nodeTimelineSummaryMap?: Record<string, NodeTimelineSummary>;
    /** 当前 UI 选中的节点 id 列表。 */
    selectedNodeIds?: string[];
  }>(),
  {
    nodes: () => [],
    nodeTimelineSummaryMap: () => ({}),
    selectedNodeIds: () => [],
  },
);

/** 图层面板向外派发的用户意图。 */
const emit = defineEmits<{
  /** 选择某个节点。 */
  select: [nodeId: string];
  /** 更新某个图层节点的标准属性。 */
  "update-node": [nodeId: string, patch: NodePatch];
  /** 调整当前选中节点的层级。 */
  reorder: [nodeId: string, position: ReorderPosition];
  /** 对当前多选节点执行对齐。 */
  align: [mode: LayerAlignMode];
  /** 对当前多选节点执行分布。 */
  distribute: [mode: LayerDistributeMode];
}>();

/** 当前首个选中的节点 id。 */
const primarySelectedNodeId = computed(() => props.selectedNodeIds[0] ?? null);

/** 当前首个选中的节点对象。 */
const primarySelectedNode = computed(() =>
  props.nodes.find((node) => node.id === primarySelectedNodeId.value),
);

/** 当前选中节点 id 的只读集合，供模板快速判断高亮态。 */
const selectedNodeIdSet = computed(() => new Set(props.selectedNodeIds));

/** 当前图层顺序摘要，用于在顺序变化后重新定位选中项。 */
const nodeOrderKey = computed(() => props.nodes.map((node) => node.id).join("|"));

/** 选中节点是否还可以继续上移。 */
const canMoveForward = computed(() => {
  if (!primarySelectedNodeId.value) {
    return false;
  }

  const currentIndex = props.nodes.findIndex((node) => node.id === primarySelectedNodeId.value);
  return currentIndex > -1 && currentIndex < props.nodes.length - 1;
});

/** 选中节点是否还可以继续下移。 */
const canMoveBackward = computed(() => {
  if (!primarySelectedNodeId.value) {
    return false;
  }

  const currentIndex = props.nodes.findIndex((node) => node.id === primarySelectedNodeId.value);
  return currentIndex > 0;
});

/** 当前选中节点是否可以直接置顶。 */
const canMoveFront = computed(() => canMoveForward.value);

/** 当前选中节点是否可以直接置底。 */
const canMoveBack = computed(() => canMoveBackward.value);

/** 当前是否是多选态。 */
const hasMultiSelection = computed(() => props.selectedNodeIds.length > 1);

/** 当前是否满足分布操作条件。 */
const canDistributeSelection = computed(() => props.selectedNodeIds.length > 2);

/** 当前是否存在可定位的选中节点。 */
const hasPrimarySelection = computed(() => Boolean(primarySelectedNode.value));

/** 图层列表顶部的当前选中摘要。 */
const selectionSummary = computed(() => {
  if (!primarySelectedNode.value) {
    return "点击任意图层卡片，可在画布、属性面板和图层列表之间同步选中态。";
  }

  if (props.selectedNodeIds.length > 1) {
    return `已选中 ${props.selectedNodeIds.length} 个对象，列表会高亮全部选中项，并定位到首个对象。`;
  }

  return `当前对象为「${primarySelectedNode.value.name}」，可直接在列表里改名、切换预览显隐和锁定状态。`;
});

/** 当前正在编辑名称的节点 id。 */
const editingNodeId = ref<string | null>(null);

/** 图层重命名输入框中的实时值。 */
const editingNodeName = ref("");

/** 图层卡片 DOM 引用表，用于滚动定位当前选中项。 */
const layerItemElementMap = ref(new Map<string, HTMLElement>());

/** 选中某个图层项。 */
const handleSelect = (nodeId: string) => {
  emit("select", nodeId);
};

/** 通过键盘激活某个图层项，补齐无鼠标场景。 */
const handleLayerKeydown = (event: KeyboardEvent, nodeId: string) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  handleSelect(nodeId);
};

/** 根据面板按钮派发层级操作。 */
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

/** 读取某个节点的步骤归属摘要。 */
const resolveNodeTimelineSummary = (nodeId: string): NodeTimelineSummary | null =>
  props.nodeTimelineSummaryMap[nodeId] ?? null;

/** 组合单张图层卡片的精简元信息。 */
const resolveNodeMetaLine = (node: CoursewareNode): string => formatNodeGeometry(node);

/** 判断某个节点当前是否处于选中态。 */
const isNodeSelected = (nodeId: string): boolean => selectedNodeIdSet.value.has(nodeId);

/** 生成图层卡片上需要展示的状态标签。 */
const resolveNodeStateTags = (node: CoursewareNode): string[] => {
  const tags: string[] = [];

  if (isNodeSelected(node.id)) {
    tags.push(props.selectedNodeIds.length > 1 ? "已纳入多选" : "当前选中");
  }

  if (!node.visible) {
    tags.push("预览隐藏");
  }

  if (node.locked) {
    tags.push("已锁定");
  }

  return tags;
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

/** 同步图层名称输入框中的值。 */
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

/** 切换某个节点的锁定状态。 */
const handleLockToggle = (node: CoursewareNode) => {
  emit("update-node", node.id, {
    locked: !node.locked,
  });
};

/** 切换某个节点在预览态中的默认显隐状态。 */
const handleVisibilityToggle = (node: CoursewareNode) => {
  emit("update-node", node.id, {
    visible: !node.visible,
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
    if (!nodeId) {
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
  <section class="layer-panel">
    <p class="panel-copy">
      当前顺序与文档 `nodes[]` 一致，可直接在列表里完成命名、预览显隐和锁定操作。
    </p>

    <div v-if="nodes.length > 0" class="layer-selection-summary">
      <div class="layer-selection-copy">
        <span class="layer-selection-label">快速定位</span>
        <strong>{{ primarySelectedNode?.name ?? "未选中对象" }}</strong>
        <p>{{ selectionSummary }}</p>
      </div>
      <a-button
        class="layer-selection-action"
        size="small"
        type="outline"
        :disabled="!hasPrimarySelection"
        @click="handleLocatePrimarySelection"
      >
        {{ selectedNodeIds.length > 1 ? "定位首个选中" : "定位当前选中" }}
      </a-button>
    </div>

    <div v-if="nodes.length > 0" class="layer-list">
      <article
        v-for="node in nodes"
        :key="node.id"
        :ref="(element) => registerLayerItemElement(node.id, element)"
        class="layer-item"
        :class="{ 'is-active': isNodeSelected(node.id) }"
        :aria-selected="isNodeSelected(node.id)"
      >
        <div
          class="layer-item-main"
          :aria-pressed="isNodeSelected(node.id)"
          role="button"
          tabindex="0"
          @click="handleSelect(node.id)"
          @keydown="handleLayerKeydown($event, node.id)"
        >
          <div class="layer-item-head">
            <a-input
              v-if="editingNodeId === node.id"
              class="layer-name-input"
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
              class="layer-name"
              :title="node.name"
              @dblclick.stop="startRename(node)"
            >
              {{ node.name }}
            </strong>
            <span class="layer-type">{{ formatNodeTypeLabel(node.type) }}</span>
          </div>

          <div v-if="resolveNodeStateTags(node).length > 0" class="layer-state-tags">
            <span
              v-for="tag in resolveNodeStateTags(node)"
              :key="`${node.id}-${tag}`"
              class="layer-state-tag"
            >
              {{ tag }}
            </span>
          </div>

          <small class="layer-meta-line">{{ resolveNodeMetaLine(node) }}</small>
          <div class="layer-summary-line">
            <span class="layer-summary-label">播放</span>
            <span class="layer-summary-value">
              {{ formatNodeTimelineSummaryLabel(resolveNodeTimelineSummary(node.id)) }}
            </span>
          </div>
        </div>

        <div class="layer-item-actions">
          <a-button size="mini" type="text" @click.stop="startRename(node)">
            命名
          </a-button>
          <a-button size="mini" type="text" @click.stop="handleVisibilityToggle(node)">
            {{ node.visible ? "预览隐藏" : "预览显示" }}
          </a-button>
          <a-button size="mini" type="text" @click.stop="handleLockToggle(node)">
            {{ node.locked ? "解锁" : "锁定" }}
          </a-button>
        </div>
      </article>
    </div>
    <p v-else class="panel-empty">当前页面还没有内容，先从上方工具栏插入一个对象。</p>

    <div class="layer-actions">
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!canMoveFront"
        @click="handleReorder('front')"
      >
        置顶
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!canMoveForward"
        @click="handleReorder('forward')"
      >
        上移
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!canMoveBackward"
        @click="handleReorder('backward')"
      >
        下移
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!canMoveBack"
        @click="handleReorder('back')"
      >
        置底
      </a-button>
    </div>

    <div class="layer-actions layer-actions-advanced">
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!hasMultiSelection"
        @click="handleAlign('left')"
      >
        左对齐
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!hasMultiSelection"
        @click="handleAlign('h-center')"
      >
        水平居中
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!hasMultiSelection"
        @click="handleAlign('right')"
      >
        右对齐
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!hasMultiSelection"
        @click="handleAlign('top')"
      >
        顶对齐
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!hasMultiSelection"
        @click="handleAlign('v-center')"
      >
        垂直居中
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!hasMultiSelection"
        @click="handleAlign('bottom')"
      >
        底对齐
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!canDistributeSelection"
        @click="handleDistribute('horizontal')"
      >
        水平分布
      </a-button>
      <a-button
        class="layer-action-button"
        type="outline"
        :disabled="!canDistributeSelection"
        @click="handleDistribute('vertical')"
      >
        垂直分布
      </a-button>
    </div>
  </section>
</template>

<style scoped>
.layer-panel {
  display: grid;
  gap: var(--cw-space-4);
  padding: var(--cw-space-5);
  border: 1px solid var(--cw-color-border);
  border-radius: var(--cw-radius-lg);
  background:
    linear-gradient(180deg, rgba(22, 93, 255, 0.08), rgba(255, 255, 255, 0.96)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-weak);
}

.panel-copy,
.panel-empty,
.layer-item small,
.layer-status {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.layer-list {
  display: grid;
  gap: 10px;
}

.layer-item {
  display: grid;
  gap: 10px;
  width: 100%;
  height: auto;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard);
}

.layer-item:hover {
  transform: translateY(-1px);
  border-color: rgba(22, 93, 255, 0.3);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.06);
}

.layer-item.is-active {
  border-color: rgba(22, 93, 255, 0.42);
  background: rgba(248, 251, 255, 0.98);
  box-shadow:
    inset 3px 0 0 var(--cw-color-primary),
    0 12px 24px rgba(22, 93, 255, 0.08);
}

.layer-item-main {
  display: grid;
  gap: 8px;
  min-width: 0;
  cursor: pointer;
  outline: none;
}

.layer-item-main:focus-visible {
  border-radius: 10px;
  box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.18);
}

.layer-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-2);
}

.layer-name {
  min-width: 0;
}

.layer-name-input {
  min-width: 0;
  flex: 1 1 auto;
}

.layer-type {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  color: var(--cw-color-primary);
}

.layer-item strong {
  font-size: 15px;
  line-height: 1.5;
  color: var(--cw-color-text);
}

.layer-meta-line {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.layer-state-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.layer-state-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: var(--cw-radius-pill);
  background: rgba(15, 23, 42, 0.06);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--cw-color-text);
}

.layer-summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.layer-summary-label {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-color-muted);
}

.layer-summary-value {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--cw-color-text);
}

.layer-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.layer-selection-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(22, 93, 255, 0.14);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(240, 247, 255, 0.96), rgba(255, 255, 255, 0.96));
}

.layer-selection-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.layer-selection-copy strong {
  min-width: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--cw-color-text);
}

.layer-selection-copy p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.layer-selection-label {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cw-color-primary);
}

.layer-selection-action {
  flex-shrink: 0;
  border-radius: var(--cw-radius-pill);
}

.layer-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-2);
}

.layer-actions-advanced {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.layer-action-button {
  min-height: 44px;
  padding: 0 var(--cw-space-4);
  border-radius: var(--cw-radius-pill);
  color: var(--cw-color-text);
  cursor: pointer;
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard);
}

.layer-action-button:hover:enabled {
  transform: translateY(-1px);
  border-color: rgba(22, 93, 255, 0.34);
  background: rgba(22, 93, 255, 0.08);
}

.layer-action-button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

@media (max-width: 560px) {
  .layer-selection-summary {
    align-items: stretch;
    flex-direction: column;
  }

  .layer-selection-action {
    width: 100%;
  }
}
</style>
