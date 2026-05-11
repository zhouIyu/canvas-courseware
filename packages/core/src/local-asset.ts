/** 课件本地资产引用统一使用的协议前缀。 */
export const COURSEWARE_LOCAL_ASSET_PROTOCOL = "cw-asset://";

/** 远程图片资源地址统一按 `http / https` 前缀识别。 */
const COURSEWARE_REMOTE_IMAGE_SOURCE_PATTERN = /^https?:\/\//i;

/** 内联图片 data URL 统一使用 `data:image/` 前缀。 */
const COURSEWARE_INLINE_IMAGE_DATA_URL_PREFIX = "data:image/";

/** 判断给定资源地址是否为课件内部使用的本地资产引用。 */
export function isCoursewareLocalAssetSource(
  source: string | null | undefined,
): source is string {
  return source?.trim().startsWith(COURSEWARE_LOCAL_ASSET_PROTOCOL) ?? false;
}

/** 判断给定资源地址是否为远程图片 URL。 */
export function isCoursewareRemoteImageSource(
  source: string | null | undefined,
): source is string {
  return COURSEWARE_REMOTE_IMAGE_SOURCE_PATTERN.test(source?.trim() ?? "");
}

/** 判断给定资源地址是否为可直接嵌入文档的图片 data URL。 */
export function isCoursewareInlineImageDataUrl(
  source: string | null | undefined,
): source is string {
  return source?.trim().startsWith(COURSEWARE_INLINE_IMAGE_DATA_URL_PREFIX) ?? false;
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
