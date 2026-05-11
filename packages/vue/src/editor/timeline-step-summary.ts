import type { Slide, TimelineStep } from "@canvas-courseware/core";

/** 步骤卡片头部两行摘要的标准化展示结构。 */
export interface TimelineStepHeadlineSummary {
  /** 当前步骤的触发方式摘要。 */
  triggerLabel: string;
  /** 当前步骤包含的动作数量摘要。 */
  actionCountLabel: string;
}

/** 读取节点在摘要里应展示的名称，缺失时返回占位提示。 */
function resolveNodeLabel(
  slide: Slide | null | undefined,
  nodeId: string,
): string {
  return slide?.nodes.find((node) => node.id === nodeId)?.name ?? "已删除对象";
}

/** 把步骤触发方式压缩成一步可读的简洁文案。 */
function resolveTriggerLabel(
  step: TimelineStep,
  slide: Slide | null | undefined,
): string {
  switch (step.trigger.type) {
    case "auto":
      return `自动触发 · ${step.trigger.delayMs}ms 后`;
    case "node-click":
      return `点击 ${resolveNodeLabel(slide, step.trigger.targetId)}`;
    case "page-click":
    default:
      return "页面点击";
  }
}

/** 把动作数量收敛成适合卡片第二行的简洁统计。 */
function resolveActionCountLabel(actionCount: number): string {
  if (actionCount <= 0) {
    return "暂无动作";
  }

  return `${actionCount} 个动作`;
}

/** 生成步骤卡片头部两行所需的紧凑摘要，降低折叠态信息密度。 */
export function resolveTimelineStepHeadlineSummary(
  step: TimelineStep,
  slide: Slide | null | undefined,
): TimelineStepHeadlineSummary {
  return {
    triggerLabel: resolveTriggerLabel(step, slide),
    actionCountLabel: resolveActionCountLabel(step.actions.length),
  };
}
