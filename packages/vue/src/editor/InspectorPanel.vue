<script setup lang="ts">
import "./InspectorPanel.css";
import {
  createNodeAnimation,
  type CoursewareNode,
  type NodeAnimation,
  type NodePatch,
  type NodeTimelineSummary,
} from "@canvas-courseware/core";
import { computed, ref } from "vue";
import {
  formatAnimationKindLabel,
  formatEasingLabel,
  formatNodeInitialVisibilityLabel,
  formatNodeTypeLabel,
  formatOpacityValue,
  formatStepIndexLabel,
  formatTriggerLabel,
} from "../shared";
import EmptyState from "../shared/EmptyState.vue";
import InspectorImageSection from "./InspectorImageSection.vue";
import InspectorRectSection from "./InspectorRectSection.vue";
import InspectorTextSection from "./InspectorTextSection.vue";

/** 属性面板需要的只读状态输入。 */
const props = withDefaults(
  defineProps<{
    /** 当前首个选中的节点。 */
    selectedNode?: CoursewareNode | null;
    /** 当前选中的节点数量。 */
    selectedCount?: number;
    /** 当前选中节点关联的动画资源。 */
    selectedAnimations?: NodeAnimation[];
    /** 当前选中节点的步骤归属摘要。 */
    timelineSummary?: NodeTimelineSummary | null;
  }>(),
  {
    selectedNode: null,
    selectedCount: 0,
    selectedAnimations: () => [],
    timelineSummary: null,
  },
);

/** 属性面板向外派发的编辑意图。 */
const emit = defineEmits<{
  /** 更新当前选中节点。 */
  "update-node": [nodeId: string, patch: NodePatch];
  /** 用本地文件替换当前图片节点。 */
  "replace-image": [nodeId: string, file: File];
  /** 重新打开当前图片的裁剪弹窗。 */
  "recrop-image": [nodeId: string];
  /** 新增或更新当前节点关联的动画资源。 */
  "upsert-animation": [animation: NodeAnimation];
  /** 删除当前节点关联的动画资源。 */
  "remove-animation": [animationId: string];
}>();

/** 动画类型选项。 */
const animationKindOptions = [
  { label: formatAnimationKindLabel("appear"), value: "appear" },
  { label: formatAnimationKindLabel("fade"), value: "fade" },
  { label: formatAnimationKindLabel("slide-up"), value: "slide-up" },
] as const;

/** 缓动函数选项。 */
const easingOptions = [
  { label: formatEasingLabel("linear"), value: "linear" },
  { label: formatEasingLabel("ease-in"), value: "ease-in" },
  { label: formatEasingLabel("ease-out"), value: "ease-out" },
  { label: formatEasingLabel("ease-in-out"), value: "ease-in-out" },
] as const;

/** 当前是否正处于单选编辑状态。 */
const hasSingleSelection = computed(
  () => props.selectedCount === 1 && Boolean(props.selectedNode),
);

/** 当前是否是多选状态。 */
const hasMultipleSelection = computed(() => props.selectedCount > 1);

/** 当前节点的透明度百分比。 */
/** 当前节点是否锁定宽高比。 */
const nodeLockAspectRatio = computed(() => (props.selectedNode as any)?.lockAspectRatio ?? false);

const nodeOpacityPercent = computed(() =>
  props.selectedNode ? Math.round(props.selectedNode.opacity * 100) : 100,
);

/** 当前节点是否已经加入了至少一个步骤。 */
const hasTimelineSummary = computed(() => (props.timelineSummary?.stepReferences.length ?? 0) > 0);

/** 当前节点是否存在一个可展示的首个关联步骤。 */
const hasFirstTimelineStep = computed(
  () =>
    props.timelineSummary?.firstStepIndex !== null &&
    props.timelineSummary?.firstStepIndex !== undefined,
);

/** 当前选中节点是否已经配置动画。 */
const hasSelectedAnimations = computed(() => props.selectedAnimations.length > 0);

/** 当前已展开高级参数的动画 id 列表。 */
const expandedAnimationIds = ref<string[]>([]);

/** 读取文本输入框的字符串值。 */
const readTextInputValue = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  const target = value instanceof Event ? value.target : null;
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
    ? target.value
    : fallback;
};

/** 读取勾选框的布尔值。 */
const readCheckedValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  const target = value instanceof Event ? value.target : null;
  return target instanceof HTMLInputElement ? target.checked : fallback;
};

/**
 * 读取数字输入框的值，并在解析失败时回退到当前值。
 * 对于宽高、字号等字段，还会执行最小值保护，避免非法负数。
 */
