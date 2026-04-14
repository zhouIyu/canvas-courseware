import { parseCoursewareLocalAssetId, type CoursewareDocument } from "@canvas-courseware/core";
import {
  clearProjectAssetSourceCache,
  invalidateProjectAssetSourceCache,
} from "./project-assets/cache";
import {
  collectProjectAssetIdsFromDocument,
  transformProjectDocumentSources,
} from "./project-assets/document";
import {
  canUseProjectAssetStorage,
  deleteProjectAssetRecords,
  hydrateProjectAssetDataUrl,
  persistProjectAssetDataUrl,
} from "./project-assets/storage";
import {
  isLocalImageDataUrl,
  normalizeProjectAssetSource,
} from "./project-assets/shared";
import type {
  ProjectDocumentAssetHydrationResult,
  ProjectDocumentAssetNormalizationResult,
} from "./project-assets/types";

/** 复用同一轮转换中的进行中任务，避免重复读写相同资源。 */
async function resolvePendingProjectAssetTask<TKey extends string>(
  pendingTasks: Map<TKey, Promise<string>>,
  taskKey: TKey,
  createTask: () => Promise<string>,
): Promise<string> {
  const pendingTask = pendingTasks.get(taskKey);
  if (pendingTask) {
    return pendingTask;
  }

  const nextTask = createTask();
  pendingTasks.set(taskKey, nextTask);

  try {
    return await nextTask;
  } finally {
    pendingTasks.delete(taskKey);
  }
}

/** 保存前把文档中的本地图片 data URL 改写成稳定的本地资产引用。 */
export async function normalizeProjectDocumentAssetSources(
  document: CoursewareDocument,
  projectId: string,
): Promise<ProjectDocumentAssetNormalizationResult> {
  if (!canUseProjectAssetStorage()) {
    return {
      document,
      assetIds: collectProjectAssetIdsFromDocument(document),
      rewrittenAssetCount: 0,
    };
  }

  const pendingSourceTasks = new Map<string, Promise<string>>();
  const transformResult = await transformProjectDocumentSources(document, async (context) => {
    const normalizedSource = normalizeProjectAssetSource(context.source);
    if (!isLocalImageDataUrl(normalizedSource)) {
      return context.source;
    }

    return resolvePendingProjectAssetTask(pendingSourceTasks, normalizedSource, () =>
      persistProjectAssetDataUrl(projectId, {
        ...context,
        source: normalizedSource,
      }),
    );
  });

  return {
    document: transformResult.document,
    assetIds: collectProjectAssetIdsFromDocument(transformResult.document),
    rewrittenAssetCount: transformResult.rewrittenAssetCount,
  };
}

/** 加载项目时把本地资产引用重新还原成 data URL，保持现有运行时与导出链路不变。 */
export async function hydrateProjectDocumentAssetSources(
  document: CoursewareDocument,
  projectId: string,
): Promise<ProjectDocumentAssetHydrationResult> {
  if (!canUseProjectAssetStorage()) {
    return {
      document,
      restoredAssetCount: 0,
      missingAssetIds: [],
    };
  }

  const missingAssetIds = new Set<string>();
  const pendingAssetTasks = new Map<string, Promise<string>>();
  const transformResult = await transformProjectDocumentSources(document, async (context) => {
    const assetId = parseCoursewareLocalAssetId(
      normalizeProjectAssetSource(context.source),
    );
    if (!assetId) {
      return context.source;
    }

    return resolvePendingProjectAssetTask(pendingAssetTasks, assetId, async () => {
      const dataUrl = await hydrateProjectAssetDataUrl(projectId, assetId);
      if (!dataUrl) {
        missingAssetIds.add(assetId);
        return context.source;
      }

      return dataUrl;
    });
  });

  return {
    document: transformResult.document,
    restoredAssetCount: transformResult.rewrittenAssetCount,
    missingAssetIds: Array.from(missingAssetIds).sort(),
  };
}

/** 删除一组已经不再被项目引用的本地图片资产。 */
export async function removeProjectAssets(assetIds: string[]): Promise<void> {
  if (!canUseProjectAssetStorage()) {
    return;
  }

  const uniqueAssetIds = Array.from(new Set(assetIds.filter(Boolean)));
  if (uniqueAssetIds.length === 0) {
    return;
  }

  await deleteProjectAssetRecords(uniqueAssetIds);
  invalidateProjectAssetSourceCache(uniqueAssetIds);
}

export { clearProjectAssetSourceCache, collectProjectAssetIdsFromDocument };
