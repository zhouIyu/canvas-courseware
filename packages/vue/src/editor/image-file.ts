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

/** 判断一个文件是否为浏览器可读取的图片类型。 */
function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** 去掉文件扩展名，生成更适合节点列表展示的名称。 */
function stripFileExtension(fileName: string): string {
  const normalizedFileName = fileName.trim();
  const extensionIndex = normalizedFileName.lastIndexOf(".");

  return extensionIndex > 0 ? normalizedFileName.slice(0, extensionIndex) : normalizedFileName;
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
  const label = stripFileExtension(file.name) || "图片";

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
