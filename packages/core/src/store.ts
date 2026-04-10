import mitt, { type Emitter } from "mitt";
import type { CommandEnvelope, EditorCommand } from "./commands";
import type { EditorEvent } from "./events";
import type {
  CoursewareDocument,
  EditorSnapshot,
  PlaybackState,
  SelectionState,
} from "./schema";
import {
  createCommandEnvelope,
  createCoursewareDocument,
  createEditorSnapshot,
} from "./factories";
import { reduceSnapshot } from "./reducer";

/** 编辑历史最多保留的快照条目数。 */
const MAX_HISTORY_ENTRIES = 120;

export type SnapshotListener = (
  snapshot: EditorSnapshot,
  envelope: CommandEnvelope,
) => void;

export type EditorEventListener = (
  event: EditorEvent,
  envelope: CommandEnvelope,
) => void;

export type HistoryStateListener = (
  historyState: EditorHistoryState,
  snapshot: EditorSnapshot,
  envelope: CommandEnvelope,
) => void;

/** 编辑器历史状态摘要。 */
export interface EditorHistoryState {
  /** 当前是否仍可撤销。 */
  canUndo: boolean;
  /** 当前是否仍可重做。 */
  canRedo: boolean;
  /** 当前可撤销条目数量。 */
  undoDepth: number;
  /** 当前可重做条目数量。 */
  redoDepth: number;
}

/** store 内部事件总线使用的 payload 映射。 */
type StoreEmitterEvents = Record<"snapshot" | "editor" | "history", unknown> & {
  /** 快照变更后的广播载荷。 */
  snapshot: {
    snapshot: EditorSnapshot;
    envelope: CommandEnvelope;
  };
  /** 标准编辑事件的广播载荷。 */
  editor: {
    event: EditorEvent;
    envelope: CommandEnvelope;
  };
  /** 撤销 / 重做历史状态变化的广播载荷。 */
  history: {
    historyState: EditorHistoryState;
    snapshot: EditorSnapshot;
    envelope: CommandEnvelope;
  };
};

export class EditorStore {
  /** 当前正在对外提供的编辑快照。 */
  private snapshot: EditorSnapshot;
  /** 最近的可撤销快照栈，栈顶是最新一条。 */
  private readonly historyPast: EditorSnapshot[] = [];
  /** 最近的可重做快照栈，栈顶是最近一次被撤销的快照。 */
  private readonly historyFuture: EditorSnapshot[] = [];
  /** store 内部统一事件总线。 */
  private readonly emitter: Emitter<StoreEmitterEvents> = mitt<StoreEmitterEvents>();

  constructor(document: CoursewareDocument = createCoursewareDocument()) {
    this.snapshot = createEditorSnapshot(document);
  }

  getSnapshot(): EditorSnapshot {
    return this.snapshot;
  }

  subscribe(listener: SnapshotListener): () => void {
    /** 统一通过 mitt 分发快照变化，避免多套订阅机制并存。 */
    const handleSnapshotChange = (payload: StoreEmitterEvents["snapshot"]) => {
      listener(payload.snapshot, payload.envelope);
    };

    this.emitter.on("snapshot", handleSnapshotChange);
    return () => this.emitter.off("snapshot", handleSnapshotChange);
  }

  subscribeEvent(listener: EditorEventListener): () => void {
    /** 标准编辑事件也改为走 mitt，总线层只保留一套订阅出口。 */
    const handleEditorEvent = (payload: StoreEmitterEvents["editor"]) => {
      listener(payload.event, payload.envelope);
    };

    this.emitter.on("editor", handleEditorEvent);
    return () => this.emitter.off("editor", handleEditorEvent);
  }