const readNumberInputValue = (
  value: unknown,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
) => {
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : value instanceof Event &&
          (value.target instanceof HTMLInputElement || value.target instanceof HTMLSelectElement)
        ? Number(value.target.value)
      : Number.NaN;

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(parsed, minimum);
};

/** 统一发出节点更新事件。 */
const updateNode = (patch: NodePatch) => {
  if (!props.selectedNode) {
    return;
  }

  emit("update-node", props.selectedNode.id, patch);
};

/** 更新节点名称。 */
const handleNodeNameInput = (value: string | number | undefined) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    name: readTextInputValue(value, props.selectedNode.name),
  });
};

/** 更新节点基础数值属性。 */
const handleNodeBaseNumberChange = (
  field: "x" | "y" | "width" | "height" | "rotation",
  value: number | string | undefined,
) => {
  if (!props.selectedNode) {
    return;
  }

  const minimum = field === "width" || field === "height" ? 1 : Number.NEGATIVE_INFINITY;
  const rawValue = readNumberInputValue(value, props.selectedNode[field], minimum);
  const patch: NodePatch = {};

  if (field === "width" && nodeLockAspectRatio.value && props.selectedNode.height > 0) {
    /* 锁定宽高比时，修改宽度后自动按比例计算高度 */
    const aspectRatio = props.selectedNode.width / props.selectedNode.height;
    patch.width = rawValue;
    patch.height = Math.round(rawValue / aspectRatio);
  } else if (field === "height" && nodeLockAspectRatio.value && props.selectedNode.width > 0) {
    /* 锁定宽高比时，修改高度后自动按比例计算宽度 */
    const aspectRatio = props.selectedNode.width / props.selectedNode.height;
    patch.height = rawValue;
    patch.width = Math.round(rawValue * aspectRatio);
  } else {
    patch[field] = rawValue;
  }

  updateNode(patch);
};

/** 更新节点透明度。 */
const handleNodeOpacityChange = (value: number | string | undefined) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    opacity: readNumberInputValue(value, nodeOpacityPercent.value, 0) / 100,
  });
};

/** 切换锁定宽高比状态。 */
const handleLockAspectRatioChange = (value: boolean | string | number) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    lockAspectRatio: readCheckedValue(value, nodeLockAspectRatio.value),
  });
};

/** 更新节点的布尔状态。 */
const handleNodeToggle = (
  field: "visible" | "locked",
  value: string | number | boolean,
) => {
  if (!props.selectedNode) {
    return;
  }

  updateNode({
    [field]: readCheckedValue(value, props.selectedNode[field]),
  });
};

/** 统一发出动画更新事件。 */
const updateAnimation = (animation: NodeAnimation) => {
  emit("upsert-animation", animation);
};

/** 转发子分组抛出的节点更新事件，继续复用当前属性面板的标准命令出口。 */
const forwardNodeUpdate = (nodeId: string, patch: NodePatch) => {
  emit("update-node", nodeId, patch);
};

/** 转发图片分组抛出的本地文件替换事件。 */
const forwardImageReplace = (nodeId: string, file: File) => {
  emit("replace-image", nodeId, file);
};

/** 转发图片分组抛出的重新裁剪事件。 */
const forwardImageRecrop = (nodeId: string) => {
  emit("recrop-image", nodeId);
};

/** 为当前选中对象新增一个默认动画。 */
const handleCreateAnimation = () => {
  if (!props.selectedNode) {
    return;
  }

  const animation = createNodeAnimation({
    targetId: props.selectedNode.id,
  });

  expandedAnimationIds.value = [...expandedAnimationIds.value, animation.id];
  updateAnimation(animation);
};

/** 删除某个动画资源。 */
const handleRemoveAnimation = (animationId: string) => {
  expandedAnimationIds.value = expandedAnimationIds.value.filter((id) => id !== animationId);
  emit("remove-animation", animationId);
};

/** 判断某个动画的高级参数是否处于展开状态。 */
const isAnimationAdvancedOpen = (animationId: string): boolean =>
  expandedAnimationIds.value.includes(animationId);

/** 切换某个动画的高级参数显隐。 */
const toggleAnimationAdvanced = (animationId: string): void => {
  expandedAnimationIds.value = isAnimationAdvancedOpen(animationId)
    ? expandedAnimationIds.value.filter((id) => id !== animationId)
    : [...expandedAnimationIds.value, animationId];
};

/** 更新动画类型。 */
const handleAnimationKindChange = (
  animation: NodeAnimation,
  value: string | number | boolean | undefined,
) => {
  const nextKind = readTextInputValue(value, animation.kind) as NodeAnimation["kind"];

  updateAnimation({
    ...animation,
    kind: nextKind,
    offsetY: nextKind === "slide-up" ? animation.offsetY ?? 32 : undefined,
  });
};

