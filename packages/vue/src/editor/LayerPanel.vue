<script setup lang="ts">
import type {
  CoursewareNode,
  NodeTimelineSummary,
  ReorderPosition,
} from "@canvas-courseware/core";
import { computed } from "vue";
import {
  formatNodeGeometry,
  formatNodeTimelineSummaryLabel,
  formatNodeTypeLabel,
} from "../shared";

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
  /** 调整当前选中节点的层级。 */
  reorder: [nodeId: string, position: ReorderPosition];
}>();

/** 当前首个选中的节点 id。 */
const primarySelectedNodeId = computed(() => props.selectedNodeIds[0] ?? null);

/** 当前首个选中的节点对象。 */
const primarySelectedNode = computed(() =>
  props.nodes.find((node) => node.id === primarySelectedNodeId.value),
);

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

/** 选中某个图层项。 */
const handleSelect = (nodeId: string) => {
  emit("select", nodeId);
};

/** 根据面板按钮派发层级操作。 */
const handleReorder = (position: ReorderPosition) => {
  if (!primarySelectedNode.value) {
    return;
  }

  emit("reorder", primarySelectedNode.value.id, position);
};

/** 读取某个节点的步骤归属摘要。 */
const resolveNodeTimelineSummary = (nodeId: string): NodeTimelineSummary | null =>
  props.nodeTimelineSummaryMap[nodeId] ?? null;

/** 组合单张图层卡片的精简元信息。 */
const resolveNodeMetaLine = (node: CoursewareNode): string =>
  `${formatNodeTypeLabel(node.type)} · ${node.visible ? "可见" : "隐藏"} · ${formatNodeGeometry(node)}`;
</script>

<template>
  <section class="layer-panel">
    <p class="panel-copy">
      当前顺序与文档 `nodes[]` 一致，下方标签会同时提示对象默认显隐状态和关联步骤。
    </p>

    <div v-if="nodes.length > 0" class="layer-list">
      <a-button
        v-for="node in nodes"
        :key="node.id"
        class="layer-item"
        :class="{ 'is-active': selectedNodeIds.includes(node.id) }"
        type="text"
        :aria-pressed="selectedNodeIds.includes(node.id)"
        @click="handleSelect(node.id)"
      >
        <div class="layer-item-head">
          <strong>{{ node.name }}</strong>
          <span class="layer-type">{{ formatNodeTypeLabel(node.type) }}</span>
        </div>
        <small class="layer-meta-line">{{ resolveNodeMetaLine(node) }}</small>
        <div class="layer-summary-line">
          <span class="layer-summary-label">播放</span>
          <span class="layer-summary-value">
            {{ formatNodeTimelineSummaryLabel(resolveNodeTimelineSummary(node.id)) }}
          </span>
        </div>
      </a-button>
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
  gap: 8px;
  width: 100%;
  height: auto;
  padding: 14px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
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

.layer-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-2);
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

.layer-item:deep(.arco-btn-content) {
  display: grid;
  width: 100%;
  gap: 8px;
}

.layer-meta-line {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  color: var(--cw-color-muted);
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

.layer-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-2);
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
</style>
