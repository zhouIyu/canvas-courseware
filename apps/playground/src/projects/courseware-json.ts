import {
  parseCoursewareDocument,
  serializeCoursewareDocument,
  type CoursewareDocument,
} from "@canvas-courseware/core";

/** 导出下载时统一使用的 JSON MIME 类型。 */
const COURSEWARE_JSON_MIME_TYPE = "application/json;charset=utf-8";

/**
 * 根据当前项目标题生成一个更适合下载的 JSON 文件名。
 * 这里会剔除常见非法字符，避免在不同系统下保存失败。
 */
export function buildCoursewareJsonFileName(title: string, date = new Date()): string {
  const normalizedTitle = sanitizeFileNameSegment(title.trim() || "courseware");
  const dateStamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

  return `${normalizedTitle}-${dateStamp}.json`;
}

/**
 * 触发浏览器下载一份通用课件 JSON。
 * 这层只负责文件下载行为，不参与文档状态管理。
 */
export function downloadCoursewareJson(
  coursewareDocument: CoursewareDocument,
  title: string,
): string {
  const fileName = buildCoursewareJsonFileName(title);
  const jsonBlob = new Blob([serializeCoursewareDocument(coursewareDocument)], {
    type: COURSEWARE_JSON_MIME_TYPE,
  });
  const objectUrl = URL.createObjectURL(jsonBlob);
  const linkElement = window.document.createElement("a");

  linkElement.href = objectUrl;
  linkElement.download = fileName;
  linkElement.click();

  queueMicrotask(() => {
    URL.revokeObjectURL(objectUrl);
  });

  return fileName;
}

/**
 * 从用户选择的本地 JSON 文件中读取并解析课件文档。
 * 如果文件内容不合法，会直接把 core 层的校验错误抛给调用方处理。
 */
export async function readCoursewareJsonFile(file: File): Promise<CoursewareDocument> {
  const fileText = await file.text();
  return parseCoursewareDocument(fileText);
}

/**
 * 把运行时错误格式化成更适合在 UI 中展示的短句。
 * 目前优先保留底层校验信息，未知错误则回退成稳定文案。
 */
export function formatCoursewareJsonError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "导入失败，请检查文件内容后重试。";
}

/**
 * 规范化文件名片段，尽量保留中文和常见符号的可读性。
 * 只替换各平台最容易出问题的保留字符和多余空白。
 */
function sanitizeFileNameSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
