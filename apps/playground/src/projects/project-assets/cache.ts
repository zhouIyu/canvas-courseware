import { parseCoursewareLocalAssetId } from "@canvas-courseware/core";

/** 同一项目内缓存“data URL -> 资产引用”的映射，避免重复计算摘要与重复写库。 */
const projectAssetSourceCache = new Map<string, Map<string, string>>();

/** 读取并按项目隔离 data URL 到资产引用的缓存表。 */
function resolveProjectAssetCache(projectId: string): Map<string, string> {
  const cachedEntries = projectAssetSourceCache.get(projectId);
  if (cachedEntries) {
    return cachedEntries;
  }

  const nextEntries = new Map<string, string>();
  projectAssetSourceCache.set(projectId, nextEntries);
  return nextEntries;
}

/** 记住一条当前项目内“data URL -> 资产引用”的映射，减少重复入库。 */
export function rememberProjectAssetSource(
  projectId: string,
  dataUrl: string,
  assetSource: string,
): void {
  resolveProjectAssetCache(projectId).set(dataUrl, assetSource);
}

/** 从当前项目缓存里读取已经建立过的资产引用映射。 */
export function readRememberedProjectAssetSource(
  projectId: string,
  dataUrl: string,
): string | null {
  return resolveProjectAssetCache(projectId).get(dataUrl) ?? null;
}

/** 在项目删除或整页卸载时清理对应的缓存映射。 */
export function clearProjectAssetSourceCache(projectId?: string): void {
  if (projectId) {
    projectAssetSourceCache.delete(projectId);
    return;
  }

  projectAssetSourceCache.clear();
}

/** 在资产被删除后清掉缓存里的旧映射，避免同会话内重用失效引用。 */
export function invalidateProjectAssetSourceCache(assetIds: string[]): void {
  if (assetIds.length === 0) {
    return;
  }

  const assetIdSet = new Set(assetIds);

  for (const [projectId, cachedEntries] of projectAssetSourceCache.entries()) {
    for (const [dataUrl, assetSource] of cachedEntries.entries()) {
      const assetId = parseCoursewareLocalAssetId(assetSource);
      if (assetId && assetIdSet.has(assetId)) {
        cachedEntries.delete(dataUrl);
      }
    }

    if (cachedEntries.size === 0) {
      projectAssetSourceCache.delete(projectId);
    }
  }
}
