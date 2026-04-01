<script setup lang="ts">
import type {
  CoursewareNode,
  NodeTimelineSummary,
  ReorderPosition,
} from "@canvas-courseware/core";
import { computed } from "vue";
import {
  formatNodeGeometry,
  formatNodeInitialVisibilityLabel,
  formatNodeTimelineSummaryLabel,
  formatNodeTypeLabel,
  formatStepIndexLabel,
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

/** 读取节点归属中的步骤 chip 列表。 */
const resolveStepReferenceLabels = (nodeId: string): string[] =>
  (resolveNodeTimelineSummary(nodeId)?.stepReferences ?? []).map((stepReference) =>
    formatStepIndexLabel(stepReference.stepIndex),
  );
</script>

<template>
  <section class="layer-panel">
    <header class="panel-head">
      <div>
        <p class="panel-kicker">管理区</p>
        <h3>图层列表</h3>
      </div>
      <span class="panel-count">{{ nodes.length }} 个对象</span>
    </header>

    <p class="panel-copy">
      当前顺序与文档 `nodes[]` 一致，下方标签会同时提示对象默认显隐状态和关联步骤。
    </p>

    <div v-if="nodes.length > 0" class="layer-list">
      <button
        v-for="node in nodes"
        :key="node.id"
        class="layer-item"
        :class="{ 'is-active': selectedNodeIds.includes(node.id) }"
        type="button"
        :aria-pressed="selectedNodeIds.includes(node.id)"
        @click="handleSelect(node.id)"
      >
        <div class="layer-topline">
          <span class="layer-type">{{ formatNodeTypeLabel(node.type) }}</span>
          <span class="layer-status">{{ node.visible ? "可见" : "隐藏" }}</span>
        </div>
        <strong>{{ node.name }}</strong>
        <small>{{ formatNodeGeometry(node) }}</small>
        <div class="timeline-meta">
          <span class="timeline-chip">
            {{
              formatNodeInitialVisibilityLabel(
                resolveNodeTimelineSummary(node.id)?.isInitiallyVisible ?? node.visible,
              )
            }}
          </span>
          <span
            v-for="stepLabel in resolveStepReferenceLabels(node.id)"
            :key="`${node.id}-${stepLabel}`"
            class="timeline-chip accent"
          >
            {{ stepLabel }}
          </span>
          <span class="timeline-chip subtle">
            {{ formatNodeTimelineSummaryLabel(resolveNodeTimelineSummary(node.id)) }}
          </span>
        </div>
      </button>
    </div>
    <p v-else class="panel-empty">当前页面还没有内容，先从上方工具栏插入一个对象。</p>

    <div class="layer-actions">
      <button
        class="layer-action-button"
        type="button"
        :disabled="!canMoveFront"
        @click="handleReorder('front')"
      >
        置顶
      </button>
      <button
        class="layer-action-button"
        type="button"
        :disabled="!canMoveForward"
        @click="handleReorder('forward')"
      >
        上移
      </button>
      <button
        class="layer-action-button"
        type="button"
        :disabled="!canMoveBackward"
        @click="handleReorder('backward')"
      >
        下移
      </button>
      <button
        class="layer-action-button"
        type="button"
        :disabled="!canMoveBack"
        @click="handleReorder('back')"
      >
        置底
      </button>
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
    linear-gradient(180deg, rgba(20, 184, 166, 0.08), rgba(255, 255, 255, 0.96)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-weak);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-4);
}

.panel-kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cw-color-primary);
}

.panel-head h3 {
  margin: var(--cw-space-2) 0 0;
  font-size: 22px;
  line-height: 1.2;
}

.panel-count {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 var(--cw-space-3);
  border-radius: var(--cw-radius-pill);
  font-size: 13px;
  color: var(--cw-color-primary);
  background: rgba(20, 184, 166, 0.12);
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
  gap: var(--cw-space-3);
}

.layer-item {
  display: grid;
  gap: var(--cw-space-2);
  width: 100%;
  padding: 14px 16px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-md);
  text-align: left;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.92);
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard),
    box-shadow var(--cw-duration-fast) var(--cw-ease-standard);
}

.layer-item:hover {
  transform: translateY(-1px);
  border-color: rgba(20, 184, 166, 0.28);
}

.layer-item.is-active {
  border-color: rgba(13, 148, 136, 0.42);
  background: rgba(20, 184, 166, 0.08);
  box-shadow: inset 0 0 0 1px rgba(20, 184, 166, 0.22);
}

.layer-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cw-space-2);
}

.layer-type {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: var(--cw-radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-color-primary);
  background: rgba(13, 148, 136, 0.1);
}

.layer-item strong {
  font-size: 16px;
  line-height: 1.5;
  color: var(--cw-color-text);
}

.timeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cw-space-2);
}

.timeline-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: var(--cw-radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: var(--cw-color-muted);
  background: rgba(100, 116, 139, 0.1);
}

.timeline-chip.accent {
  color: var(--cw-color-primary);
  background: rgba(13, 148, 136, 0.12);
}

.timeline-chip.subtle {
  color: var(--cw-color-text);
  background: rgba(19, 78, 74, 0.08);
}

.layer-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cw-space-2);
}

.layer-action-button {
  min-height: 44px;
  padding: 0 var(--cw-space-4);
  border: 1px solid rgba(13, 148, 136, 0.18);
  border-radius: var(--cw-radius-pill);
  color: var(--cw-color-text);
  cursor: pointer;
  background: rgba(255, 255, 255, 0.9);
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard);
}

.layer-action-button:hover:enabled {
  transform: translateY(-1px);
  border-color: rgba(13, 148, 136, 0.34);
  background: rgba(20, 184, 166, 0.08);
}

.layer-action-button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
</style>
