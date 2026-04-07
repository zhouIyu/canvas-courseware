import type { CoursewareDocument } from "@canvas-courseware/core";
import type { ProjectSlideThumbnailMap } from "./types";

/** 项目卡片在没有真实截图时使用的默认渐变背景。 */
export const DEFAULT_PROJECT_THUMBNAIL_BACKGROUND = "linear-gradient(135deg, #CCFBF1, #FFFFFF)";

/** 判断一段缩略图字符串是否为可直接渲染的图片资源。 */
export function isImageThumbnailSource(thumbnail: string | null | undefined): thumbnail is string {
  if (!thumbnail) {
    return false;
  }

  return /^(data:image\/|blob:|https?:\/\/)/.test(thumbnail);
}

/** 只保留当前文档中仍然存在的 slide 缩略图，避免删除页面后残留脏数据。 */
export function sanitizeProjectSlideThumbnails(
  document: CoursewareDocument,
  slideThumbnails?: ProjectSlideThumbnailMap | null,
): ProjectSlideThumbnailMap {
  const sanitizedMap: ProjectSlideThumbnailMap = {};

  for (const slide of document.slides) {
    const thumbnail = slideThumbnails?.[slide.id];
    if (typeof thumbnail === "string" && thumbnail.trim()) {
      sanitizedMap[slide.id] = thumbnail;
    }
  }

  return sanitizedMap;
}

/** 优先返回首页真实截图，没有截图时再回退到首页背景色。 */
export function resolveProjectPrimaryThumbnail(
  document: CoursewareDocument,
  slideThumbnails: ProjectSlideThumbnailMap,
): string | null {
  const firstSlide = document.slides[0];
  if (!firstSlide) {
    return null;
  }

  return slideThumbnails[firstSlide.id] ?? firstSlide.background.fill ?? null;
}

/** 生成项目列表封面可直接复用的背景样式。 */
export function createProjectThumbnailStyle(thumbnail: string | null): Record<string, string> {
  if (!thumbnail) {
    return {
      background: DEFAULT_PROJECT_THUMBNAIL_BACKGROUND,
    };
  }

  if (!isImageThumbnailSource(thumbnail)) {
    return {
      background: thumbnail,
    };
  }

  return {
    backgroundColor: "#FFFFFF",
    backgroundImage: `url(${JSON.stringify(thumbnail)})`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  };
}
