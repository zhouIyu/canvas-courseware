import type { Slide } from "@canvas-courseware/core";

/** 默认画布宽度兜底值。 */
const FALLBACK_SLIDE_WIDTH = 1280;

/** 默认画布高度兜底值。 */
const FALLBACK_SLIDE_HEIGHT = 720;

/** 导入图片时保留在画布边缘的最小留白。 */
const IMPORT_IMAGE_MARGIN = 48;

/** 导入图片在画布内允许占用的最大宽度比例。 */
const IMPORT_IMAGE_MAX_WIDTH_RATIO = 0.72;

/** 导入图片在画布内允许占用的最大高度比例。 */
const IMPORT_IMAGE_MAX_HEIGHT_RATIO = 0.72;

/** 图片节点默认名称的中文兜底值。 */
const DEFAULT_IMAGE_NODE_LABEL = "图片";

/** 旧版本图片节点默认使用的英文名称。 */
const LEGACY_DEFAULT_IMAGE_NODE_LABEL = "Image";

/** 本地图片资源的标准化结果。 */
export interface LocalImageAsset {
  /** 可直接持久化到文档中的 data URL。 */
  dataUrl: string;
  /** 图片原始宽度。 */
  width: number;
  /** 图片原始高度。 */
  height: number;
  /** 导入文件的原始文件名。 */
  fileName: string;
  /** 去掉扩展名后的默认节点名称。 */
  label: string;
}

/** 导入图片后建议写入节点的画布布局。 */
export interface ImportedImageLayout {
  /** 节点左上角 X 坐标。 */
  x: number;
  /** 节点左上角 Y 坐标。 */
  y: number;
  /** 节点最终宽度。 */
  width: number;
  /** 节点最终高度。 */
  height: number;
}

/** 资源切换后可供图片节点复用的命名信息。 */
export interface ImageResourceDescriptor {
  /** 更适合图层列表展示的短名称。 */
  label: string;
  /** 更适合作为属性面板资源标识的原始名称。 */
  identifier: string;
}

/** 图片资源切换后可自动同步的字段集合。 */
export interface ImageResourceSyncPatch {
  /** 需要自动回写的新节点名称。 */
  name?: string;
  /** 需要自动回写的新资源标识。 */
  alt?: string;
}

/** 图片资源切换前后用于判断是否应保留默认命名的上下文。 */
export interface ImageResourceSyncOptions {
  /** 当前节点名称。 */
  currentName: string;
  /** 当前资源标识。 */
  currentAlt?: string | null;
  /** 切换前的资源地址。 */
  previousSource: string;
  /** 切换前可直接解析的资源文件名，仅在 data URL 等场景下兜底使用。 */
  previousFileName?: string | null;
  /** 切换后的资源地址。 */
  nextSource: string;
  /** 切换后的资源文件名。 */
  nextFileName?: string | null;
}

/** 判断一个文件是否为浏览器可读取的图片类型。 */
function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** 统一规整资源相关文案，避免比较时被前后空格干扰。 */
function normalizeImageResourceText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** 去掉文件扩展名，生成更适合节点列表展示的名称。 */
function stripFileExtension(fileName: string): string {
  const normalizedFileName = fileName.trim();
  const extensionIndex = normalizedFileName.lastIndexOf(".");

  return extensionIndex > 0 ? normalizedFileName.slice(0, extensionIndex) : normalizedFileName;
}

/** 尝试解码 URL 片段，失败时保留原始值，避免异常中断命名流程。 */
function decodeResourceSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** 从资源地址里提取最后一段文件名，供远程 URL 场景生成默认命名。 */
function resolveImageSourceFileName(source: string): string {
  const normalizedSource = normalizeImageResourceText(source);
  if (!normalizedSource || normalizedSource.startsWith("data:")) {
    return "";
  }

  try {
    const parsedUrl = new URL(normalizedSource);
    const pathSegment = parsedUrl.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return decodeResourceSegment(pathSegment);
  } catch {
    const normalizedPath = normalizedSource.split("#")[0]?.split("?")[0] ?? normalizedSource;
    const pathSegment = normalizedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
    return decodeResourceSegment(pathSegment);
  }
}

/** 解析当前资源在 UI 中可复用的默认名称与资源标识。 */
export function resolveImageResourceDescriptor(
  source: string,
  fileName?: string | null,
): ImageResourceDescriptor {
  const normalizedFileName = normalizeImageResourceText(fileName);
  const resolvedSource = normalizeImageResourceText(source);
  const resolvedSourceFileName = resolveImageSourceFileName(source);
  const resolvedIdentifier =
    normalizedFileName ||
    resolvedSourceFileName ||
    (resolvedSource && !resolvedSource.startsWith("data:") ? resolvedSource : "");
  const resolvedLabel =
    stripFileExtension(normalizedFileName || resolvedSourceFileName) || DEFAULT_IMAGE_NODE_LABEL;

  return {
    label: resolvedLabel,
    identifier: resolvedIdentifier,
  };
}

