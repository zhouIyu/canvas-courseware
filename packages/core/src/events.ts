import type {
  CoursewareDocument,
  EditorSnapshot,
  NodePatch,
  PlaybackState,
  SelectionState,
} from "./schema";

export type AdapterEvent =
  | AdapterReadyEvent
  | AdapterSelectionChangedEvent
  | AdapterNodeTranslatedEvent
  | AdapterNodesTranslatedEvent
  | AdapterNodeResizedEvent
  | AdapterNodeRotatedEvent
  | AdapterTextChangedEvent;

export interface AdapterReadyEvent {
  type: "adapter.ready";
  slideId: string;
}

export interface AdapterSelectionChangedEvent {
  type: "adapter.selection.changed";
  slideId: string;
  nodeIds: string[];
}

export interface AdapterNodeTranslatedEvent {
  type: "adapter.node.translated";
  slideId: string;
  nodeId: string;
  x: number;
  y: number;
}

/** 一次批量位移里的单个节点几何结果。 */
export interface AdapterNodeTranslation {
  /** 发生位移的节点 id。 */
  nodeId: string;
  /** 节点回写后的 X 坐标。 */
  x: number;
  /** 节点回写后的 Y 坐标。 */
  y: number;
}

/** 多选整体拖拽结束后，一次性上报所有节点的位移结果。 */
export interface AdapterNodesTranslatedEvent {
  type: "adapter.nodes.translated";
  slideId: string;
  updates: AdapterNodeTranslation[];
}

export interface AdapterNodeResizedEvent {
  type: "adapter.node.resized";
  slideId: string;
  nodeId: string;
  patch: Pick<NodePatch, "x" | "y" | "width" | "height">;
}

export interface AdapterNodeRotatedEvent {
  type: "adapter.node.rotated";
  slideId: string;
  nodeId: string;
  rotation: number;
}

export interface AdapterTextChangedEvent {
  type: "adapter.text.changed";
  slideId: string;
  nodeId: string;
  text: string;
}

export type EditorEvent =
  | DocumentChangedEvent
  | ActiveSlideChangedEvent
  | SelectionChangedEvent
  | PlaybackChangedEvent;

export interface DocumentChangedEvent {
  type: "document.changed";
  document: CoursewareDocument;
  snapshot: EditorSnapshot;
}

export interface ActiveSlideChangedEvent {
  type: "slide.active.changed";
  activeSlideId: string | null;
  snapshot: EditorSnapshot;
}

export interface SelectionChangedEvent {
  type: "selection.changed";
  selection: SelectionState;
  snapshot: EditorSnapshot;
}

export interface PlaybackChangedEvent {
  type: "playback.changed";
  playback: PlaybackState;
  snapshot: EditorSnapshot;
}

export interface EventMap {
  adapter: AdapterEvent;
  editor: EditorEvent;
}
