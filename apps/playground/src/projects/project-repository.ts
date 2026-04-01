import type { CoursewareDocument } from "@canvas-courseware/core";
import { createBlankProjectRecord, createDemoProjectRecord } from "./demo-project";
import type { ProjectRecord, ProjectRepository, ProjectSummary } from "./types";

/** 浏览器本地存储的项目键名。 */
const PROJECT_STORAGE_KEY = "canvas-courseware.projects";

/** 深拷贝一份纯数据对象，避免本地仓库直接暴露内部引用。 */
function clonePlainData<TValue>(value: TValue): TValue {
  if (typeof globalThis.structuredClone === "function") {
    try {
      /**
       * 工作台会把 Vue 响应式对象传到应用层。
       * `structuredClone` 遇到 Proxy 时会直接抛错，所以这里需要兜底到 JSON 方案，
       * 以保证保存链路在标题修改、节点编辑和自动保存场景下都能稳定落盘。
       */
      return globalThis.structuredClone(value);
    } catch {
      // 兜底分支继续走 JSON 深拷贝，兼容响应式代理对象。
    }
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}

/** 从文档中提取首版缩略图占位。 */
function resolveProjectThumbnail(document: CoursewareDocument): string | null {
  return document.slides[0]?.background.fill ?? null;
}

/** 把完整项目记录转成列表页使用的摘要。 */
function toProjectSummary(record: ProjectRecord): ProjectSummary {
  return {
    id: record.id,
    title: record.title,
    updatedAt: record.updatedAt,
    thumbnail: record.thumbnail,
    slideCount: record.document.slides.length,
  };
}

/** 规范化一条从本地读出的项目记录。 */
function sanitizeStoredProjectRecord(record: ProjectRecord): ProjectRecord {
  /** 读取阶段只修正缺失字段，不主动改写更新时间。 */
  const normalizedTitle = record.title?.trim() || record.document?.meta?.title || "未命名课件";

  return {
    ...clonePlainData(record),
    title: normalizedTitle,
    updatedAt: record.updatedAt || new Date().toISOString(),
    thumbnail: record.thumbnail ?? resolveProjectThumbnail(record.document),
    document: {
      ...clonePlainData(record.document),
      meta: {
        ...clonePlainData(record.document.meta),
        id: record.id,
        title: normalizedTitle,
      },
    },
  };
}

/** 规范化一条待保存的项目记录。 */
function normalizeProjectRecord(record: ProjectRecord): ProjectRecord {
  /** 保存前统一整理标题，避免出现空标题项目。 */
  const normalizedRecord = sanitizeStoredProjectRecord(record);

  return {
    ...normalizedRecord,
    updatedAt: new Date().toISOString(),
    thumbnail: resolveProjectThumbnail(normalizedRecord.document),
  };
}

/** 从浏览器中读取已存储的项目列表。 */
function readStoredProjects(): ProjectRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(PROJECT_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as ProjectRecord[];
    return Array.isArray(parsed) ? parsed.map(sanitizeStoredProjectRecord) : [];
  } catch {
    return [];
  }
}

/** 把项目列表整体写回浏览器本地存储。 */
function writeStoredProjects(records: ProjectRecord[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    PROJECT_STORAGE_KEY,
    JSON.stringify(records),
  );
}

/** 按更新时间倒序排列项目，保证最近编辑的内容优先显示。 */
function sortProjectsByUpdatedAt(records: ProjectRecord[]): ProjectRecord[] {
  return [...records].sort((leftRecord, rightRecord) =>
    rightRecord.updatedAt.localeCompare(leftRecord.updatedAt),
  );
}

/** 创建浏览器本地项目仓库。 */
export function createLocalProjectRepository(): ProjectRepository {
  return {
    ensureSeededProjects() {
      const currentRecords = readStoredProjects();
      if (currentRecords.length > 0) {
        return sortProjectsByUpdatedAt(currentRecords).map(toProjectSummary);
      }

      const seededRecord = createDemoProjectRecord();
      writeStoredProjects([seededRecord]);
      return [toProjectSummary(seededRecord)];
    },

    list() {
      return sortProjectsByUpdatedAt(readStoredProjects()).map(toProjectSummary);
    },

    get(id) {
      const targetRecord = readStoredProjects().find((record) => record.id === id);
      return targetRecord ? clonePlainData(targetRecord) : null;
    },

    create(title) {
      const nextRecord = createBlankProjectRecord(title);
      const currentRecords = readStoredProjects();
      writeStoredProjects([nextRecord, ...currentRecords]);
      return clonePlainData(nextRecord);
    },

    save(record) {
      const normalizedRecord = normalizeProjectRecord(record);
      const currentRecords = readStoredProjects();
      const nextRecords = currentRecords.filter((currentRecord) => currentRecord.id !== record.id);
      nextRecords.unshift(normalizedRecord);
      writeStoredProjects(nextRecords);
      return clonePlainData(normalizedRecord);
    },

    remove(id) {
      const currentRecords = readStoredProjects();
      writeStoredProjects(currentRecords.filter((record) => record.id !== id));
    },
  };
}

/** 应用层共享的项目仓库单例。 */
export const projectRepository = createLocalProjectRepository();
