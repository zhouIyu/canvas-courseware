import type {
  CoursewareDocument,
  CoursewareNode,
  NodeAnimation,
  NodePatch,
  ObjectFit,
  Slide,
  TimelineStep,
} from "./schema";

export type CommandSource = "ui" | "adapter" | "system";
export type ReorderPosition = "forward" | "backward" | "front" | "back" | "index";
/** 统一维护编辑器标准命令类型，避免跨层重复手写字符串协议。 */
export const COMMAND_TYPES = {
  DOCUMENT_REPLACE: "document.replace",
  SLIDE_CREATE: "slide.create",
  SLIDE_UPDATE: "slide.update",
  SLIDE_DELETE: "slide.delete",
  SLIDE_REORDER: "slide.reorder",
  SLIDE_ACTIVATE: "slide.activate",
  NODE_CREATE: "node.create",
  NODE_BATCH_UPDATE: "node.batch.update",
  NODE_UPDATE: "node.update",
  NODE_IMAGE_SET_AS_BACKGROUND: "node.image.set-as-background",
  NODE_BATCH_DELETE: "node.batch.delete",
  NODE_DELETE: "node.delete",
  SELECTION_SET: "selection.set",
  SELECTION_CLEAR: "selection.clear",
  NODE_REORDER: "node.reorder",
  TIMELINE_STEP_UPSERT: "timeline.step.upsert",
  TIMELINE_STEP_REMOVE: "timeline.step.remove",
  TIMELINE_STEP_REORDER: "timeline.step.reorder",
  TIMELINE_ANIMATION_UPSERT: "timeline.animation.upsert",
  TIMELINE_ANIMATION_REMOVE: "timeline.animation.remove",
  HISTORY_UNDO: "history.undo",
  HISTORY_REDO: "history.redo",
  PLAYBACK_SLIDE_SET: "playback.slide.set",
  PLAYBACK_STEP_ADVANCE: "playback.step.advance",
  PLAYBACK_RESET: "playback.reset",
} as const;
/** 编辑器标准命令 type 的字面量联合。 */
export type EditorCommandType = (typeof COMMAND_TYPES)[keyof typeof COMMAND_TYPES];

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
  | BatchDeleteNodesCommand
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
  type: typeof COMMAND_TYPES.DOCUMENT_REPLACE;
  document: CoursewareDocument;
}

export interface CreateSlideCommand {
  type: typeof COMMAND_TYPES.SLIDE_CREATE;
  slide: Slide;
  index?: number;
}

export interface UpdateSlideCommand {
  type: typeof COMMAND_TYPES.SLIDE_UPDATE;
  slideId: string;
  patch: Partial<Pick<Slide, "name" | "size" | "background">>;
}

export interface DeleteSlideCommand {
  type: typeof COMMAND_TYPES.SLIDE_DELETE;
  slideId: string;
}

/** 调整 slide 在文档中的顺序。 */
export interface ReorderSlideCommand {
  type: typeof COMMAND_TYPES.SLIDE_REORDER;
  slideId: string;
  index: number;
}

export interface ActivateSlideCommand {
  type: typeof COMMAND_TYPES.SLIDE_ACTIVATE;
  slideId: string;
}

export interface CreateNodeCommand {
  type: typeof COMMAND_TYPES.NODE_CREATE;
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
  type: typeof COMMAND_TYPES.NODE_BATCH_UPDATE;
  slideId: string;
  updates: NodeBatchUpdateEntry[];
}

export interface UpdateNodeCommand {
  type: typeof COMMAND_TYPES.NODE_UPDATE;
  slideId: string;
  nodeId: string;
  patch: NodePatch;
}

/** 把一个图片节点转换为当前 slide 背景，并同步移除原节点。 */
export interface SetImageNodeAsBackgroundCommand {
  type: typeof COMMAND_TYPES.NODE_IMAGE_SET_AS_BACKGROUND;
  slideId: string;
  nodeId: string;
  /** 可选的背景图填充方式；为空时沿用节点或页面已有配置。 */
  fit?: ObjectFit;
}

/** 一次性删除同一页面中的多个节点，避免批量删除拆成多条历史记录。 */
export interface BatchDeleteNodesCommand {
  type: typeof COMMAND_TYPES.NODE_BATCH_DELETE;
  slideId: string;
  /** 需要被统一删除的节点 id 列表。 */
  nodeIds: string[];
}

export interface DeleteNodeCommand {
  type: typeof COMMAND_TYPES.NODE_DELETE;
  slideId: string;
  nodeId: string;
}

export interface SetSelectionCommand {
  type: typeof COMMAND_TYPES.SELECTION_SET;
  slideId: string;
  nodeIds: string[];
}

export interface ClearSelectionCommand {
  type: typeof COMMAND_TYPES.SELECTION_CLEAR;
  slideId?: string;
}

export interface ReorderNodeCommand {
  type: typeof COMMAND_TYPES.NODE_REORDER;
  slideId: string;
  nodeId: string;
  position: ReorderPosition;
  targetNodeId?: string;
  index?: number;
}

export interface UpsertTimelineStepCommand {
  type: typeof COMMAND_TYPES.TIMELINE_STEP_UPSERT;
  slideId: string;
  step: TimelineStep;
  index?: number;
}

export interface RemoveTimelineStepCommand {
  type: typeof COMMAND_TYPES.TIMELINE_STEP_REMOVE;
  slideId: string;
  stepId: string;
}

/** 调整某个时间轴步骤在当前 slide 中的顺序。 */
export interface ReorderTimelineStepCommand {
  type: typeof COMMAND_TYPES.TIMELINE_STEP_REORDER;
  slideId: string;
  stepId: string;
  index: number;
}

export interface UpsertAnimationCommand {
  type: typeof COMMAND_TYPES.TIMELINE_ANIMATION_UPSERT;
  slideId: string;
  animation: NodeAnimation;
}

export interface RemoveAnimationCommand {
  type: typeof COMMAND_TYPES.TIMELINE_ANIMATION_REMOVE;
  slideId: string;
  animationId: string;
}

/** 回退到上一条可恢复的编辑快照。 */
export interface HistoryUndoCommand {
  type: typeof COMMAND_TYPES.HISTORY_UNDO;
}

/** 重新应用一条被撤销的编辑快照。 */
export interface HistoryRedoCommand {
  type: typeof COMMAND_TYPES.HISTORY_REDO;
}

export interface PlaybackSetSlideCommand {
  type: typeof COMMAND_TYPES.PLAYBACK_SLIDE_SET;
  slideId: string;
}

export interface PlaybackAdvanceStepCommand {
  type: typeof COMMAND_TYPES.PLAYBACK_STEP_ADVANCE;
}

export interface PlaybackResetCommand {
  type: typeof COMMAND_TYPES.PLAYBACK_RESET;
  slideId?: string;
}
