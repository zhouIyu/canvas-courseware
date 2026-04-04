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
  | ActivateSlideCommand
  | CreateNodeCommand
  | UpdateNodeCommand
  | DeleteNodeCommand
  | SetSelectionCommand
  | ClearSelectionCommand
  | ReorderNodeCommand
  | UpsertTimelineStepCommand
  | RemoveTimelineStepCommand
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

export interface UpdateNodeCommand {
  type: "node.update";
  slideId: string;
  nodeId: string;
  patch: NodePatch;
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
}

export interface RemoveTimelineStepCommand {
  type: "timeline.step.remove";
  slideId: string;
  stepId: string;
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