  subscribeHistoryState(listener: HistoryStateListener): () => void {
    /** 历史状态变化单独提供订阅入口，供 UI 精确监听撤销/重做按钮可用性。 */
    const handleHistoryStateChange = (payload: StoreEmitterEvents["history"]) => {
      listener(payload.historyState, payload.snapshot, payload.envelope);
    };

    this.emitter.on("history", handleHistoryStateChange);
    return () => this.emitter.off("history", handleHistoryStateChange);
  }

  getHistoryState(): EditorHistoryState {
    return {
      canUndo: this.historyPast.length > 0,
      canRedo: this.historyFuture.length > 0,
      undoDepth: this.historyPast.length,
      redoDepth: this.historyFuture.length,
    };
  }

  canUndo(): boolean {
    return this.historyPast.length > 0;
  }

  canRedo(): boolean {
    return this.historyFuture.length > 0;
  }

  dispatch(commandOrEnvelope: EditorCommand | CommandEnvelope): EditorSnapshot {
    const envelope = isCommandEnvelope(commandOrEnvelope)
      ? commandOrEnvelope
      : createCommandEnvelope(commandOrEnvelope, "system");

    if (envelope.command.type === "history.undo") {
      return this.dispatchUndo(envelope);
    }

    if (envelope.command.type === "history.redo") {
      return this.dispatchRedo(envelope);
    }

    const previousSnapshot = this.snapshot;
    const previousHistoryState = this.getHistoryState();
    const nextSnapshot = reduceSnapshot(previousSnapshot, envelope.command);

    if (nextSnapshot === previousSnapshot) {
      return previousSnapshot;
    }

    this.updateHistoryForCommand(previousSnapshot, envelope.command);
    this.commitSnapshot(previousSnapshot, nextSnapshot, envelope, previousHistoryState);
    return nextSnapshot;
  }

  /** 执行一次撤销。 */
  private dispatchUndo(envelope: CommandEnvelope): EditorSnapshot {
    const previousSnapshot = this.snapshot;
    const previousHistoryState = this.getHistoryState();
    const undoSnapshot = this.historyPast.pop();

    if (!undoSnapshot) {
      return previousSnapshot;
    }

    this.pushHistoryEntry(this.historyFuture, previousSnapshot);
    this.commitSnapshot(previousSnapshot, undoSnapshot, envelope, previousHistoryState);
    return undoSnapshot;
  }

  /** 执行一次重做。 */
  private dispatchRedo(envelope: CommandEnvelope): EditorSnapshot {
    const previousSnapshot = this.snapshot;
    const previousHistoryState = this.getHistoryState();
    const redoSnapshot = this.historyFuture.pop();

    if (!redoSnapshot) {
      return previousSnapshot;
    }

    this.pushHistoryEntry(this.historyPast, previousSnapshot);
    this.commitSnapshot(previousSnapshot, redoSnapshot, envelope, previousHistoryState);
    return redoSnapshot;
  }

  /** 根据命令类型维护历史栈。 */
  private updateHistoryForCommand(previousSnapshot: EditorSnapshot, command: EditorCommand): void {
    if (shouldResetHistory(command)) {
      this.clearHistory();
      return;
    }

    if (!shouldTrackHistoryCommand(command)) {
      return;
    }

    this.pushHistoryEntry(this.historyPast, previousSnapshot);
    this.historyFuture.length = 0;
  }

  /** 清空撤销与重做记录。 */
  private clearHistory(): void {
    this.historyPast.length = 0;
    this.historyFuture.length = 0;
  }

  /** 往指定历史栈压入一条快照，并控制最大长度。 */
  private pushHistoryEntry(stack: EditorSnapshot[], snapshot: EditorSnapshot): void {
    stack.push(snapshot);

    if (stack.length > MAX_HISTORY_ENTRIES) {
      stack.shift();
    }
  }

