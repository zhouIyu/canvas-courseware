export const COURSEWARE_SCHEMA_VERSION = "1.0.0";

export type CoursewareNodeType = "text" | "image" | "rect";
export type AnimationKind = "appear" | "fade" | "slide-up";
export type StepTriggerType = "page-click" | "auto" | "node-click";
export type TextAlign = "left" | "center" | "right";
export type ObjectFit = "fill" | "contain" | "cover";
export type EasingName = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface CoursewareDocument {
  version: string;
  meta: CoursewareMeta;
  slides: Slide[];
}

export interface CoursewareMeta {
  id: string;
  title: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Slide {
  id: string;
  name: string;
  size: SlideSize;
  background: SlideBackground;
  nodes: CoursewareNode[];
  timeline: SlideTimeline;
}

export interface SlideSize {
  width: number;
  height: number;
}

export interface SlideBackgroundImage {
  /** 背景图资源地址，可为远程 URL 或本地 data URL。 */
  src: string;
  /** 背景图的基础填充方式。 */
  fit: ObjectFit;
}

export interface SlideBackground {
  /** 页面背景底色，在背景图加载失败或留白区域时兜底显示。 */
  fill: string;
  /** 当前页面的背景图配置；为空时仅渲染纯色背景。 */
  image: SlideBackgroundImage | null;
}

export interface BaseNode<TType extends CoursewareNodeType, TProps> {
  id: string;
  type: TType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  props: TProps;
}

export interface TextNodeProps {
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: string;
  fontWeight?: string | number;
  lineHeight?: number;
  textAlign?: TextAlign;
}

export interface ImageNodeProps {
  src: string;
  alt?: string;
  objectFit?: ObjectFit;
}

export interface RectNodeProps {
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export type TextNode = BaseNode<"text", TextNodeProps>;
export type ImageNode = BaseNode<"image", ImageNodeProps>;
export type RectNode = BaseNode<"rect", RectNodeProps>;

export type CoursewareNode = TextNode | ImageNode | RectNode;

export interface SlideTimeline {
  steps: TimelineStep[];
  animations: NodeAnimation[];
}

export interface TimelineStep {
  id: string;
  name: string;
  trigger: StepTrigger;
  actions: TimelineAction[];
}

export type StepTrigger =
  | {
      type: "page-click";
    }
  | {
      type: "auto";
      delayMs: number;
    }
  | {
      type: "node-click";
      targetId: string;
    };

export type TimelineAction =
  | {
      id: string;
      type: "show-node";
      targetId: string;
      animationId?: string;
    }
  | {
      id: string;
      type: "hide-node";
      targetId: string;
    }
  | {
      id: string;
      type: "play-animation";
      animationId: string;
    };

export interface NodeAnimation {
  id: string;
  targetId: string;
  kind: AnimationKind;
  durationMs: number;
  delayMs?: number;
  easing?: EasingName;
  offsetX?: number;
  offsetY?: number;
}

export interface SelectionState {
  slideId: string | null;
  nodeIds: string[];
}

export interface PlaybackState {
  slideId: string | null;
  stepIndex: number;
  status: "idle" | "playing" | "paused" | "completed";
}

export interface EditorSnapshot {
  document: CoursewareDocument;
  activeSlideId: string | null;
  selection: SelectionState;
  playback: PlaybackState;
}

export interface NodeBasePatch {
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
}

export type NodePatch = NodeBasePatch & {
  props?: Partial<TextNodeProps> | Partial<ImageNodeProps> | Partial<RectNodeProps>;
};
