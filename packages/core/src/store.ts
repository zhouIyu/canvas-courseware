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

export type SnapshotListener = (
  snapshot: EditorSnapshot,
  envelope: CommandEnvelope,
) => void;

export type EditorEventListener = (
  event: EditorEvent,
  envelope: CommandEnvelope,
) => void;

export class EditorStore {
  private snapshot: EditorSnapshot;
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly eventListeners = new Set<EditorEventListener>();

  constructor(document: CoursewareDocument = createCoursewareDocument()) {
    this.snapshot = createEditorSnapshot(document);
  }

  getSnapshot(): EditorSnapshot {
    return this.snapshot;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  subscribeEvent(listener: EditorEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  dispatch(commandOrEnvelope: EditorCommand | CommandEnvelope): EditorSnapshot {
    const envelope = isCommandEnvelope(commandOrEnvelope)
      ? commandOrEnvelope
      : createCommandEnvelope(commandOrEnvelope, "system");
    const previousSnapshot = this.snapshot;
    const nextSnapshot = reduceSnapshot(previousSnapshot, envelope.command);

    if (nextSnapshot === previousSnapshot) {
      return previousSnapshot;
    }

    this.snapshot = nextSnapshot;
    const events = createEditorEvents(previousSnapshot, nextSnapshot);

    for (const listener of this.snapshotListeners) {
      listener(nextSnapshot, envelope);
    }

    for (const event of events) {
      for (const listener of this.eventListeners) {
        listener(event, envelope);
      }
    }

    return nextSnapshot;
  }
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
