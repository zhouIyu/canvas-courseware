import { COURSEWARE_SCHEMA_VERSION } from "./schema";
import type {
  AnimationKind,
  CoursewareDocument,
  CoursewareNode,
  EasingName,
  ImageNode,
  ImageNodeProps,
  ObjectFit,
  RectNode,
  RectNodeProps,
  Slide,
  StepTrigger,
  TextAlign,
  TextNode,
  TextNodeProps,
  TimelineAction,
  TimelineStep,
} from "./schema";

/** 运行时解析过程中统一使用的未知对象类型。 */
type UnknownRecord = Record<string, unknown>;

/**
 * 把标准课件文档序列化成便于导出和检查的 JSON 字符串。
 * 当前统一使用两空格缩进，保证导出结果稳定且易读。
 */
export function serializeCoursewareDocument(document: CoursewareDocument): string {
  return JSON.stringify(document, null, 2);
}

/**
 * 从 JSON 字符串中解析一份标准课件文档。
 * 一旦结构不合法、引用不闭环或 schema 版本不匹配，就直接抛出错误。
 */
export function parseCoursewareDocument(serialized: string): CoursewareDocument {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("JSON 解析失败，请确认文件内容是合法的 JSON。");
  }

  return parseCoursewareDocumentData(parsedValue);
}

/**
 * 从任意运行时数据中校验并恢复一份标准课件文档。
 * 这个入口适合导入、测试以及本地存储恢复场景复用。
 */
export function parseCoursewareDocumentData(value: unknown): CoursewareDocument {
  const documentRecord = expectRecord(value, "document");
  const version = readString(documentRecord, "version", "document.version");

  if (version !== COURSEWARE_SCHEMA_VERSION) {
    throw new Error(
      `暂不支持 schema 版本 ${version}，当前仅支持 ${COURSEWARE_SCHEMA_VERSION}。`,
    );
  }

  const metaRecord = expectRecord(documentRecord.meta, "document.meta");
  const slides = readArray(documentRecord, "slides", "document.slides").map((slideValue, index) =>
    parseSlide(slideValue, `document.slides[${index}]`),
  );

  return {
    version,
    meta: {
      id: readString(metaRecord, "id", "document.meta.id"),
      title: readString(metaRecord, "title", "document.meta.title"),
      description: readOptionalString(metaRecord, "description", "document.meta.description"),
      createdAt: readOptionalString(metaRecord, "createdAt", "document.meta.createdAt"),
      updatedAt: readOptionalString(metaRecord, "updatedAt", "document.meta.updatedAt"),
    },
    slides,
  };
}

/**
 * 解析一页 slide，并在返回前完成节点、步骤和动画之间的交叉引用校验。
 * 这样预览器拿到文档时就不会再遇到明显的空引用问题。
 */
function parseSlide(value: unknown, path: string): Slide {
  const slideRecord = expectRecord(value, path);
  const sizeRecord = expectRecord(slideRecord.size, `${path}.size`);
  const nodes = readArray(slideRecord, "nodes", `${path}.nodes`).map((nodeValue, index) =>
    parseNode(nodeValue, `${path}.nodes[${index}]`),
  );
  const timelineRecord = expectRecord(slideRecord.timeline, `${path}.timeline`);
  const animations = readArray(
    timelineRecord,
    "animations",
    `${path}.timeline.animations`,
  ).map((animationValue, index) =>
    parseAnimation(animationValue, `${path}.timeline.animations[${index}]`),
  );
  const steps = readArray(timelineRecord, "steps", `${path}.timeline.steps`).map(
    (stepValue, index) =>
      parseStep(stepValue, `${path}.timeline.steps[${index}]`),
  );

  validateTimelineReferences(path, nodes, animations, steps);

  return {
    id: readString(slideRecord, "id", `${path}.id`),
    name: readString(slideRecord, "name", `${path}.name`),
    size: {
      width: readNumber(sizeRecord, "width", `${path}.size.width`, 1),
      height: readNumber(sizeRecord, "height", `${path}.size.height`, 1),
    },
    background: parseSlideBackground(slideRecord.background, `${path}.background`),
    nodes,
    timeline: {
      steps,
      animations,
    },
  };
}

