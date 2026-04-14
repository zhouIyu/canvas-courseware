import type { CoursewareDocument } from "./schema";
import {
  migrateCoursewareDocumentData,
  type CoursewareDocumentMigrationResult,
  type CoursewareDocumentMigrationStep,
} from "./document-io/migrator";
import {
  parseCoursewareDocumentJson,
  parseCurrentCoursewareDocumentData,
} from "./document-io/parser";
import { validateCoursewareDocument } from "./document-io/validator";

/**
 * 把标准课件文档序列化成便于导出和检查的 JSON 字符串。
 * 当前统一使用两空格缩进，保证导出结果稳定且易读。
 */
export function serializeCoursewareDocument(document: CoursewareDocument): string {
  return JSON.stringify(document, null, 2);
}

/**
 * 从 JSON 字符串中解析一份标准课件文档。
 * 一旦结构不合法、引用不闭环或 schema 版本不匹配，就直接抛出错误。
 */
export function parseCoursewareDocument(serialized: string): CoursewareDocument {
  return parseCoursewareDocumentData(parseCoursewareDocumentJson(serialized));
}

/**
 * 从任意运行时数据中校验并恢复一份标准课件文档。
 * 这个入口适合导入、测试以及本地存储恢复场景复用。
 */
export function parseCoursewareDocumentData(value: unknown): CoursewareDocument {
  const migrationResult = migrateCoursewareDocumentData(value);
  const parsedDocument = parseCurrentCoursewareDocumentData(migrationResult.document);
  return validateCoursewareDocument(parsedDocument);
}

export type { CoursewareDocumentMigrationResult, CoursewareDocumentMigrationStep };
export { migrateCoursewareDocumentData };
