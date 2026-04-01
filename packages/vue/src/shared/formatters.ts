import type {
  AnimationKind,
  CoursewareNode,
  EasingName,
  NodeTimelineSummary,
  PlaybackState,
  StepTriggerType,
  TimelineAction,
} from "@canvas-courseware/core";

/** 编辑器工作区的默认最小高度。 */
export const DEFAULT_EDITOR_HEIGHT = 840;

/** 预览器工作区的默认最小高度。 */
export const DEFAULT_PREVIEW_HEIGHT = 760;

/**
 * 根据当前选中数量生成侧边状态文案。
 * 这个格式化函数只处理展示，不参与业务状态计算。
 */
export function formatSelectionLabel(count: number): string {
  if (count === 0) {
    return "未选中对象";
  }

  return `已选中 ${count} 个对象`;
}

/**
 * 根据播放状态和步骤数量生成预览器摘要。
 * 这里把 stepIndex 视为“已执行完成的步骤数”。
 */
export function formatPlaybackSummary(
  stepIndex: number,
  totalSteps: number,
  status: PlaybackState["status"],
): string {
  if (totalSteps === 0) {
    return "当前页面还没有播放步骤";
  }

  return `已播放 ${Math.min(stepIndex, totalSteps)} / ${totalSteps} 步 · ${formatPlaybackStatus(status)}`;
}

/**
 * 把 trigger 类型转成更适合 UI 的短标签。
 * 当没有下一步时返回 `None`，方便在状态栏里直接展示。
 */
export function formatTriggerLabel(trigger: StepTriggerType | "click" | null): string {
  if (!trigger) {
    return "无";
  }

  switch (trigger) {
    case "click":
    case "page-click":
      return "点击页面继续";
    case "node-click":
      return "点击对象继续";
    case "auto":
      return "自动继续";
    default:
      return "无";
  }
}

/**
 * 把播放状态枚举转成更容易理解的中文标签。
 * 这样预览器不会直接暴露内部技术状态名。
 */
export function formatPlaybackStatus(status: PlaybackState["status"]): string {
  switch (status) {
    case "idle":
      return "待命";
    case "playing":
      return "播放中";
    case "paused":
      return "等待继续";
    case "completed":
      return "已完成";
    default:
      return "未知状态";
  }
}

/**
 * 把节点类型转成图层面板和说明卡可复用的短标签。
 * 这里统一中英文语义，避免不同组件分别维护一份映射表。
 */
export function formatNodeTypeLabel(type: CoursewareNode["type"]): string {
  switch (type) {
    case "text":
      return "文本";
    case "image":
      return "图片";
    case "rect":
      return "矩形";
    default:
      return "未知类型";
  }
}

/**
 * 把 timeline 动作类型转成更适合表单和摘要的中文标签。
 * 时间轴面板和后续 JSON 预览都可以复用这份映射。
 */
export function formatTimelineActionLabel(type: TimelineAction["type"]): string {
  switch (type) {
    case "show-node":
      return "显示对象";
    case "hide-node":
      return "隐藏对象";
    case "play-animation":
      return "播放动画";
    default:
      return "未知动作";
  }
}

/**
 * 把步骤索引转成面向编辑器用户的短标签。
 * UI 中统一按“第 N 步”展示，避免不同面板各写一套格式。
 */
export function formatStepIndexLabel(stepIndex: number): string {
  return `第 ${stepIndex + 1} 步`;
}

/**
 * 把动画类型枚举转成更容易理解的中文标签。
 * 这样 UI 不需要直接暴露 schema 里的英文值。
 */
export function formatAnimationKindLabel(kind: AnimationKind): string {
  switch (kind) {
    case "appear":
      return "直接出现";
    case "fade":
      return "淡入";
    case "slide-up":
      return "上滑出现";
    default:
      return "未知动画";
  }
}

/**
 * 把 easing 枚举转成适合下拉框展示的中文标签。
 * 这里保留“线性 / 缓入 / 缓出 / 缓入缓出”的产品化命名。
 */
export function formatEasingLabel(easing: EasingName): string {
  switch (easing) {
    case "linear":
      return "线性";
    case "ease-in":
      return "缓入";
    case "ease-out":
      return "缓出";
    case "ease-in-out":
      return "缓入缓出";
    default:
      return "未知缓动";
  }
}

/**
 * 把节点默认可见状态格式化为编辑态可读文案。
 * 这能帮助用户区分“默认显示”与“依赖后续步骤出现”的对象。
 */
export function formatNodeInitialVisibilityLabel(isInitiallyVisible: boolean): string {
  return isInitiallyVisible ? "默认显示" : "默认隐藏";
}

/**
 * 根据节点时间轴归属摘要生成一个紧凑说明。
 * 适合图层卡片这类空间有限的区域直接复用。
 */
export function formatNodeTimelineSummaryLabel(summary: NodeTimelineSummary | null): string {
  if (!summary) {
    return "未编排";
  }

  if (summary.stepReferences.length === 0) {
    return summary.isInitiallyVisible ? "未加入步骤" : "隐藏且未加入步骤";
  }

  return `${formatStepIndexLabel(summary.stepReferences[0].stepIndex)} 起参与播放`;
}

/**
 * 用紧凑文案展示节点的坐标与尺寸。
 * 图层面板和 playground 说明区都可以直接复用这个摘要。
 */
export function formatNodeGeometry(node: CoursewareNode): string {
  return `${Math.round(node.x)}, ${Math.round(node.y)} · ${Math.round(node.width)} × ${Math.round(node.height)}`;
}

/**
 * 把 0-1 的透明度格式化为百分比，便于属性面板直接展示。
 * 保持一位小数的同时尽量避免出现冗长的小数尾巴。
 */
export function formatOpacityValue(opacity: number): string {
  return `${Math.round(opacity * 100)}%`;
}
