import { createCoursewareLocalAssetSource } from "@canvas-courseware/core";
import { readRememberedProjectAssetSource, rememberProjectAssetSource } from "./cache";
import { normalizeProjectAssetSource } from "./shared";
import type { ProjectAssetRecord, ProjectDocumentAssetContext } from "./types";

/** IndexedDB 中用于保存项目图片资产的数据库名。 */
const PROJECT_ASSET_DB_NAME = "canvas-courseware-assets";

/** 图片资产数据库当前版本号。 */
const PROJECT_ASSET_DB_VERSION = 1;

/** IndexedDB 中保存图片资产的对象仓库名。 */
const PROJECT_ASSET_STORE_NAME = "project-assets";

/** IndexedDB 打开过程的缓存 Promise，避免并发保存时重复创建连接。 */
let projectAssetDatabasePromise: Promise<IDBDatabase> | null = null;

/** 判断当前运行环境是否支持本地图片资产仓库。 */
export function canUseProjectAssetStorage(): boolean {
  return typeof indexedDB !== "undefined" && typeof Blob !== "undefined";
}

/** 打开图片资产数据库，并在首次初始化时创建对象仓库。 */
async function openProjectAssetDatabase(): Promise<IDBDatabase> {
  if (!projectAssetDatabasePromise) {
    projectAssetDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(PROJECT_ASSET_DB_NAME, PROJECT_ASSET_DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROJECT_ASSET_STORE_NAME)) {
          database.createObjectStore(PROJECT_ASSET_STORE_NAME, {
            keyPath: "id",
          });
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onclose = () => {
          projectAssetDatabasePromise = null;
        };
        resolve(database);
      };

      request.onerror = () => {
        projectAssetDatabasePromise = null;
        reject(request.error ?? new Error("本地图片资产数据库打开失败"));
      };
    });
  }

  return projectAssetDatabasePromise;
}

/** 读取一条指定 id 的图片资产记录。 */
async function readProjectAssetRecord(assetId: string): Promise<ProjectAssetRecord | null> {
  const database = await openProjectAssetDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROJECT_ASSET_STORE_NAME, "readonly");
    const request = transaction.objectStore(PROJECT_ASSET_STORE_NAME).get(assetId);

    request.onsuccess = () => {
      resolve((request.result as ProjectAssetRecord | undefined) ?? null);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("本地图片资产读取失败"));
    };
  });
}

/** 写入一条图片资产记录；相同 id 会被稳定覆盖。 */
async function writeProjectAssetRecord(record: ProjectAssetRecord): Promise<void> {
  const database = await openProjectAssetDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_ASSET_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PROJECT_ASSET_STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("本地图片资产写入失败"));
    };

    store.put(record);
  });
}

/** 删除一条图片资产记录，供项目删除或资源替换清理使用。 */
async function deleteProjectAssetRecord(assetId: string): Promise<void> {
  const database = await openProjectAssetDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROJECT_ASSET_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PROJECT_ASSET_STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("本地图片资产删除失败"));
    };

    store.delete(assetId);
  });
}

/** 删除一组本地图片资产记录。 */
export async function deleteProjectAssetRecords(assetIds: string[]): Promise<void> {
  await Promise.all(assetIds.map((assetId) => deleteProjectAssetRecord(assetId)));
}

/** 把 data URL 转成可持久化的 Blob。 */
async function convertDataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/** 把 Blob 重新编码成 data URL，供运行时与导出链路直接复用。 */
function convertBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("本地图片资产编码失败"));
    };
    reader.onerror = () => reject(new Error("本地图片资产编码失败"));
    reader.readAsDataURL(blob);
  });
}

/** 把字节缓冲区编码成十六进制字符串，供生成稳定资产 id 使用。 */
function encodeHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, "0")).join("");
}

/** 在缺少 `crypto.subtle` 时，回退到一个稳定的 FNV-1a 哈希，保证资产 id 仍可复用。 */
function createFallbackHash(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

/** 基于图片内容生成稳定资产 id，避免同一项目多次保存时不断生成新引用。 */
async function createProjectAssetId(projectId: string, blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest =
    typeof crypto !== "undefined" && crypto.subtle
      ? encodeHex(await crypto.subtle.digest("SHA-256", buffer)).slice(0, 32)
      : createFallbackHash(buffer);

  return `${projectId}__${digest}`;
}

/** 根据 mime 类型推导更合理的文件扩展名。 */
function resolveFileExtensionFromMimeType(mimeType: string): string {
  const normalizedMimeType = mimeType.trim().toLowerCase();

  if (normalizedMimeType === "image/jpeg") {
    return "jpg";
  }

  if (normalizedMimeType.startsWith("image/")) {
    return normalizedMimeType.slice("image/".length) || "png";
  }

  return "png";
}

/** 规整文件名片段，避免生成带保留字符的伪文件名。 */
function sanitizeFileNameSegment(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** 为没有稳定原文件名的导入来源补一条可读的回退文件名。 */
function resolveFallbackAssetFileName(
  context: ProjectDocumentAssetContext,
  mimeType: string,
): string {
  const extension = resolveFileExtensionFromMimeType(mimeType);
  const explicitFileName = context.node?.props.alt?.trim();

  if (explicitFileName) {
    return explicitFileName;
  }

  const baseName = context.node
    ? sanitizeFileNameSegment(context.node.name) || "image"
    : `${sanitizeFileNameSegment(context.slide.name) || "slide"}-background`;

  return `${baseName}.${extension}`;
}

/** 把一条本地图片 data URL 写入资产仓库，并返回稳定的本地资产引用地址。 */
export async function persistProjectAssetDataUrl(
  projectId: string,
  context: ProjectDocumentAssetContext,
): Promise<string> {
  const normalizedSource = normalizeProjectAssetSource(context.source);
  const cachedAssetSource = readRememberedProjectAssetSource(projectId, normalizedSource);

  if (cachedAssetSource) {
    return cachedAssetSource;
  }

  const blob = await convertDataUrlToBlob(normalizedSource);
  const assetId = await createProjectAssetId(projectId, blob);
  const assetSource = createCoursewareLocalAssetSource(assetId);
  const existingRecord = await readProjectAssetRecord(assetId);

  if (!existingRecord) {
    await writeProjectAssetRecord({
      id: assetId,
      projectId,
      fileName: resolveFallbackAssetFileName(context, blob.type),
      mimeType: blob.type || "image/png",
      blob,
      createdAt: new Date().toISOString(),
    });
  }

  rememberProjectAssetSource(projectId, normalizedSource, assetSource);
  return assetSource;
}

/** 把内部资产引用恢复为运行时可直接消费的 data URL。 */
export async function hydrateProjectAssetDataUrl(
  projectId: string,
  assetId: string,
): Promise<string | null> {
  const assetRecord = await readProjectAssetRecord(assetId);
  if (!assetRecord) {
    return null;
  }

  const dataUrl = await convertBlobToDataUrl(assetRecord.blob);
  rememberProjectAssetSource(projectId, dataUrl, createCoursewareLocalAssetSource(assetId));
  return dataUrl;
}
