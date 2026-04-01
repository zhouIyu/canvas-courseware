import type { CoursewareDocument } from "@canvas-courseware/core";

/** 项目列表页使用的摘要信息。 */
export interface ProjectSummary {
  /** 项目唯一标识。 */
  id: string;
  /** 项目标题。 */
  title: string;
  /** 最近更新时间。 */
  updatedAt: string;
  /** 项目缩略图占位，首版用颜色或空值表示。 */
  thumbnail: string | null;
  /** 当前项目的 slide 数量。 */
  slideCount: number;
}

/** 本地仓库里持久化的一条完整项目记录。 */
export interface ProjectRecord {
  /** 项目唯一标识。 */
  id: string;
  /** 项目标题。 */
  title: string;
  /** 最近更新时间。 */
  updatedAt: string;
  /** 项目缩略图占位，首版用颜色或空值表示。 */
  thumbnail: string | null;
  /** 当前项目对应的通用课件文档。 */
  document: CoursewareDocument;
}

/** 工作台内的产品模式。 */
export type ProjectWorkspaceMode = "edit" | "preview";

/** 项目仓库的最小接口约束。 */
export interface ProjectRepository {
  /** 确保首屏至少有一条示例项目。 */
  ensureSeededProjects(): ProjectSummary[];
  /** 读取项目摘要列表。 */
  list(): ProjectSummary[];
  /** 读取单个完整项目。 */
  get(id: string): ProjectRecord | null;
  /** 创建一个新的空白项目。 */
  create(title?: string): ProjectRecord;
  /** 保存一条完整项目记录。 */
  save(record: ProjectRecord): ProjectRecord;
  /** 删除一个项目。 */
  remove(id: string): void;
}