/**
 * 解析 slide 背景配置。
 * 这里兼容旧文档里只有纯色 fill 的结构，并为新增背景图补齐默认填充方式。
 */
function parseSlideBackground(
  value: unknown,
  path: string,
): Slide["background"] {
  const backgroundRecord = expectRecord(value, path);
  const imageValue = backgroundRecord.image;
  const imageRecord =
    imageValue === undefined || imageValue === null ? null : expectRecord(imageValue, `${path}.image`);

  return {
    fill: readString(backgroundRecord, "fill", `${path}.fill`),
    image: imageRecord
      ? {
          src: readString(imageRecord, "src", `${path}.image.src`),
          fit:
            readOptionalEnum<ObjectFit>(imageRecord, "fit", `${path}.image.fit`, [
              "fill",
              "contain",
              "cover",
            ]) ?? "cover",
        }
      : null,
  };
}

/**
 * 根据节点类型解析具体节点结构。
 * 这里会把公共字段和类型专属字段分别校验，避免导入后进入半合法状态。
 */
function parseNode(value: unknown, path: string): CoursewareNode {
  const nodeRecord = expectRecord(value, path);
  const nodeType = readNodeType(nodeRecord, `${path}.type`);
  const baseNode = {
    id: readString(nodeRecord, "id", `${path}.id`),
    type: nodeType,
    name: readString(nodeRecord, "name", `${path}.name`),
    x: readNumber(nodeRecord, "x", `${path}.x`),
    y: readNumber(nodeRecord, "y", `${path}.y`),
    width: readNumber(nodeRecord, "width", `${path}.width`, 1),
    height: readNumber(nodeRecord, "height", `${path}.height`, 1),
    rotation: readNumber(nodeRecord, "rotation", `${path}.rotation`),
    opacity: readNumber(nodeRecord, "opacity", `${path}.opacity`, 0, 1),
    visible: readBoolean(nodeRecord, "visible", `${path}.visible`),
    locked: readBoolean(nodeRecord, "locked", `${path}.locked`),
  } as const;

  if (nodeType === "text") {
    return {
      ...baseNode,
      type: "text",
      props: parseTextNodeProps(nodeRecord.props, `${path}.props`),
    } satisfies TextNode;
  }

  if (nodeType === "image") {
    return {
      ...baseNode,
      type: "image",
      props: parseImageNodeProps(nodeRecord.props, `${path}.props`),
    } satisfies ImageNode;
  }

  return {
    ...baseNode,
    type: "rect",
    props: parseRectNodeProps(nodeRecord.props, `${path}.props`),
  } satisfies RectNode;
}

/**
 * 解析文本节点属性，重点保证字号、颜色和对齐方式都落在 MVP 支持范围内。
 */
function parseTextNodeProps(value: unknown, path: string): TextNodeProps {
  const propsRecord = expectRecord(value, path);

  return {
    text: readString(propsRecord, "text", `${path}.text`),
    fontSize: readNumber(propsRecord, "fontSize", `${path}.fontSize`, 1),
    color: readString(propsRecord, "color", `${path}.color`),
    fontFamily: readOptionalString(propsRecord, "fontFamily", `${path}.fontFamily`),
    fontWeight: readOptionalStringOrNumber(propsRecord, "fontWeight", `${path}.fontWeight`),
    lineHeight: readOptionalNumber(propsRecord, "lineHeight", `${path}.lineHeight`, 0),
    textAlign: readOptionalEnum<TextAlign>(
      propsRecord,
      "textAlign",
      `${path}.textAlign`,
      ["left", "center", "right"],
    ),
  };
}

