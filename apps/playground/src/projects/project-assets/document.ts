import { parseCoursewareLocalAssetId, type CoursewareDocument, type Slide } from "@canvas-courseware/core";
import { normalizeProjectAssetSource } from "./shared";
import type {
  ProjectDocumentAssetContext,
  ProjectDocumentSourceTransformResult,
} from "./types";

/** 文档来源转换器，负责把某条图片来源改写成新的可持久化地址。 */
type ProjectAssetSourceTransformer = (
  context: ProjectDocumentAssetContext,
) => Promise<string>;

/** 单页背景来源改写后的结果。 */
interface SlideBackgroundRewriteResult {
  /** 改写后的背景配置。 */
  background: Slide["background"];
  /** 当前背景图是否发生了替换。 */
  rewrittenAssetCount: number;
}

/** 单页图片节点来源改写后的结果。 */
interface SlideNodeRewriteResult {
  /** 改写后的节点列表。 */
  nodes: Slide["nodes"];
  /** 当前节点来源被替换的数量。 */
  rewrittenAssetCount: number;
}

/** 单页所有图片来源改写后的结果。 */
interface SlideSourceRewriteResult {
  /** 改写后的 slide。 */
  slide: Slide;
  /** 当前 slide 中一共替换了多少条来源。 */
  rewrittenAssetCount: number;
}

/** 改写单页背景图来源。 */
async function rewriteSlideBackgroundSource(
  slide: Slide,
  transformSource: ProjectAssetSourceTransformer,
): Promise<SlideBackgroundRewriteResult> {
  if (!slide.background.image) {
    return {
      background: slide.background,
      rewrittenAssetCount: 0,
    };
  }

  const nextSource = await transformSource({
    slide,
    node: null,
    source: slide.background.image.src,
  });

  if (nextSource === slide.background.image.src) {
    return {
      background: slide.background,
      rewrittenAssetCount: 0,
    };
  }

  return {
    background: {
      ...slide.background,
      image: {
        ...slide.background.image,
        src: nextSource,
      },
    },
    rewrittenAssetCount: 1,
  };
}

/** 改写单页图片节点来源。 */
async function rewriteSlideNodeSources(
  slide: Slide,
  transformSource: ProjectAssetSourceTransformer,
): Promise<SlideNodeRewriteResult> {
  let rewrittenAssetCount = 0;

  const nodes = await Promise.all(
    slide.nodes.map(async (node) => {
      if (node.type !== "image") {
        return node;
      }

      const nextSource = await transformSource({
        slide,
        node,
        source: node.props.src,
      });

      if (nextSource === node.props.src) {
        return node;
      }

      rewrittenAssetCount += 1;
      return {
        ...node,
        props: {
          ...node.props,
          src: nextSource,
        },
      };
    }),
  );

  return {
    nodes,
    rewrittenAssetCount,
  };
}

/** 在存在来源变化时返回一份新的 slide，避免无谓创建新对象。 */
function cloneSlideWithUpdatedSources(
  slide: Slide,
  background: Slide["background"],
  nodes: Slide["nodes"],
): Slide {
  const didNodeChange = nodes.some((node, index) => node !== slide.nodes[index]);
  if (!didNodeChange && background === slide.background) {
    return slide;
  }

  return {
    ...slide,
    background,
    nodes,
  };
}

/** 改写单页 slide 中的背景图和图片节点来源。 */
async function rewriteSlideSources(
  slide: Slide,
  transformSource: ProjectAssetSourceTransformer,
): Promise<SlideSourceRewriteResult> {
  const [backgroundResult, nodeResult] = await Promise.all([
    rewriteSlideBackgroundSource(slide, transformSource),
    rewriteSlideNodeSources(slide, transformSource),
  ]);

  return {
    slide: cloneSlideWithUpdatedSources(slide, backgroundResult.background, nodeResult.nodes),
    rewrittenAssetCount:
      backgroundResult.rewrittenAssetCount + nodeResult.rewrittenAssetCount,
  };
}

/** 遍历文档里的节点图片与背景图来源，并按需执行来源替换。 */
export async function transformProjectDocumentSources(
  document: CoursewareDocument,
  transformSource: ProjectAssetSourceTransformer,
): Promise<ProjectDocumentSourceTransformResult> {
  const slideResults = await Promise.all(
    document.slides.map((slide) => rewriteSlideSources(slide, transformSource)),
  );
  const slides = slideResults.map((result) => result.slide);
  const rewrittenAssetCount = slideResults.reduce(
    (total, result) => total + result.rewrittenAssetCount,
    0,
  );
  const didSlideChange = slides.some((slide, index) => slide !== document.slides[index]);

  return {
    document: didSlideChange
      ? {
          ...document,
          slides,
        }
      : document,
    rewrittenAssetCount,
  };
}

/** 收集单页 slide 中引用到的全部本地资产 id。 */
function collectSlideAssetIds(slide: Slide, assetIds: Set<string>): void {
  const backgroundAssetId = parseCoursewareLocalAssetId(
    normalizeProjectAssetSource(slide.background.image?.src),
  );
  if (backgroundAssetId) {
    assetIds.add(backgroundAssetId);
  }

  for (const node of slide.nodes) {
    if (node.type !== "image") {
      continue;
    }

    const assetId = parseCoursewareLocalAssetId(
      normalizeProjectAssetSource(node.props.src),
    );
    if (assetId) {
      assetIds.add(assetId);
    }
  }
}

/** 从当前文档中收集全部本地资产 id，供保存 diff 与项目删除时复用。 */
export function collectProjectAssetIdsFromDocument(document: CoursewareDocument): string[] {
  const assetIds = new Set<string>();

  document.slides.forEach((slide) => {
    collectSlideAssetIds(slide, assetIds);
  });

  return Array.from(assetIds).sort();
}
