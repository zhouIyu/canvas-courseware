import type {
  CoursewareDocument,
  CoursewareNode,
  NodeAnimation,
  NodePatch,
  Slide,
  TimelineStep,
} from "./schema";

export type CommandSource = "ui" | "adapter" | "system";
export type ReorderPosition = "forward" | "backward" | "front" | "back" | "index";

export type EditorCommand =
  | ReplaceDocumentCommand
  | CreateSlideCommand
  | UpdateSlideCommand
  | DeleteSlideCommand
  | ReorderSlideCommand
  | ActivateSlideCommand
  | CreateNodeCommand
  | BatchUpdateNodesCommand
  | UpdateNodeCommand
  | SetImageNodeAsBackgroundCommand
  | DeleteNodeCommand
  | SetSelectionCommand
  | ClearSelectionCommand
  | ReorderNodeCommand
  | UpsertTimelineStepCommand
  | RemoveTimelineStepCommand
  | ReorderTimelineStepCommand
  | UpsertAnimationCommand
  | RemoveAnimationCommand
  | HistoryUndoCommand
  | HistoryRedoCommand
  | PlaybackSetSlideCommand
  | PlaybackAdvanceStepCommand
  | PlaybackResetCommand;

export interface CommandEnvelope<TCommand extends EditorCommand = EditorCommand> {
  id: string;
  source: CommandSource;
  command: TCommand;
}

export interface ReplaceDocumentCommand {
  type: "document.replace";
  document: CoursewareDocument;
}

export interface CreateSlideCommand {
  type: "slide.create";
  slide: Slide;
  index?: number;
}

export interface UpdateSlideCommand {
  type: "slide.update";
  slideId: string;
  patch: Partial<Pick<Slide, "name" | "size" | "background">>;
}

export interface DeleteSlideCommand {
  type: "slide.delete";
  slideId: string;
}

/** 调整 slide 在文档中的顺序。 */
export interface ReorderSlideCommand {
  type: "slide.reorder";
  slideId: string;
  index: number;
}

export interface ActivateSlideCommand {
  type: "slide.activate";
  slideId: string;
}

export interface CreateNodeCommand {
  type: "node.create";
  slideId: string;
  node: CoursewareNode;
  index?: number;
}

/** 单次批量更新中的节点补丁条目。 */
export interface NodeBatchUpdateEntry {
  /** 需要更新的节点 id。 */
  nodeId: string;
  /** 需要写回该节点的标准补丁。 */
  patch: NodePatch;
}

/** 以一次标准命令批量更新多个节点，避免多选操作拆成多条历史记录。 */
export interface BatchUpdateNodesCommand {
  type: "node.batch.update";
  slideId: string;
  updates: NodeBatchUpdateEntry[];
}

export interface UpdateNodeCommand {
  type: "node.update";
  slideId: string;
  nodeId: string;
  patch: NodePatch;
}

/** 把一个图片节点转换为当前 slide 背景，并同步移除原节点。 */
export interface SetImageNodeAsBackgroundCommand {
  type: "node.image.set-as-background";
  slideId: string;
  nodeId: string;
}

export interface DeleteNodeCommand {
  type: "node.delete";
  slideId: string;
  nodeId: string;
}

export interface SetSelectionCommand {
  type: "selection.set";
  slideId: string;
  nodeIds: string[];
}

export interface ClearSelectionCommand {
  type: "selection.clear";
  slideId?: string;
}

export interface ReorderNodeCommand {
  type: "node.reorder";
  slideId: string;
  nodeId: string;
  position: ReorderPosition;
  targetNodeId?: string;
  index?: number;
}

export interface UpsertTimelineStepCommand {
  type: "timeline.step.upsert";
  slideId: string;
  step: TimelineStep;
  index?: number;
}

export interface RemoveTimelineStepCommand {
  type: "timeline.step.remove";
  slideId: string;
  stepId: string;
}

/** 调整某个时间轴步骤在当前 slide 中的顺序。 */
export interface ReorderTimelineStepCommand {
  type: "timeline.step.reorder";
  slideId: string;
  stepId: string;
  index: number;
}

export interface UpsertAnimationCommand {
  type: "timeline.animation.upsert";
  slideId: string;
  animation: NodeAnimation;
}

export interface RemoveAnimationCommand {
  type: "timeline.animation.remove";
  slideId: string;
  animationId: string;
}

/** 回退到上一条可恢复的编辑快照。 */
export interface HistoryUndoCommand {
  type: "history.undo";
}

/** 重新应用一条被撤销的编辑快照。 */
export interface HistoryRedoCommand {
  type: "history.redo";
}

export interface PlaybackSetSlideCommand {
  type: "playback.slide.set";
  slideId: string;
}

export interface PlaybackAdvanceStepCommand {
  type: "playback.step.advance";
}

export interface PlaybackResetCommand {
  type: "playback.reset";
  slideId?: string;
}
