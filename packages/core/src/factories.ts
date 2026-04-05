import type { EditorCommand } from "./commands";
import type {
  CoursewareDocument,
  CoursewareNode,
  EditorSnapshot,
  ImageNode,
  NodeAnimation,
  RectNode,
  Slide,
  StepTrigger,
  TextNode,
  TimelineAction,
  TimelineStep,
} from "./schema";
import { COURSEWARE_SCHEMA_VERSION } from "./schema";

/** 文本节点默认使用的字体族，避免渲染层收到空字体值。 */
export const DEFAULT_TEXT_FONT_FAMILY =
  '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

export interface CreateDocumentOptions {
  id?: string;
  title?: string;
  description?: string;
  withInitialSlide?: boolean;
}

export interface CreateSlideOptions {
  id?: string;
  name?: string;
  width?: number;
  height?: number;
  backgroundFill?: string;
}

export interface CreateTextNodeOptions {
  id?: string;
  name?: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
}

export interface CreateImageNodeOptions {
  id?: string;
  name?: string;
  src?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface CreateRectNodeOptions {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
}

/** 创建时间轴动作时允许覆盖的字段。 */
export interface CreateTimelineActionOptions {
  /** 动作 id，未传时自动生成。 */
  id?: string;
  /** 动作类型，默认创建显示节点动作。 */
  type?: TimelineAction["type"];
  /** 目标节点 id，适用于显示或隐藏节点动作。 */
  targetId?: string;
  /** 关联动画 id，适用于显示节点或播放动画动作。 */
  animationId?: string;
}

/** 创建时间轴步骤时允许覆盖的字段。 */
export interface CreateTimelineStepOptions {
  /** 步骤 id，未传时自动生成。 */
  id?: string;
  /** 步骤名称。 */
  name?: string;
  /** 步骤触发方式。 */
  trigger?: StepTrigger;
  /** 步骤动作列表。 */
  actions?: TimelineAction[];
}

/** 创建节点动画时允许覆盖的字段。 */
export interface CreateNodeAnimationOptions {
  /** 动画 id，未传时自动生成。 */
  id?: string;
  /** 动画目标节点 id。 */
  targetId?: string;
  /** 动画类型。 */
  kind?: NodeAnimation["kind"];
  /** 动画时长。 */
  durationMs?: number;
  /** 动画延迟。 */
  delayMs?: number;
  /** 动画缓动函数。 */
  easing?: NodeAnimation["easing"];
  /** X 方向偏移。 */
  offsetX?: number;
  /** Y 方向偏移。 */
  offsetY?: number;
}

/** 复制 slide 时允许覆盖的字段。 */
export interface CloneSlideOptions {
  /** 复制后 slide 的 id。 */
  id?: string;
  /** 复制后 slide 的名称。 */
  name?: string;
}

export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createCoursewareDocument(
  options: CreateDocumentOptions = {},
): CoursewareDocument {
  const slides = options.withInitialSlide === false ? [] : [createSlide()];

  return {
    version: COURSEWARE_SCHEMA_VERSION,
    meta: {
      id: options.id ?? createId("document"),
      title: options.title ?? "Untitled Courseware",
      description: options.description,
    },
    slides,
  };
}

export function createSlide(options: CreateSlideOptions = {}): Slide {
  return {
    id: options.id ?? createId("slide"),
    name: options.name ?? "New Slide",
    size: {
      width: options.width ?? 1280,
      height: options.height ?? 720,
    },
    background: {
      fill: options.backgroundFill ?? "#FFFFFF",
    },
    nodes: [],
    timeline: {
      steps: [],
      animations: [],
    },
  };
}

export function createTextNode(options: CreateTextNodeOptions = {}): TextNode {
  return {
    id: options.id ?? createId("node"),
    type: "text",
    name: options.name ?? "Text",
    x: options.x ?? 120,
    y: options.y ?? 120,
    width: options.width ?? 320,
    height: options.height ?? 72,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    props: {
      text: options.text ?? "New Text",
      fontSize: options.fontSize ?? 32,
      color: options.color ?? "#172033",
      fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      lineHeight: 1.5,
      textAlign: "left",
    },
  };
}

export function createImageNode(options: CreateImageNodeOptions = {}): ImageNode {
  return {
    id: options.id ?? createId("node"),
    type: "image",
    name: options.name ?? "Image",
    x: options.x ?? 160,
    y: options.y ?? 160,
    width: options.width ?? 320,
    height: options.height ?? 220,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    props: {
      src: options.src ?? "",
      objectFit: "cover",
    },
  };
}

export function createRectNode(options: CreateRectNodeOptions = {}): RectNode {
  return {
    id: options.id ?? createId("node"),
    type: "rect",
    name: options.name ?? "Rectangle",
    x: options.x ?? 180,
    y: options.y ?? 180,
    width: options.width ?? 260,
    height: options.height ?? 180,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    props: {
      fill: options.fill ?? "#DCE8FF",
      stroke: "#4B7BE5",
      strokeWidth: 1,
      radius: 16,
    },
  };
}

/**
 * 创建一条标准化 timeline 动作。
 * 默认先生成显示节点动作，便于编辑器侧快速搭起 MVP 表单。
 */
export function createTimelineAction(
  options: CreateTimelineActionOptions = {},
): TimelineAction {
  const actionId = options.id ?? createId("action");

  switch (options.type) {
    case "hide-node":
      return {
        id: actionId,
        type: "hide-node",
        targetId: options.targetId ?? "",
      };
    case "play-animation":
      return {
        id: actionId,
        type: "play-animation",
        animationId: options.animationId ?? "",
      };
    case "show-node":
    default:
      return {
        id: actionId,
        type: "show-node",
        targetId: options.targetId ?? "",
        animationId: options.animationId,
      };
  }
}

/**
 * 创建一条标准化 timeline 步骤。
 * 这里保留空动作数组的能力，方便 UI 先创建步骤再逐条补动作。
 */
export function createTimelineStep(options: CreateTimelineStepOptions = {}): TimelineStep {
  return {
    id: options.id ?? createId("step"),
    name: options.name ?? "新步骤",
    trigger:
      options.trigger ??
      ({
        type: "page-click",
      } satisfies StepTrigger),
    actions: options.actions ? [...options.actions] : [],
  };
}

/**
 * 创建一条标准化节点动画资源。
 * 默认值优先匹配 MVP 已支持的动画和预览器表现。
 */
export function createNodeAnimation(
  options: CreateNodeAnimationOptions = {},
): NodeAnimation {
  return {
    id: options.id ?? createId("animation"),
    targetId: options.targetId ?? "",
    kind: options.kind ?? "fade",
    durationMs: options.durationMs ?? 320,
    delayMs: options.delayMs,
    easing: options.easing ?? "ease-out",
    offsetX: options.offsetX,
    offsetY: options.offsetY,
  };
}

export function createEditorSnapshot(document: CoursewareDocument): EditorSnapshot {
  const activeSlideId = document.slides[0]?.id ?? null;

  return {
    document,
    activeSlideId,
    selection: {
      slideId: activeSlideId,
      nodeIds: [],
    },
    playback: {
      slideId: activeSlideId,
      stepIndex: 0,
      status: "idle",
    },
  };
}

/** 复制一个 slide，并为内部节点、步骤、动作和动画重新生成 id。 */
export function cloneSlide(sourceSlide: Slide, options: CloneSlideOptions = {}): Slide {
  const nodeIdMap = new Map(
    sourceSlide.nodes.map((node) => [node.id, createId("node")] as const),
  );
  const animationIdMap = new Map(
    sourceSlide.timeline.animations.map((animation) => [animation.id, createId("animation")] as const),
  );

  return {
    id: options.id ?? createId("slide"),
    name: options.name ?? `${sourceSlide.name} 副本`,
    size: { ...sourceSlide.size },
    background: { ...sourceSlide.background },
    nodes: sourceSlide.nodes.map((node) => ({
      ...cloneNode(node),
      id: nodeIdMap.get(node.id) ?? node.id,
    })),
    timeline: {
      animations: sourceSlide.timeline.animations.map((animation) => ({
        ...animation,
        id: animationIdMap.get(animation.id) ?? animation.id,
        targetId: nodeIdMap.get(animation.targetId) ?? animation.targetId,
      })),
      steps: sourceSlide.timeline.steps.map((step) => ({
        ...step,
        id: createId("step"),
        trigger:
          step.trigger.type === "node-click"
            ? {
                ...step.trigger,
                targetId: nodeIdMap.get(step.trigger.targetId) ?? step.trigger.targetId,
              }
            : { ...step.trigger },
        actions: step.actions.map((action) => {
          switch (action.type) {
            case "hide-node":
              return {
                ...action,
                id: createId("action"),
                targetId: nodeIdMap.get(action.targetId) ?? action.targetId,
              };
            case "play-animation":
              return {
                ...action,
                id: createId("action"),
                animationId: animationIdMap.get(action.animationId) ?? action.animationId,
              };
            case "show-node":
            default:
              return {
                ...action,
                id: createId("action"),
                targetId: nodeIdMap.get(action.targetId) ?? action.targetId,
                animationId: action.animationId
                  ? animationIdMap.get(action.animationId) ?? action.animationId
                  : undefined,
              };
          }
        }),
      })),
    },
  };
}

export function cloneNode<TNode extends CoursewareNode>(node: TNode): TNode {
  return {
    ...node,
    props: { ...node.props },
  };
}

export function createCommandEnvelope(
  command: EditorCommand,
  source: "ui" | "adapter" | "system" = "system",
) {
  return {
    id: createId("command"),
    source,
    command,
  };
}
