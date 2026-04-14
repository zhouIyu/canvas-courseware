import type { CoursewareDocument } from "@canvas-courseware/core";
import { resolveProjectPrimaryThumbnail, sanitizeProjectSlideThumbnails } from "../../projects/project-thumbnails";
import type { ProjectRecord, ProjectSlideThumbnailMap } from "../../projects/types";

/** 编辑器切页前抛给应用层的缩略图截图结果。 */
export interface SlideThumbnailCapturedPayload {
  /** 已完成截图的 slide id。 */
  slideId: string;
  /** 当前 slide 对应的缩略图 data URL。 */
  thumbnail: string;
}

/** 构建项目记录时需要的最小上下文。 */
export interface BuildProjectWorkspaceRecordOptions {
  /** 当前项目 id。 */
  projectId: string;
  /** 当前工作台标题。 */
  projectTitle: string;
  /** 当前课件文档。 */
  documentModel: CoursewareDocument | null | undefined;
  /** 当前工作台维护的页面缩略图缓存。 */
  slideThumbnails: ProjectSlideThumbnailMap;
}

/** 把当前页面状态拼成一条可保存的项目记录。 */
export function buildProjectWorkspaceRecord(
  options: BuildProjectWorkspaceRecordOptions,
): ProjectRecord | null {
  if (!options.documentModel || !options.projectId) {
    return null;
  }

  const normalizedTitle = options.projectTitle.trim() || "未命名课件";
  const normalizedSlideThumbnails = sanitizeProjectSlideThumbnails(
    options.documentModel,
    options.slideThumbnails,
  );

  return {
    id: options.projectId,
    title: normalizedTitle,
    updatedAt: new Date().toISOString(),
    thumbnail: resolveProjectPrimaryThumbnail(
      options.documentModel,
      normalizedSlideThumbnails,
    ),
    slideThumbnails: normalizedSlideThumbnails,
    document: {
      ...options.documentModel,
      meta: {
        ...options.documentModel.meta,
        id: options.projectId,
        title: normalizedTitle,
      },
    },
  };
}

/** 合并当前页最新缩略图，避免在主 composable 中重复展开对象拷贝。 */
export function mergeCapturedSlideThumbnail(
  slideThumbnails: ProjectSlideThumbnailMap,
  captured: SlideThumbnailCapturedPayload | null,
): ProjectSlideThumbnailMap {
  if (!captured) {
    return slideThumbnails;
  }

  if (slideThumbnails[captured.slideId] === captured.thumbnail) {
    return slideThumbnails;
  }

  return {
    ...slideThumbnails,
    [captured.slideId]: captured.thumbnail,
  };
}
