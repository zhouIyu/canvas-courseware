import type { CoursewareDocument, ImageNode, Slide } from "@canvas-courseware/core";

/** 持久化在 IndexedDB 中的一条图片资产记录。 */
export interface ProjectAssetRecord {
  /** 资产唯一 id。 */
  id: string;
  /** 资产所属项目 id。 */
  projectId: string;
  /** 资产原始文件名或回退文件名。 */
  fileName: string;
  /** 资产 mime 类型。 */
  mimeType: string;
  /** 资产二进制内容。 */
  blob: Blob;
  /** 创建时间。 */
  createdAt: string;
}

/** 文档中的一处图片来源上下文，用于补齐更合理的资产文件名。 */
export interface ProjectDocumentAssetContext {
  /** 当前来源所在 slide。 */
  slide: Slide;
  /** 当前来源关联的图片节点；背景图场景为空。 */
  node: ImageNode | null;
  /** 当前待转换的原始来源地址。 */
  source: string;
}

/** 遍历文档来源后返回的统一结果。 */
export interface ProjectDocumentSourceTransformResult {
  /** 转换后的文档对象。 */
  document: CoursewareDocument;
  /** 本轮被替换掉的来源数量。 */
  rewrittenAssetCount: number;
}

/** 文档本地资产归一化后的结果。 */
export interface ProjectDocumentAssetNormalizationResult {
  /** 写回项目仓库时应使用的文档。 */
  document: CoursewareDocument;
  /** 当前文档引用到的全部本地资产 id。 */
  assetIds: string[];
  /** 本轮被替换为本地资产引用的来源数量。 */
  rewrittenAssetCount: number;
}

/** 从仓库恢复文档时的图片资产还原结果。 */
export interface ProjectDocumentAssetHydrationResult {
  /** 供运行时继续消费的文档。 */
  document: CoursewareDocument;
  /** 本轮成功从本地资产仓库还原的来源数量。 */
  restoredAssetCount: number;
  /** 当前文档中引用但仓库里已缺失的资产 id 列表。 */
  missingAssetIds: string[];
}
