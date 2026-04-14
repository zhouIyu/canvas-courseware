/** 本地图片 data URL 的协议前缀。 */
const LOCAL_IMAGE_DATA_URL_PREFIX = "data:image/";

/** 判断一个来源是否为需要迁移进资产仓库的本地图片 data URL。 */
export function isLocalImageDataUrl(source: string | null | undefined): source is string {
  return source?.trim().startsWith(LOCAL_IMAGE_DATA_URL_PREFIX) ?? false;
}

/** 统一清理来源字符串前后空白，避免重复比较时出现虚假差异。 */
export function normalizeProjectAssetSource(source: string | null | undefined): string {
  return source?.trim() ?? "";
}
