import { COURSEWARE_SCHEMA_VERSION } from "../schema";
import { expectRecord, readString, type UnknownRecord } from "./shared";

/** 描述一条 schema 版本迁移规则。 */
export interface CoursewareDocumentMigrationStep {
  /** 迁移前的 schema 版本号。 */
  readonly fromVersion: string;
  /** 迁移后的 schema 版本号。 */
  readonly toVersion: string;
  /** 执行迁移时使用的原始数据转换器。 */
  readonly migrate: (document: UnknownRecord) => UnknownRecord;
}

/** 描述一次 schema 迁移执行后的结果。 */
export interface CoursewareDocumentMigrationResult {
  /** 已迁移到目标版本的原始文档数据。 */
  readonly document: unknown;
  /** 输入文档最初声明的 schema 版本。 */
  readonly originalVersion: string;
  /** 迁移完成后得到的 schema 版本。 */
  readonly migratedVersion: string;
  /** 本次实际应用的迁移链路，按执行顺序记录。 */
  readonly appliedMigrations: readonly string[];
}

/**
 * 当前已注册的 schema 迁移链路。
 * 目前 `1.0.0` 仍直接直通，后续新增版本时只需要在这里补链路即可。
 */
const COURSEWARE_DOCUMENT_MIGRATIONS: readonly CoursewareDocumentMigrationStep[] = [];

/** 迁移链路查找表，方便按照 `fromVersion` 做逐步推进。 */
const COURSEWARE_DOCUMENT_MIGRATION_MAP = new Map(
  COURSEWARE_DOCUMENT_MIGRATIONS.map((migration) => [migration.fromVersion, migration]),
);

/**
 * 把任意版本的原始文档数据迁移到当前 schema 版本。
 * 当前版本会直接返回，其他版本则按注册链路顺序逐步迁移。
 */
export function migrateCoursewareDocumentData(value: unknown): CoursewareDocumentMigrationResult {
  const documentRecord = expectRecord(value, "document");
  const originalVersion = readString(documentRecord, "version", "document.version");

  if (originalVersion === COURSEWARE_SCHEMA_VERSION) {
    return {
      document: value,
      originalVersion,
      migratedVersion: originalVersion,
      appliedMigrations: [],
    };
  }

  let currentDocument = documentRecord;
  let currentVersion = originalVersion;
  const appliedMigrations: string[] = [];
  const visitedVersions = new Set<string>();

  while (currentVersion !== COURSEWARE_SCHEMA_VERSION) {
    if (visitedVersions.has(currentVersion)) {
      throw new Error(`schema 版本迁移出现循环，无法从 ${originalVersion} 迁移到 ${COURSEWARE_SCHEMA_VERSION}。`);
    }

    visitedVersions.add(currentVersion);
    const migration = COURSEWARE_DOCUMENT_MIGRATION_MAP.get(currentVersion);

    if (!migration) {
      throw new Error(
        `暂不支持 schema 版本 ${originalVersion}，当前仅支持 ${COURSEWARE_SCHEMA_VERSION}，且没有可用的迁移路径。`,
      );
    }

    currentDocument = migration.migrate(currentDocument);
    currentVersion = readString(currentDocument, "version", "document.version");
    appliedMigrations.push(`${migration.fromVersion} -> ${migration.toVersion}`);

    if (currentVersion !== migration.toVersion) {
      throw new Error(
        `schema 迁移结果异常：期望迁移到 ${migration.toVersion}，实际得到 ${currentVersion}。`,
      );
    }
  }

  return {
    document: currentDocument,
    originalVersion,
    migratedVersion: currentVersion,
    appliedMigrations,
  };
}
