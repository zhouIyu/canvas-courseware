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
