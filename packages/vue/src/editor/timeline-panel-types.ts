import type { TimelineStep } from "@canvas-courseware/core";

/** 时间轴步骤复制事件的标准化载荷。 */
export interface TimelineStepDuplicatePayload {
  /** 需要复制的源步骤快照。 */
  step: TimelineStep;
  /** 源步骤在当前 slide 中的索引。 */
  index: number;
  /** 复制时允许覆写副本名称，供“后插一步”等快捷入口复用。 */
  name?: string;
}

/** 步骤卡片“更多操作”菜单中允许执行的快捷动作。 */
export type TimelineStepMenuAction =
  | "move-up"
  | "move-down"
  | "insert-after"
  | "duplicate"
  | "delete";