/**
 * 解析图片节点属性，确保 `src` 和 `objectFit` 至少满足 MVP 的最低约束。
 */
function parseImageNodeProps(value: unknown, path: string): ImageNodeProps {
  const propsRecord = expectRecord(value, path);

  return {
    src: readString(propsRecord, "src", `${path}.src`),
    alt: readOptionalString(propsRecord, "alt", `${path}.alt`),
    objectFit: readOptionalEnum<ObjectFit>(
      propsRecord,
      "objectFit",
      `${path}.objectFit`,
      ["fill", "contain", "cover"],
    ),
  };
}

/**
 * 解析矩形节点属性，限制描边宽度和圆角不能出现负数。
 */
function parseRectNodeProps(value: unknown, path: string): RectNodeProps {
  const propsRecord = expectRecord(value, path);

  return {
    fill: readString(propsRecord, "fill", `${path}.fill`),
    stroke: readOptionalString(propsRecord, "stroke", `${path}.stroke`),
    strokeWidth: readOptionalNumber(propsRecord, "strokeWidth", `${path}.strokeWidth`, 0),
    radius: readOptionalNumber(propsRecord, "radius", `${path}.radius`, 0),
  };
}

/**
 * 解析单条时间轴步骤，包含步骤名、触发器和动作列表。
 */
function parseStep(value: unknown, path: string): TimelineStep {
  const stepRecord = expectRecord(value, path);
  const trigger = parseStepTrigger(stepRecord.trigger, `${path}.trigger`);
  const actions = readArray(stepRecord, "actions", `${path}.actions`).map((actionValue, index) =>
    parseTimelineAction(actionValue, `${path}.actions[${index}]`),
  );

  return {
    id: readString(stepRecord, "id", `${path}.id`),
    name: readString(stepRecord, "name", `${path}.name`),
    trigger,
    actions,
  };
}

/**
 * 解析步骤触发器，兼容历史 `click` 写法，并支持 page-click / auto / node-click。
 */
function parseStepTrigger(value: unknown, path: string): StepTrigger {
  const triggerRecord = expectRecord(value, path);
  const triggerType = readEnum<StepTrigger["type"] | "click">(
    triggerRecord,
    "type",
    `${path}.type`,
    ["page-click", "auto", "node-click", "click"],
  );

  if (triggerType === "page-click" || triggerType === "click") {
    return {
      type: "page-click",
    };
  }

  if (triggerType === "node-click") {
    return {
      type: "node-click",
      targetId: readString(triggerRecord, "targetId", `${path}.targetId`),
    };
  }

  return {
    type: "auto",
    delayMs: readNumber(triggerRecord, "delayMs", `${path}.delayMs`, 0),
  };
}

/**
 * 解析一条时间轴动作，并按照 union 结构分别读取目标字段。
 */
function parseTimelineAction(value: unknown, path: string): TimelineAction {
  const actionRecord = expectRecord(value, path);
  const actionType = readEnum<TimelineAction["type"]>(
    actionRecord,
    "type",
    `${path}.type`,
    ["show-node", "hide-node", "play-animation"],
  );
  const actionId = readString(actionRecord, "id", `${path}.id`);

  if (actionType === "hide-node") {
    return {
      id: actionId,
      type: "hide-node",
      targetId: readString(actionRecord, "targetId", `${path}.targetId`),
    };
  }

  if (actionType === "play-animation") {
    return {
      id: actionId,
      type: "play-animation",
      animationId: readString(actionRecord, "animationId", `${path}.animationId`),
    };
  }

  return {
    id: actionId,
    type: "show-node",
    targetId: readString(actionRecord, "targetId", `${path}.targetId`),
    animationId: readOptionalString(actionRecord, "animationId", `${path}.animationId`),
  };
}

/**
 * 解析一条动画资源，并限制动画种类、缓动和数值字段都在支持范围内。
 */
