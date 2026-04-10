import { COMMAND_TYPES, type CommandEnvelope, type CommandSource, type EditorCommand } from "./commands";
import type { AdapterEvent } from "./events";
import type { CoursewareDocument, EditorSnapshot } from "./schema";
import { createCommandEnvelope, createCoursewareDocument } from "./factories";
import {
  type EditorEventListener,
  type HistoryStateListener,
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
        type: COMMAND_TYPES.DOCUMENT_REPLACE,
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
          type: COMMAND_TYPES.HISTORY_UNDO,
        },
        source,
      ),
    );
  }

  redo(source: CommandSource = "ui"): EditorSnapshot {
    return this.store.dispatch(
      createCommandEnvelope(
        {
          type: COMMAND_TYPES.HISTORY_REDO,
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

  /** 订阅撤销 / 重做历史状态变化，供 UI 直接刷新按钮可用性。 */
  subscribeHistoryState(listener: HistoryStateListener): () => void {
    return this.store.subscribeHistoryState(listener);
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
        type: COMMAND_TYPES.SELECTION_SET,
        slideId: event.slideId,
        nodeIds: event.nodeIds,
      };
    case "adapter.node.translated":
      return {
        type: COMMAND_TYPES.NODE_UPDATE,
        slideId: event.slideId,
        nodeId: event.nodeId,
        patch: {
          x: event.x,
          y: event.y,
        },
      };
    case "adapter.nodes.translated":
      return createTranslatedNodesCommand(event);
    case "adapter.node.resized":
      return {
        type: COMMAND_TYPES.NODE_UPDATE,
        slideId: event.slideId,
        nodeId: event.nodeId,
        patch: event.patch,
      };
    case "adapter.node.rotated":
      return {
        type: COMMAND_TYPES.NODE_UPDATE,
        slideId: event.slideId,
        nodeId: event.nodeId,
        patch: {
          rotation: event.rotation,
        },
      };
    case "adapter.text.editing.entered":
    case "adapter.text.editing.exited":
      return null;
    case "adapter.text.changed":
      return {
        type: COMMAND_TYPES.NODE_UPDATE,
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

/** 把适配层的批量拖拽结果收敛成一次标准批量更新命令。 */
function createTranslatedNodesCommand(
  event: Extract<AdapterEvent, { type: "adapter.nodes.translated" }>,
): EditorCommand {
  return {
    type: COMMAND_TYPES.NODE_BATCH_UPDATE,
    slideId: event.slideId,
    updates: event.updates.map((update) => ({
      nodeId: update.nodeId,
      patch: {
        x: update.x,
        y: update.y,
      },
    })),
  };
}