/** 更新动画时长。 */
const handleAnimationDurationChange = (
  animation: NodeAnimation,
  value: number | string | undefined,
) => {
  updateAnimation({
    ...animation,
    durationMs: readNumberInputValue(value, animation.durationMs, 0),
  });
};

/** 更新动画延迟。 */
const handleAnimationDelayChange = (
  animation: NodeAnimation,
  value: number | string | undefined,
) => {
  updateAnimation({
    ...animation,
    delayMs: readNumberInputValue(value, animation.delayMs ?? 0, 0),
  });
};

/** 更新动画缓动。 */
const handleAnimationEasingChange = (
  animation: NodeAnimation,
  value: string | number | boolean | undefined,
) => {
  updateAnimation({
    ...animation,
    easing: readTextInputValue(value, animation.easing ?? "ease-out") as NodeAnimation["easing"],
  });
};

/** 更新 slide-up 动画的纵向偏移。 */
const handleAnimationOffsetYChange = (
  animation: NodeAnimation,
  value: number | string | undefined,
) => {
  updateAnimation({
    ...animation,
    offsetY: readNumberInputValue(value, animation.offsetY ?? 32, 0),
  });
};
</script>

<template>
  <section class="inspector-panel">
    <EmptyState
      v-if="hasMultipleSelection"
      compact
      title="当前选中了多个对象"
      description="先聚焦一个对象，再查看和编辑详细属性"
    >
      <template #icon>◫</template>
    </EmptyState>

    <template v-else-if="hasSingleSelection && selectedNode">
      <div class="group-card">
        <div class="group-head">
          <h4>基础属性</h4>
          <span class="group-badge accent">{{ formatNodeTypeLabel(selectedNode.type) }}</span>
        </div>

        <div class="field-grid">
          <div class="field field-span-2">
            <span class="field-label">节点名称</span>
            <a-input class="field-input" :model-value="selectedNode.name" @input="handleNodeNameInput" />
          </div>

          <div class="field">
            <span class="field-label">X</span>
            <a-input-number
              class="field-input"
              :model-value="selectedNode.x"
              @change="handleNodeBaseNumberChange('x', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">Y</span>
            <a-input-number
              class="field-input"
              :model-value="selectedNode.y"
              @change="handleNodeBaseNumberChange('y', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">宽度</span>
            <a-input-number
              class="field-input"
              min="1"
              :model-value="selectedNode.width"
              @change="handleNodeBaseNumberChange('width', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">高度</span>
            <a-input-number
              class="field-input"
              min="1"
              :model-value="selectedNode.height"
              @change="handleNodeBaseNumberChange('height', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">旋转</span>
            <a-input-number
              class="field-input"
              :model-value="selectedNode.rotation"
              @change="handleNodeBaseNumberChange('rotation', $event)"
            />
          </div>

          <div class="field">
            <span class="field-label">透明度</span>
            <a-input-number
              class="field-input"
              min="0"
              max="100"
              :model-value="nodeOpacityPercent"
              @change="handleNodeOpacityChange"
            />
          </div>
        </div>

        <div class="toggle-grid">
          <div class="toggle-field">
            <span class="field-label">可见</span>
            <a-switch
              class="field-toggle"
              :model-value="selectedNode.visible"
              @change="handleNodeToggle('visible', $event)"
            />
          </div>

          <div class="toggle-field">
            <span class="field-label">锁定</span>
            <a-switch
              class="field-toggle"
              :model-value="selectedNode.locked"
              @change="handleNodeToggle('locked', $event)"
            />
          </div>

          <div class="toggle-field">
            <span class="field-label">锁定宽高比</span>
            <a-switch
              class="field-toggle"
              :model-value="nodeLockAspectRatio"
              @change="handleLockAspectRatioChange"
            />
          </div>
        </div>

        <p class="group-footnote">当前透明度：{{ formatOpacityValue(selectedNode.opacity) }}</p>
      </div>

      <InspectorTextSection
        v-if="selectedNode.type === 'text'"
        :node="selectedNode"
        @update-node="forwardNodeUpdate"
      />

      <InspectorRectSection
        v-if="selectedNode.type === 'rect'"
        :node="selectedNode"
        @update-node="forwardNodeUpdate"
      />

      <InspectorImageSection
        v-if="selectedNode.type === 'image'"
        :node="selectedNode"
        @recrop-image="forwardImageRecrop"
        @replace-image="forwardImageReplace"
        @update-node="forwardNodeUpdate"
      />

      <div class="group-card">
        <div class="group-head">
          <h4>动画设置</h4>
          <a-button
            class="icon-button"
            type="text"
            aria-label="新建动画"
            @click="handleCreateAnimation"
          >
            <template #icon>
              <icon-plus />
            </template>
          </a-button>
        </div>

        <div v-if="hasSelectedAnimations" class="animation-list">
          <article
            v-for="(animation, animationIndex) in selectedAnimations"
            :key="animation.id"
            class="animation-card"
          >
            <header class="card-head">
              <div class="card-title-row">
                <span class="card-index">动画 {{ animationIndex + 1 }}</span>
              </div>
              <a-button
                class="icon-button danger-icon-button"
                status="danger"
                type="text"
                aria-label="删除动画"
                @click="handleRemoveAnimation(animation.id)"
              >
                <template #icon>
                  <icon-delete />
                </template>
              </a-button>
            </header>

            <div class="field-grid">
              <div class="field">
                <span class="field-label">类型</span>
                <a-select
                  class="field-input"
                  :model-value="animation.kind"
                  popup-container="body"
                  @change="handleAnimationKindChange(animation, $event)"
                >
                  <a-option
                    v-for="option in animationKindOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </a-option>
                </a-select>
              </div>

              <div class="field">
                <span class="field-label">时长(ms)</span>
                <a-input-number
                  class="field-input"
                  min="0"
                  :model-value="animation.durationMs"
                  @change="handleAnimationDurationChange(animation, $event)"
                />
              </div>

              <div class="advanced-fields field-span-2">
                <a-button
                  class="advanced-toggle"
                  type="text"
                  @click="toggleAnimationAdvanced(animation.id)"
                >
                  {{ isAnimationAdvancedOpen(animation.id) ? "收起高级参数" : "高级参数" }}
                </a-button>

                <div v-if="isAnimationAdvancedOpen(animation.id)" class="advanced-grid">
                  <div class="field">
                    <span class="field-label">缓动</span>
                    <a-select
                      class="field-input"
                      :model-value="animation.easing ?? 'ease-out'"
                      popup-container="body"
                      @change="handleAnimationEasingChange(animation, $event)"
                    >
                      <a-option
                        v-for="option in easingOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </div>

                  <div class="field">
                    <span class="field-label">延迟(ms)</span>
                    <a-input-number
                      class="field-input"
                      min="0"
                      :model-value="animation.delayMs ?? 0"
                      @change="handleAnimationDelayChange(animation, $event)"
                    />
                  </div>

                  <div v-if="animation.kind === 'slide-up'" class="field field-span-2">
                    <span class="field-label">偏移Y</span>
                    <a-input-number
                      class="field-input"
                      min="0"
                      :model-value="animation.offsetY ?? 32"
                      @change="handleAnimationOffsetYChange(animation, $event)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
        <p v-else class="group-copy">当前对象还没有动画。</p>
      </div>

      <div class="group-card">
        <div class="group-head">
          <h4>播放归属</h4>
          <span class="group-badge accent">
            {{ hasTimelineSummary ? `${timelineSummary?.stepReferences.length ?? 0} 个步骤` : "未编排" }}
          </span>
        </div>

        <div class="timeline-overview">
          <span class="timeline-chip">
            {{ formatNodeInitialVisibilityLabel(timelineSummary?.isInitiallyVisible ?? selectedNode.visible) }}
          </span>
          <span v-if="hasFirstTimelineStep" class="timeline-chip accent">
            {{ formatStepIndexLabel(timelineSummary?.firstStepIndex ?? 0) }}
          </span>
          <span v-else class="timeline-chip subtle">当前对象尚未加入时间轴步骤</span>
        </div>

        <div v-if="hasTimelineSummary" class="timeline-step-list">
          <article
            v-for="stepReference in timelineSummary?.stepReferences ?? []"
            :key="stepReference.stepId"
            class="timeline-step-card"
          >
            <div class="timeline-step-topline">
              <strong>{{ formatStepIndexLabel(stepReference.stepIndex) }}</strong>
              <span>{{ formatTriggerLabel(stepReference.triggerType) }}</span>
            </div>
            <p>{{ stepReference.stepName }}</p>
            <small>{{ stepReference.actionTypes.length }} 个相关动作</small>
          </article>
        </div>
      </div>
    </template>

    <EmptyState
      v-else
      compact
      title="未选中对象"
      description="点击画布中的对象查看属性"
    >
      <template #icon>◎</template>
    </EmptyState>
  </section>
</template>
