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
 * 删除一个 IndexedDB 数据库，供图片资产等浏览器持久化测试做隔离。
 *
 * @param {import("playwright").Page} page
 * @param {string} databaseName
 * @returns {Promise<boolean>}
 */
export async function deleteIndexedDbDatabase(page, databaseName) {
  return page.evaluate((name) => {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(name);

      request.onsuccess = () => resolve(true);
      request.onerror = () =>
        reject(request.error ?? new Error(`删除 IndexedDB 数据库 ${name} 失败`));
      request.onblocked = () => resolve(false);
    });
  }, databaseName);
}

/**
 * 读取 IndexedDB 指定对象仓库中的全部记录，并规整成可跨进程传递的纯数据。
 *
 * @param {import("playwright").Page} page
 * @param {string} databaseName
 * @param {string} storeName
 * @returns {Promise<any[]>}
 */
export async function readIndexedDbStoreRecords(page, databaseName, storeName) {
  return page.evaluate(({ dbName, targetStoreName }) => {
    return new Promise((resolve, reject) => {
      const openRequest = window.indexedDB.open(dbName);

      openRequest.onsuccess = () => {
        const database = openRequest.result;
        if (!database.objectStoreNames.contains(targetStoreName)) {
          database.close();
          resolve([]);
          return;
        }

        const transaction = database.transaction(targetStoreName, "readonly");
        const request = transaction.objectStore(targetStoreName).getAll();

        request.onsuccess = () => {
          database.close();
          resolve(
            (request.result ?? []).map((record) => ({
              id: record.id ?? null,
              projectId: record.projectId ?? null,
              fileName: record.fileName ?? null,
              mimeType: record.mimeType ?? null,
              createdAt: record.createdAt ?? null,
              blobSize: record.blob?.size ?? null,
              blobType: record.blob?.type ?? null,
            })),
          );
        };
        request.onerror = () => {
          database.close();
          reject(request.error ?? new Error(`读取 IndexedDB 仓库 ${targetStoreName} 失败`));
        };
      };

      openRequest.onerror = () =>
        reject(openRequest.error ?? new Error(`打开 IndexedDB 数据库 ${dbName} 失败`));
    });
  }, {
    dbName: databaseName,
    targetStoreName: storeName,
  });
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
 * 读取指定 canvas 选择器上的像素颜色。
 *
 * @param {import("playwright").Page} page
 * @param {string} selector
 * @param {number} x
 * @param {number} y
 * @returns {Promise<number[] | null>}
 */
export async function readCanvasPixel(page, selector, x, y) {
  return page.locator(selector).evaluate((canvas, point) => {
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

/**
 * 读取预览 `lower-canvas` 上指定像素点颜色。
 *
 * @param {import("playwright").Page} page
 * @param {number} x
 * @param {number} y
 * @returns {Promise<number[] | null>}
 */
export async function readPreviewCanvasPixel(page, x, y) {
  return readCanvasPixel(page, ".preview-stage-surface .lower-canvas", x, y);
}
