import {
  createCoursewareDocument,
  createId,
  createImageNode,
  createRectNode,
  createSlide,
  createTextNode,
  type CoursewareDocument,
} from "@canvas-courseware/core";
import type { ProjectRecord } from "./types";

/** 生成项目更新时间字符串。 */
function createUpdatedAt(): string {
  return new Date().toISOString();
}

/** 从文档中提取首版缩略图占位。 */
function resolveProjectThumbnail(document: CoursewareDocument): string | null {
  return document.slides[0]?.background.fill ?? null;
}

/** 用一份文档创建可持久化项目记录。 */
export function createProjectRecordFromDocument(
  document: CoursewareDocument,
  title: string,
  id = document.meta.id,
): ProjectRecord {
  return {
    id,
    title,
    updatedAt: createUpdatedAt(),
    thumbnail: resolveProjectThumbnail(document),
    document: {
      ...document,
      meta: {
        ...document.meta,
        id,
        title,
      },
    },
  };
}

/** 构造首个示例项目使用的课件文档。 */
export function createDemoDocument(title = "古诗讲解示例"): CoursewareDocument {
  /** 示例文档的根节点。 */
  const documentModel = createCoursewareDocument({
    title,
  });

  /** 首页用来展示封面和逐步播放体验。 */
  const coverSlide = documentModel.slides[0];
  coverSlide.name = "课程封面";
  coverSlide.background.fill = "#FFFFFF";

  /** 封面标题。 */
  const heroTitle = createTextNode({
    name: "Course Title",
    text: "送杜少府之任蜀州",
    x: 176,
    y: 104,
    width: 480,
    fontSize: 42,
    color: "#6B4D2E",
  });

  /** 作者信息。 */
  const authorText = createTextNode({
    name: "Author Name",
    text: "唐 · 王勃",
    x: 304,
    y: 168,
    width: 220,
    fontSize: 24,
    color: "#9A6B44",
  });

  /** 卷轴卡片。 */
  const poemCard = createRectNode({
    name: "Poem Card",
    x: 144,
    y: 232,
    width: 548,
    height: 338,
    fill: "#FFF9ED",
  });
  poemCard.props.stroke = "#D6B489";
  poemCard.props.strokeWidth = 2;
  poemCard.props.radius = 28;

  /** 诗句内容。 */
  const poemBody = createTextNode({
    name: "Poem Body",
    text: "城阙辅三秦，风烟望五津。\n与君离别意，同是宦游人。\n海内存知己，天涯若比邻。\n无为在歧路，儿女共沾巾。",
    x: 214,
    y: 292,
    width: 414,
    height: 242,
    fontSize: 28,
    color: "#7E5834",
  });
  poemBody.props.lineHeight = 1.9;
  poemBody.visible = false;

  /** 右侧语音按钮占位。 */
  const voiceButton = createImageNode({
    name: "Voice Button",
    x: 870,
    y: 258,
    width: 96,
    height: 96,
    src: "",
  });
  voiceButton.visible = false;

  /** 诗句淡入动画。 */
  const poemAnimationId = createId("animation");

  /** 按钮上滑动画。 */
  const voiceAnimationId = createId("animation");

  coverSlide.nodes.push(heroTitle, authorText, poemCard, poemBody, voiceButton);
  coverSlide.timeline.animations.push(
    {
      id: poemAnimationId,
      targetId: poemBody.id,
      kind: "fade",
      durationMs: 320,
      easing: "ease-out",
    },
    {
      id: voiceAnimationId,
      targetId: voiceButton.id,
      kind: "slide-up",
      durationMs: 360,
      easing: "ease-out",
      offsetY: 28,
    },
  );
  coverSlide.timeline.steps.push(
    {
      id: createId("step"),
      name: "展示诗句内容",
      trigger: {
        type: "page-click",
      },
      actions: [
        {
          id: createId("action"),
          type: "show-node",
          targetId: poemBody.id,
          animationId: poemAnimationId,
        },
      ],
    },
    {
      id: createId("step"),
      name: "展示语音按钮",
      trigger: {
        type: "auto",
        delayMs: 900,
      },
      actions: [
        {
          id: createId("action"),
          type: "show-node",
          targetId: voiceButton.id,
          animationId: voiceAnimationId,
        },
      ],
    },
  );

  /** 第二页用于展示流程说明。 */
  const processSlide = createSlide({
    name: "教学流程",
    backgroundFill: "#F8FAFC",
  });

  /** 流程页标题。 */
  const processTitle = createTextNode({
    name: "Process Title",
    text: "教学流程拆解",
    x: 110,
    y: 96,
    width: 340,
    fontSize: 40,
    color: "#134E4A",
  });

  /** 流程页卡片。 */
  const processCard = createRectNode({
    name: "Process Card",
    x: 110,
    y: 190,
    width: 560,
    height: 280,
    fill: "#FFFFFF",
  });
  processCard.props.stroke = "#CBD5E1";
  processCard.props.strokeWidth = 2;
  processCard.props.radius = 28;

  /** 流程说明。 */
  const processHint = createTextNode({
    name: "Process Hint",
    text: "点击继续后，再通过自动步骤补齐讲解节奏。",
    x: 154,
    y: 264,
    width: 420,
    fontSize: 24,
    color: "#0F766E",
  });
  processHint.visible = false;

  /** 流程说明动画。 */
  const processHintAnimationId = createId("animation");

  processSlide.nodes.push(processTitle, processCard, processHint);
  processSlide.timeline.animations.push({
    id: processHintAnimationId,
    targetId: processHint.id,
    kind: "fade",
    durationMs: 260,
    easing: "ease-out",
  });
  processSlide.timeline.steps.push({
    id: createId("step"),
    name: "显示流程提示",
    trigger: {
      type: "page-click",
    },
    actions: [
      {
        id: createId("action"),
        type: "show-node",
        targetId: processHint.id,
        animationId: processHintAnimationId,
      },
    ],
  });

  documentModel.slides.push(processSlide);
  return documentModel;
}

/** 创建一个首屏示例项目。 */
export function createDemoProjectRecord(): ProjectRecord {
  return createProjectRecordFromDocument(createDemoDocument(), "古诗讲解示例");
}

/** 创建一个新的空白项目。 */
export function createBlankProjectRecord(title = "未命名课件"): ProjectRecord {
  /** 新项目的基础文档。 */
  const documentModel = createCoursewareDocument({
    title,
  });

  /** 首个页面默认也使用产品化命名。 */
  const firstSlide = documentModel.slides[0];
  if (firstSlide) {
    firstSlide.name = "第1页";
    firstSlide.background.fill = "#FFFFFF";
  }

  return createProjectRecordFromDocument(documentModel, title);
}
