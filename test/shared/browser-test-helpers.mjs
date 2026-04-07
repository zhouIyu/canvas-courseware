import fs from "node:fs/promises";
import path from "node:path";
import { loadChromium } from "./playwright-runtime.mjs";

/** 默认桌面测试视口。 */
export const DEFAULT_VIEWPORT = {
  width: 1440,
  height: 900,
};

/**
 * 启动一套浏览器上下文并返回页面句柄。
 *
 * @param {{ width: number; height: number }} viewport
 * @returns {Promise<{ browser: import("playwright").Browser; context: import("playwright").BrowserContext; page: import("playwright").Page; }>}
 */
export async function launchBrowserSession(viewport = DEFAULT_VIEWPORT) {
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
  };
}

/**
 * 为页面挂载控制台和运行时错误收集器。
 *
 * @param {import("playwright").Page} page
 * @returns {{ consoleErrors: string[]; pageErrors: string[]; }}
 */
export function attachPageErrorCollectors(page) {
  /** 当前页面控制台错误。 */
  const consoleErrors = [];
  /** 当前页面运行时错误。 */
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });

  return {
    consoleErrors,
    pageErrors,
  };
}

/**
 * 读取当前页面的滚动与横向溢出指标。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, number | boolean>>}
 */
export async function readViewportMetrics(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    bodyScrollWidth: document.body.scrollWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
}

/**
 * 读取浏览器本地存储中的项目列表。
 *
 * @param {import("playwright").Page} page
 * @param {string} storageKey
 * @returns {Promise<any[]>}
 */
export async function readStoredProjects(page, storageKey) {
  return page.evaluate((key) => {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : [];
  }, storageKey);
}

/**
 * 根据项目 id 查找目标项目。
 *
 * @param {any[]} projects
 * @param {string} projectId
 * @returns {any | null}
 */
export function findProjectById(projects, projectId) {
  return projects.find((project) => project.id === projectId) ?? null;
}

/**
 * 规范化一段可能包含多余空白的文本，便于断言。
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function normalizeInlineText(value) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

/**
 * 确保目标目录存在。
 *
 * @param {string} directoryPath
 * @returns {Promise<void>}
 */
export async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

/**
 * 把结构化对象写入 JSON 文件，便于在测试报告中引用。
 *
 * @param {string} filePath
 * @param {unknown} value
 * @returns {Promise<void>}
 */
export async function writeJsonFile(filePath, value) {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

/**
 * 等待工作台自动保存回到“已保存”状态。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
export async function waitForSaved(page) {
  await page.waitForTimeout(1500);
  await page.locator(".save-inline-meta .arco-tag").filter({ hasText: "已保存" }).waitFor();
  await page.waitForTimeout(200);
}

/**
 * 读取预览 `lower-canvas` 上指定像素点颜色。
 *
 * @param {import("playwright").Page} page
 * @param {number} x
 * @param {number} y
 * @returns {Promise<number[] | null>}
 */
export async function readPreviewCanvasPixel(page, x, y) {
  return page.locator(".preview-stage-surface .lower-canvas").evaluate((canvas, point) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return null;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    return Array.from(context.getImageData(point.x, point.y, 1, 1).data);
  }, { x, y });
}
