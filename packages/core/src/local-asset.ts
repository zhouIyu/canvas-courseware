/** 课件本地资产引用统一使用的协议前缀。 */
export const COURSEWARE_LOCAL_ASSET_PROTOCOL = "cw-asset://";

/** 判断给定资源地址是否为课件内部使用的本地资产引用。 */
export function isCoursewareLocalAssetSource(
  source: string | null | undefined,
): source is string {
  return source?.trim().startsWith(COURSEWARE_LOCAL_ASSET_PROTOCOL) ?? false;
}

/** 基于资产 id 生成一条可写入文档的本地资产引用地址。 */
export function createCoursewareLocalAssetSource(assetId: string): string {
  return `${COURSEWARE_LOCAL_ASSET_PROTOCOL}${assetId}`;
}

/** 从本地资产引用地址中解析真实资产 id；若格式不合法则返回空值。 */
export function parseCoursewareLocalAssetId(
  source: string | null | undefined,
): string | null {
  const normalizedSource = source?.trim() ?? "";

  if (!normalizedSource.startsWith(COURSEWARE_LOCAL_ASSET_PROTOCOL)) {
    return null;
  }

  const assetId = normalizedSource.slice(COURSEWARE_LOCAL_ASSET_PROTOCOL.length).trim();
  return assetId.length > 0 ? assetId : null;
}
