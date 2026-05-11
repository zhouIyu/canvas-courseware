import type { CoursewareDocument } from "@canvas-courseware/core";
import { createBlankProjectRecord, createDemoProjectRecord } from "./demo-project";
import { normalizeProjectSlideSize, type ProjectCanvasSize } from "./project-creation";
import {
  resolveProjectPrimaryThumbnail,
  sanitizeProjectSlideThumbnails,
} from "./project-thumbnails";
import {
  createDefaultProjectWorkspaceState,
  sanitizeProjectWorkspaceState,
} from "./project-workspace-state";
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

/** 从文档中提取首页画布尺寸，供列表页和创建链路展示。 */
function resolveProjectCanvasSize(document: CoursewareDocument): ProjectCanvasSize {
  return normalizeProjectSlideSize(document.slides[0]?.size);
}

/** 解析一条记录的创建时间，缺失时尽量回退到旧数据中的可用时间。 */
function resolveProjectCreatedAt(record: ProjectRecord): string {
  return record.createdAt
    || record.document?.meta?.createdAt
    || record.updatedAt
    || record.document?.meta?.updatedAt
    || new Date().toISOString();
}

/** 解析一条记录的更新时间，缺失时尽量沿用创建时间兜底。 */
function resolveProjectUpdatedAt(record: ProjectRecord, createdAt: string): string {
  return record.updatedAt
    || record.document?.meta?.updatedAt
    || createdAt;
}

/** 把完整项目记录转成列表页使用的摘要。 */
function toProjectSummary(record: ProjectRecord): ProjectSummary {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    thumbnail: record.thumbnail,
    slideCount: record.document.slides.length,
    canvasSize: resolveProjectCanvasSize(record.document),
  };
}

/** 规范化一条从本地读出的项目记录。 */
function sanitizeStoredProjectRecord(record: ProjectRecord): ProjectRecord {
  /** 读取阶段只修正缺失字段，不主动改写更新时间。 */
  const normalizedTitle = record.title?.trim() || record.document?.meta?.title || "未命名课件";
  /** 旧项目记录可能还没有创建时间，优先用已有时间戳做兼容回填。 */
  const createdAt = resolveProjectCreatedAt(record);
  /** 更新时间优先使用已有存储值，避免纯读取阶段误伤排序。 */
  const updatedAt = resolveProjectUpdatedAt(record, createdAt);
  /** 先标准化一份文档快照，后续缩略图与工作区状态都会依赖它做过滤。 */
  const normalizedDocument = {
    ...clonePlainData(record.document),
    meta: {
      ...clonePlainData(record.document.meta),
      id: record.id,
      title: normalizedTitle,
      createdAt,
      updatedAt,
    },
  };
  /** 先清洗 slide 级缩略图，再反推项目首页封面。 */
  const slideThumbnails = sanitizeProjectSlideThumbnails(
    normalizedDocument,
    record.slideThumbnails,
  );
  /** 再按当前文档过滤一遍工作区状态，避免保留已失效的 slide / step 引用。 */
  const workspaceState = sanitizeProjectWorkspaceState(
    normalizedDocument,
    record.workspaceState ?? createDefaultProjectWorkspaceState(),
  );

  return {
    ...clonePlainData(record),
    title: normalizedTitle,
    createdAt,
    updatedAt,
    thumbnail: resolveProjectPrimaryThumbnail(normalizedDocument, slideThumbnails),
    slideThumbnails,
    workspaceState,
    document: normalizedDocument,
  };
}

/** 规范化一条待保存的项目记录。 */
function normalizeProjectRecord(record: ProjectRecord): ProjectRecord {
  /** 保存前统一整理标题，避免出现空标题项目。 */
  const normalizedRecord = sanitizeStoredProjectRecord(record);
  /** 保存成功后需要生成新的更新时间，同时保留原创建时间。 */
  const updatedAt = new Date().toISOString();
  /** 保存时再次按当前文档过滤一遍缩略图缓存，避免遗留被删除页面的截图。 */
  const slideThumbnails = sanitizeProjectSlideThumbnails(
    normalizedRecord.document,
    normalizedRecord.slideThumbnails,
  );

  return {
    ...normalizedRecord,
    createdAt: normalizedRecord.createdAt,
    updatedAt,
    thumbnail: resolveProjectPrimaryThumbnail(normalizedRecord.document, slideThumbnails),
    slideThumbnails,
    workspaceState: sanitizeProjectWorkspaceState(
      normalizedRecord.document,
      normalizedRecord.workspaceState,
    ),
    document: {
      ...normalizedRecord.document,
      meta: {
        ...normalizedRecord.document.meta,
        createdAt: normalizedRecord.createdAt,
        updatedAt,
      },
    },
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

    create(options) {
      const nextRecord = createBlankProjectRecord(options);
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
