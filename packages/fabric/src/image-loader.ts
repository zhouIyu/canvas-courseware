import { FabricImage } from "fabric";
import { isCoursewareRemoteImageSource } from "@canvas-courseware/core";

/** Fabric 图片加载时使用的资源配置类型。 */
type FabricImageLoadOptions = Parameters<typeof FabricImage.fromURL>[1];

/** Fabric 图片加载时使用的对象配置类型。 */
type FabricImageObjectOptions = Parameters<typeof FabricImage.fromURL>[2];

/** 直接按给定来源加载一张 Fabric 图片。 */
async function loadFabricImage(
  source: string,
  loadOptions: FabricImageLoadOptions,
  objectOptions: FabricImageObjectOptions,
): Promise<FabricImage> {
  return FabricImage.fromURL(source, loadOptions, objectOptions);
}

/**
 * 统一加载图片资源。
 * 远程 URL 优先尝试 `anonymous` 模式，以便在服务端允许 CORS 时保留截图能力；
 * 若远程服务不支持 CORS，再回退到普通加载，至少保证编辑与预览可继续显示图片。
 */
export async function loadFabricImageWithRemoteFallback(
  source: string,
  objectOptions: FabricImageObjectOptions,
): Promise<FabricImage> {
  if (!isCoursewareRemoteImageSource(source)) {
    return loadFabricImage(source, {}, objectOptions);
  }

  try {
    return await loadFabricImage(source, { crossOrigin: "anonymous" }, objectOptions);
  } catch {
    return loadFabricImage(source, {}, objectOptions);
  }
}
