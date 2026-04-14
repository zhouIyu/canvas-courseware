import { COURSEWARE_SCHEMA_VERSION } from "../schema";
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
  TextFontStyle,
  TextNode,
  TextNodeProps,
  TimelineAction,
  TimelineStep,
} from "../schema";
import {
  expectRecord,
  readArray,
  readBoolean,
  readEnum,
  readNodeType,
  readNumber,
  readOptionalEnum,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringOrNumber,
  readString,
} from "./shared";

/**
 * 把 JSON 字符串解析成原始运行时数据。
 * 这层只处理 JSON 语法本身，不负责 schema 迁移和业务结构校验。
 */
export function parseCoursewareDocumentJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("JSON 解析失败，请确认文件内容是合法的 JSON。");
  }
}

/**
 * 按当前 schema 结构恢复一份课件文档。
 * 这里假定版本迁移已完成，因此只接受当前 `COURSEWARE_SCHEMA_VERSION`。
 */
export function parseCurrentCoursewareDocumentData(value: unknown): CoursewareDocument {
  const documentRecord = expectRecord(value, "document");
  const version = readString(documentRecord, "version", "document.version");

  if (version !== COURSEWARE_SCHEMA_VERSION) {
    throw new Error(
      `schema 迁移结果版本异常，期望 ${COURSEWARE_SCHEMA_VERSION}，实际为 ${version}。`,
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
 * 解析一页 slide 的静态结构。
 * 这里只恢复字段本身，不负责跨节点和时间轴的引用闭环校验。
 */
function parseSlide(value: unknown, path: string): Slide {
  const slideRecord = expectRecord(value, path);
  const sizeRecord = expectRecord(slideRecord.size, `${path}.size`);
  const timelineRecord = expectRecord(slideRecord.timeline, `${path}.timeline`);

  return {
    id: readString(slideRecord, "id", `${path}.id`),
    name: readString(slideRecord, "name", `${path}.name`),
    size: {
      width: readNumber(sizeRecord, "width", `${path}.size.width`, 1),
      height: readNumber(sizeRecord, "height", `${path}.size.height`, 1),
    },
    background: parseSlideBackground(slideRecord.background, `${path}.background`),
    nodes: readArray(slideRecord, "nodes", `${path}.nodes`).map((nodeValue, index) =>
      parseNode(nodeValue, `${path}.nodes[${index}]`),
    ),
    timeline: {
      steps: readArray(timelineRecord, "steps", `${path}.timeline.steps`).map((stepValue, index) =>
        parseStep(stepValue, `${path}.timeline.steps[${index}]`),
      ),
      animations: readArray(
        timelineRecord,
        "animations",
        `${path}.timeline.animations`,
      ).map((animationValue, index) =>
        parseAnimation(animationValue, `${path}.timeline.animations[${index}]`),
      ),
    },
  };
}

/**
 * 解析 slide 背景配置。
 * 这里兼容旧文档里只有纯色 `fill` 的结构，并为背景图补齐默认填充方式。
 */
function parseSlideBackground(value: unknown, path: string): Slide["background"] {
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
    fontStyle: readOptionalEnum<TextFontStyle>(
      propsRecord,
      "fontStyle",
      `${path}.fontStyle`,
      ["normal", "italic"],
    ),
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

  return {
    id: readString(stepRecord, "id", `${path}.id`),
    name: readString(stepRecord, "name", `${path}.name`),
    trigger: parseStepTrigger(stepRecord.trigger, `${path}.trigger`),
    actions: readArray(stepRecord, "actions", `${path}.actions`).map((actionValue, index) =>
      parseTimelineAction(actionValue, `${path}.actions[${index}]`),
    ),
  };
}

/**
 * 解析步骤触发器，兼容历史 `click` 写法，并支持 `page-click` / `auto` / `node-click`。
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
function parseAnimation(value: unknown, path: string): Slide["timeline"]["animations"][number] {
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