/** 判断节点名称是否仍属于系统默认命名，可在资源切换后自动刷新。 */
function shouldSyncImageNodeName(
  currentName: string,
  previousDescriptor: ImageResourceDescriptor,
): boolean {
  const normalizedName = normalizeImageResourceText(currentName);
  if (!normalizedName) {
    return true;
  }

  return (
    normalizedName === DEFAULT_IMAGE_NODE_LABEL ||
    normalizedName === LEGACY_DEFAULT_IMAGE_NODE_LABEL ||
    normalizedName === previousDescriptor.label ||
    normalizedName === previousDescriptor.identifier
  );
}

/** 判断资源标识是否仍处于默认态，避免覆盖用户手动维护的说明文本。 */
function shouldSyncImageIdentifier(
  currentAlt: string | null | undefined,
  previousDescriptor: ImageResourceDescriptor,
): boolean {
  const normalizedAlt = normalizeImageResourceText(currentAlt);
  if (!normalizedAlt) {
    return true;
  }

  return (
    normalizedAlt === previousDescriptor.identifier || normalizedAlt === previousDescriptor.label
  );
}

/** 基于资源切换前后的上下文，推导默认名称与资源标识是否需要一并更新。 */
export function resolveImageSourceSyncPatch(
  options: ImageResourceSyncOptions,
): ImageResourceSyncPatch {
  const nextDescriptor = resolveImageResourceDescriptor(options.nextSource, options.nextFileName);
  const previousDescriptor = resolveImageResourceDescriptor(
    options.previousSource,
    options.previousFileName,
  );
  const syncPatch: ImageResourceSyncPatch = {};

  if (
    nextDescriptor.label &&
    shouldSyncImageNodeName(options.currentName, previousDescriptor)
  ) {
    syncPatch.name = nextDescriptor.label;
  }

  if (
    nextDescriptor.identifier &&
    shouldSyncImageIdentifier(options.currentAlt, previousDescriptor)
  ) {
    syncPatch.alt = nextDescriptor.identifier;
  }

  return syncPatch;
}

/** 以 data URL 形式读取一张本地图片。 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("图片读取失败，请重试"));
    };
    reader.onerror = () => reject(new Error("图片读取失败，请重试"));
    reader.readAsDataURL(file);
  });
}

/** 加载图片资源并读取其原始宽高。 */
function readImageNaturalSize(src: string): Promise<Pick<LocalImageAsset, "width" | "height">> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });
    };
    image.onerror = () => reject(new Error("图片解析失败，请确认文件未损坏"));
    image.src = src;
  });
}

/** 读取并标准化一张本地图片文件，供编辑器直接创建节点。 */
export async function readLocalImageAsset(file: File): Promise<LocalImageAsset> {
  if (!isImageFile(file)) {
    throw new Error("仅支持导入图片文件");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const imageSize = await readImageNaturalSize(dataUrl);
  const label = stripFileExtension(file.name) || DEFAULT_IMAGE_NODE_LABEL;

  return {
    dataUrl,
    width: imageSize.width,
    height: imageSize.height,
    fileName: file.name,
    label,
  };
}

/** 在画布尺寸约束下计算导入图片的初始展示区域。 */
export function resolveImportedImageLayout(
  slide: Slide | undefined,
  asset: Pick<LocalImageAsset, "width" | "height">,
): ImportedImageLayout {
  const slideWidth = slide?.size.width ?? FALLBACK_SLIDE_WIDTH;
  const slideHeight = slide?.size.height ?? FALLBACK_SLIDE_HEIGHT;
  const maxWidth = Math.max(
    Math.min(slideWidth * IMPORT_IMAGE_MAX_WIDTH_RATIO, slideWidth - IMPORT_IMAGE_MARGIN * 2),
    1,
  );
  const maxHeight = Math.max(
    Math.min(slideHeight * IMPORT_IMAGE_MAX_HEIGHT_RATIO, slideHeight - IMPORT_IMAGE_MARGIN * 2),
    1,
  );
  const scale = Math.min(1, maxWidth / asset.width, maxHeight / asset.height);
  const width = Math.max(Math.round(asset.width * scale), 1);
  const height = Math.max(Math.round(asset.height * scale), 1);

  return {
    x: Math.max(Math.round((slideWidth - width) / 2), 0),
    y: Math.max(Math.round((slideHeight - height) / 2), 0),
    width,
    height,
  };
}