  /** 提交快照并按统一流程广播订阅事件。 */
  private commitSnapshot(
    previousSnapshot: EditorSnapshot,
    nextSnapshot: EditorSnapshot,
    envelope: CommandEnvelope,
    previousHistoryState: EditorHistoryState,
  ): void {
    this.snapshot = nextSnapshot;
    const nextHistoryState = this.getHistoryState();
    const events = createEditorEvents(previousSnapshot, nextSnapshot);
    this.emitter.emit("snapshot", {
      snapshot: nextSnapshot,
      envelope,
    });

    for (const event of events) {
      this.emitter.emit("editor", {
        event,
        envelope,
      });
    }

    /**
     * 历史状态变化与快照变化不是一回事。
     * 这里显式比较前后历史摘要，只在撤销/重做可用性真的变化时才广播，
     * 让 UI 可以稳定监听按钮状态，而不必再借助快照读取副作用。
     */
    if (!isHistoryStateEqual(previousHistoryState, nextHistoryState)) {
      this.emitter.emit("history", {
        historyState: nextHistoryState,
        snapshot: nextSnapshot,
        envelope,
      });
    }
  }
}

/** 判断命令是否会生成可撤销的历史记录。 */
function shouldTrackHistoryCommand(command: EditorCommand): boolean {
  switch (command.type) {
    case "slide.create":
    case "slide.update":
    case "slide.delete":
    case "slide.reorder":
    case "node.create":
    case "node.batch.update":
    case "node.update":
    case "node.image.set-as-background":
    case "node.batch.delete":
    case "node.delete":
    case "node.reorder":
    case "timeline.step.upsert":
    case "timeline.step.remove":
    case "timeline.step.reorder":
    case "timeline.animation.upsert":
    case "timeline.animation.remove":
      return true;
    default:
      return false;
  }
}

/** 判断命令是否需要重置历史栈。 */
function shouldResetHistory(command: EditorCommand): boolean {
  return command.type === "document.replace";
}

function isHistoryStateEqual(
  previousHistoryState: EditorHistoryState,
  nextHistoryState: EditorHistoryState,
): boolean {
  return (
    previousHistoryState.canUndo === nextHistoryState.canUndo &&
    previousHistoryState.canRedo === nextHistoryState.canRedo &&
    previousHistoryState.undoDepth === nextHistoryState.undoDepth &&
    previousHistoryState.redoDepth === nextHistoryState.redoDepth
  );
}

function createEditorEvents(
  previousSnapshot: EditorSnapshot,
  nextSnapshot: EditorSnapshot,
): EditorEvent[] {
  const events: EditorEvent[] = [];

  if (previousSnapshot.document !== nextSnapshot.document) {
    events.push({
      type: "document.changed",
      document: nextSnapshot.document,
      snapshot: nextSnapshot,
    });
  }

  if (previousSnapshot.activeSlideId !== nextSnapshot.activeSlideId) {
    events.push({
      type: "slide.active.changed",
      activeSlideId: nextSnapshot.activeSlideId,
      snapshot: nextSnapshot,
    });
  }

  if (!isSelectionEqual(previousSnapshot.selection, nextSnapshot.selection)) {
    events.push({
      type: "selection.changed",
      selection: nextSnapshot.selection,
      snapshot: nextSnapshot,
    });
  }

  if (!isPlaybackEqual(previousSnapshot.playback, nextSnapshot.playback)) {
    events.push({
      type: "playback.changed",
      playback: nextSnapshot.playback,
      snapshot: nextSnapshot,
    });
  }

  return events;
}

function isSelectionEqual(a: SelectionState, b: SelectionState): boolean {
  return (
    a.slideId === b.slideId &&
    a.nodeIds.length === b.nodeIds.length &&
    a.nodeIds.every((nodeId, index) => nodeId === b.nodeIds[index])
  );
}

function isPlaybackEqual(a: PlaybackState, b: PlaybackState): boolean {
  return a.slideId === b.slideId && a.stepIndex === b.stepIndex && a.status === b.status;
}

function isCommandEnvelope(value: EditorCommand | CommandEnvelope): value is CommandEnvelope {
  return "command" in value && "source" in value;
}
