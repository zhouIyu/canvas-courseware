import type { CommandEnvelope, CommandSource, EditorCommand } from "./commands";
import type { AdapterEvent } from "./events";
import type { CoursewareDocument, EditorSnapshot } from "./schema";
import { createCommandEnvelope, createCoursewareDocument } from "./factories";
import {
  type EditorEventListener,
  type EditorHistoryState,
  EditorStore,
  type SnapshotListener,
} from "./store";

export type AdapterEventListener = (event: AdapterEvent) => void;

export class EditorController {
  private readonly adapterListeners = new Set<AdapterEventListener>();

  constructor(
    private readonly store: EditorStore = new EditorStore(createCoursewareDocument()),
  ) {}

  getSnapshot(): EditorSnapshot {
    return this.store.getSnapshot();
  }

  replaceDocument(document: CoursewareDocument): EditorSnapshot {
    return this.execute(
      {
        type: "document.replace",
        document,
      },
      "system",
    );
  }

  execute(command: EditorCommand, source: CommandSource = "ui"): EditorSnapshot {
    return this.store.dispatch(createCommandEnvelope(command, source));
  }

  undo(source: CommandSource = "ui"): EditorSnapshot {
    return this.store.dispatch(
      createCommandEnvelope(
        {
          type: "history.undo",
        },
        source,
      ),
    );
  }

  redo(source: CommandSource = "ui"): EditorSnapshot {
    return this.store.dispatch(
      createCommandEnvelope(
        {
          type: "history.redo",
        },
        source,
      ),
    );
  }

  canUndo(): boolean {
    return this.store.canUndo();
  }

  canRedo(): boolean {
    return this.store.canRedo();
  }

  getHistoryState(): EditorHistoryState {
    return this.store.getHistoryState();
  }

  dispatchEnvelope(envelope: CommandEnvelope): EditorSnapshot {
    return this.store.dispatch(envelope);
  }

  handleAdapterEvent(event: AdapterEvent): EditorSnapshot {
    for (const listener of this.adapterListeners) {
      listener(event);
    }

    const command = mapAdapterEventToCommand(event);
    return command ? this.execute(command, "adapter") : this.getSnapshot();
  }

  subscribe(listener: SnapshotListener): () => void {
    return this.store.subscribe(listener);
  }

  subscribeEditorEvent(listener: EditorEventListener): () => void {
    return this.store.subscribeEvent(listener);
  }

  subscribeAdapterEvent(listener: AdapterEventListener): () => void {
    this.adapterListeners.add(listener);
    return () => this.adapterListeners.delete(listener);
  }
}

export function mapAdapterEventToCommand(event: AdapterEvent): EditorCommand | null {
  switch (event.type) {
    case "adapter.ready":
      return null;
    case "adapter.selection.changed":
      return {
        type: "selection.set",
        slideId: event.slideId,
        nodeIds: event.nodeIds,
      };
    case "adapter.node.translated":
      return {
        type: "node.update",
        slideId: event.slideId,
        nodeId: event.nodeId,
        patch: {
          x: event.x,
          y: event.y,
        },
      };
    case "adapter.node.resized":
      return {
        type: "node.update",
        slideId: event.slideId,
        nodeId: event.nodeId,
        patch: event.patch,
      };
    case "adapter.node.rotated":
      return {
        type: "node.update",
        slideId: event.slideId,
        nodeId: event.nodeId,
        patch: {
          rotation: event.rotation,
        },
      };
    case "adapter.text.changed":
      return {
        type: "node.update",
        slideId: event.slideId,
        nodeId: event.nodeId,
        patch: {
          props: {
            text: event.text,
          },
        },
      };
    default:
      return null;
  }
}