function parseAnimation(
  value: unknown,
  path: string,
): Slide["timeline"]["animations"][number] {
  const animationRecord = expectRecord(value, path);

  return {
    id: readString(animationRecord, "id", `${path}.id`),
    targetId: readString(animationRecord, "targetId", `${path}.targetId`),
    kind: readEnum<AnimationKind>(animationRecord, "kind", `${path}.kind`, [
      "appear",
      "fade",
      "slide-up",
    ]),
    durationMs: readNumber(animationRecord, "durationMs", `${path}.durationMs`, 0),
    delayMs: readOptionalNumber(animationRecord, "delayMs", `${path}.delayMs`, 0),
    easing: readOptionalEnum<EasingName>(animationRecord, "easing", `${path}.easing`, [
      "linear",
      "ease-in",
      "ease-out",
      "ease-in-out",
    ]),
    offsetX: readOptionalNumber(animationRecord, "offsetX", `${path}.offsetX`),
    offsetY: readOptionalNumber(animationRecord, "offsetY", `${path}.offsetY`),
  };
}

/**
 * 校验一个 slide 内部的 timeline 引用是否闭环。
 * 这里会覆盖节点目标、动画引用以及 show-node 与动画目标是否一致。
 */
function validateTimelineReferences(
  path: string,
  nodes: CoursewareNode[],
  animations: Slide["timeline"]["animations"],
  steps: TimelineStep[],
): void {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const animationMap = new Map(animations.map((animation) => [animation.id, animation]));

  for (const animation of animations) {
    if (!nodeIds.has(animation.targetId)) {
      throw new Error(
        `${path}.timeline.animations 中的动画 ${animation.id} 指向了不存在的节点 ${animation.targetId}。`,
      );
    }
  }

  for (const step of steps) {
    for (const action of step.actions) {
      if (action.type === "show-node" || action.type === "hide-node") {
        if (!nodeIds.has(action.targetId)) {
          throw new Error(
            `${path}.timeline.steps 中的动作 ${action.id} 指向了不存在的节点 ${action.targetId}。`,
          );
        }
      }

      if (action.type === "show-node" && action.animationId) {
        const matchedAnimation = animationMap.get(action.animationId);

        if (!matchedAnimation) {
          throw new Error(
            `${path}.timeline.steps 中的动作 ${action.id} 引用了不存在的动画 ${action.animationId}。`,
          );
        }

        if (matchedAnimation.targetId !== action.targetId) {
          throw new Error(
            `${path}.timeline.steps 中的动作 ${action.id} 与动画 ${action.animationId} 的目标节点不一致。`,
          );
        }
      }

      if (action.type === "play-animation" && !animationMap.has(action.animationId)) {
        throw new Error(
          `${path}.timeline.steps 中的动作 ${action.id} 引用了不存在的动画 ${action.animationId}。`,
        );
      }
    }

    if (step.trigger.type === "node-click" && !nodeIds.has(step.trigger.targetId)) {
      throw new Error(
        `${path}.timeline.steps 中的步骤 ${step.id} 配置了不存在的触发对象 ${step.trigger.targetId}。`,
      );
    }
  }
}

/**
 * 读取并断言某个值是普通对象。
 * 只要拿到数组、null 或基础类型，都会直接抛出路径明确的错误。
 */
function expectRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} 必须是一个对象。`);
  }

  return value as UnknownRecord;
}

/**
 * 读取并断言某个字段是数组。
 * 这个帮助函数让数组路径的错误提示更稳定，也方便统一 map 校验。
 */
function readArray(
  value: UnknownRecord,
  key: string,
  path: string,
): unknown[] {
  const targetValue = value[key];

  if (!Array.isArray(targetValue)) {
    throw new Error(`${path} 必须是一个数组。`);
  }

  return targetValue;
}

/**
 * 读取并断言某个字段是字符串。
 * 字符串允许为空，但不允许缺失、null 或其他基础类型。
 */
function readString(
  value: UnknownRecord,
  key: string,
  path: string,
): string {
  const targetValue = value[key];

  if (typeof targetValue !== "string") {
    throw new Error(`${path} 必须是字符串。`);
  }

  return targetValue;
}

/**
 * 读取一个可选字符串字段。
 * 如果字段不存在则返回 `undefined`，否则仍然要求它是字符串。
 */
function readOptionalString(
  value: UnknownRecord,
  key: string,
  path: string,
): string | undefined {
  const targetValue = value[key];

  if (targetValue === undefined) {
    return undefined;
  }

  if (typeof targetValue !== "string") {
    throw new Error(`${path} 必须是字符串。`);
  }

  return targetValue;
}

/**
 * 读取一个可选的字符串或数字字段。
 * 该逻辑主要给文本节点的 `fontWeight` 这类宽松字段使用。
 */
function readOptionalStringOrNumber(
  value: UnknownRecord,
  key: string,
  path: string,
): string | number | undefined {
  const targetValue = value[key];

  if (targetValue === undefined) {
    return undefined;
  }

  if (typeof targetValue !== "string" && typeof targetValue !== "number") {
    throw new Error(`${path} 必须是字符串或数字。`);
  }

  return targetValue;
}

/**
 * 读取并断言某个字段是有限数字。
 * 可选地支持最小值和最大值限制，避免尺寸、透明度之类的字段越界。
 */
function readNumber(
  value: UnknownRecord,
  key: string,
  path: string,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number {
  const targetValue = value[key];

  if (typeof targetValue !== "number" || !Number.isFinite(targetValue)) {
    throw new Error(`${path} 必须是有限数字。`);
  }

  if (targetValue < minimum || targetValue > maximum) {
    throw new Error(`${path} 必须在 ${minimum} 到 ${maximum} 之间。`);
  }

  return targetValue;
}

/**
 * 读取一个可选数字字段。
 * 字段不存在时直接返回 `undefined`，存在时继续复用统一的数值边界校验。
 */
function readOptionalNumber(
  value: UnknownRecord,
  key: string,
  path: string,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
): number | undefined {
  if (value[key] === undefined) {
    return undefined;
  }

  return readNumber(value, key, path, minimum, maximum);
}

/**
 * 读取并断言某个字段是布尔值。
 * 这个方法主要用于节点的可见和锁定状态字段。
 */
function readBoolean(
  value: UnknownRecord,
  key: string,
  path: string,
): boolean {
  const targetValue = value[key];

  if (typeof targetValue !== "boolean") {
    throw new Error(`${path} 必须是布尔值。`);
  }

  return targetValue;
}

/**
 * 读取并断言某个字段属于指定枚举值集合。
 * 这样可以把 union 类型的运行时校验集中到一处维护。
 */
function readEnum<TValue extends string>(
  value: UnknownRecord,
  key: string,
  path: string,
  allowedValues: readonly TValue[],
): TValue {
  const targetValue = value[key];

  if (typeof targetValue !== "string" || !allowedValues.includes(targetValue as TValue)) {
    throw new Error(`${path} 必须是 ${allowedValues.join(" / ")} 之一。`);
  }

  return targetValue as TValue;
}

/**
 * 读取一个可选枚举字段。
 * 缺失时返回 `undefined`，存在时仍然执行与必填字段相同的合法性校验。
 */
function readOptionalEnum<TValue extends string>(
  value: UnknownRecord,
  key: string,
  path: string,
  allowedValues: readonly TValue[],
): TValue | undefined {
  if (value[key] === undefined) {
    return undefined;
  }

  return readEnum(value, key, path, allowedValues);
}

/**
 * 单独读取节点类型，方便节点分支解析之前先完成一次基础约束。
 */
function readNodeType(
  value: UnknownRecord,
  path: string,
): CoursewareNode["type"] {
  return readEnum<CoursewareNode["type"]>(
    value,
    "type",
    path,
    ["text", "image", "rect"],
  );
}
