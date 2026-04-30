import type { Slide, TimelineAction, TimelineStep } from "@canvas-courseware/core";
import {
  formatAnimationKindLabel,
  formatTimelineActionLabel,
} from "../shared";

/** 时间轴摘要标签的视觉语义。 */
export type TimelineSummaryChipTone = "trigger" | "detail" | "action" | "empty";

/** 单个时间轴摘要标签的标准化展示描述。 */
export interface TimelineSummaryChip {
  /** 保持列表渲染稳定的唯一键。 */
  key: string;
  /** 直接展示在步骤列表头部的紧凑文案。 */
  label: string;
  /** 当前标签的视觉语义，供样式层区分。 */
  tone: TimelineSummaryChipTone;
}

/** 读取节点在摘要里应展示的名称，缺失时返回占位提示。 */
function resolveNodeLabel(
  slide: Slide | null | undefined,
  nodeId: string,
): string {
  return slide?.nodes.find((node) => node.id === nodeId)?.name ?? "已删除对象";
}

/** 读取动画的目标对象与动画类型，便于在摘要中快速识别。 */
function resolveAnimationSummary(
  slide: Slide | null | undefined,
  animationId: string,
): {
  /** 动画实际作用的目标对象名称。 */
  targetLabel: string;
  /** 动画类型对应的中文标签。 */
  kindLabel: string;
} | null {
  const animation = slide?.timeline.animations.find((item) => item.id === animationId);

  if (!animation) {
    return null;
  }

  return {
    targetLabel: resolveNodeLabel(slide, animation.targetId),
    kindLabel: formatAnimationKindLabel(animation.kind),
  };
}

/** 把步骤触发方式转换成列表头部可读的摘要标签。 */
function resolveTriggerSummaryChips(
  step: TimelineStep,
  slide: Slide | null | undefined,
): TimelineSummaryChip[] {
  switch (step.trigger.type) {
    case "auto":
      return [
        {
          key: `${step.id}-trigger-type`,
          label: "自动触发",
          tone: "trigger",
        },
        {
          key: `${step.id}-trigger-detail`,
          label: `延迟 ${step.trigger.delayMs}ms`,
          tone: "detail",
        },
      ];
    case "node-click":
      return [
        {
          key: `${step.id}-trigger-type`,
          label: "对象点击",
          tone: "trigger",
        },
        {
          key: `${step.id}-trigger-detail`,
          label: `触发 ${resolveNodeLabel(slide, step.trigger.targetId)}`,
          tone: "detail",
        },
      ];
    case "page-click":
    default:
      return [
        {
          key: `${step.id}-trigger-type`,
          label: "页面点击",
          tone: "trigger",
        },
      ];
  }
}

/** 把单个时间轴动作压缩成一步可读的目标对象与动画摘要。 */
function resolveActionSummaryChip(
  stepId: string,
  slide: Slide | null | undefined,
  action: TimelineAction,
  actionIndex: number,
): TimelineSummaryChip {
  switch (action.type) {
    case "hide-node":
      return {
        key: `${stepId}-action-${action.id}-${actionIndex}`,
        label: `${formatTimelineActionLabel(action.type)} · ${resolveNodeLabel(slide, action.targetId)}`,
        tone: "action",
      };
    case "play-animation": {
      const animationSummary = resolveAnimationSummary(slide, action.animationId);

      return {
        key: `${stepId}-action-${action.id}-${actionIndex}`,
        label: animationSummary
          ? `${formatTimelineActionLabel(action.type)} · ${animationSummary.targetLabel} · ${animationSummary.kindLabel}`
          : `${formatTimelineActionLabel(action.type)} · 缺少动画`,
        tone: "action",
      };
    }
    case "show-node":
    default: {
      const baseLabel = `${formatTimelineActionLabel(action.type)} · ${resolveNodeLabel(slide, action.targetId)}`;
      const animationSummary = action.animationId
        ? resolveAnimationSummary(slide, action.animationId)
        : null;

      return {
        key: `${stepId}-action-${action.id}-${actionIndex}`,
        label: animationSummary
          ? `${baseLabel} · ${animationSummary.kindLabel}`
          : baseLabel,
        tone: "action",
      };
    }
  }
}

/** 生成步骤卡片头部的全部摘要标签，便于折叠后仍能快速识别配置。 */
export function resolveTimelineStepSummaryChips(
  step: TimelineStep,
  slide: Slide | null | undefined,
): TimelineSummaryChip[] {
  const triggerChips = resolveTriggerSummaryChips(step, slide);

  if (step.actions.length === 0) {
    return [
      ...triggerChips,
      {
        key: `${step.id}-actions-empty`,
        label: "暂无动作",
        tone: "empty",
      },
    ];
  }

  return [
    ...triggerChips,
    ...step.actions.map((action, actionIndex) =>
      resolveActionSummaryChip(step.id, slide, action, actionIndex),
    ),
  ];
}
