import fs from "node:fs/promises";
import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  deleteIndexedDbDatabase,
  ensureDirectory,
  findProjectById,
  readIndexedDbStoreRecords,
  readStoredProjects,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";
import { loadChromium } from "../shared/playwright-runtime.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 项目列表在 localStorage 中使用的键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 图片资产仓库对应的 IndexedDB 数据库名。 */
const PROJECT_ASSET_DB_NAME = "canvas-courseware-assets";

/** 图片资产仓库对应的对象存储名。 */
const PROJECT_ASSET_STORE_NAME = "project-assets";

/** 本地图片资源写回文档时使用的内部协议前缀。 */
const LOCAL_ASSET_PROTOCOL = "cw-asset://";

/** 首次插入测试资源。 */
const INSERT_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-08-round-01/vnext08-sample.png",
);

/** 替换图片测试资源。 */
const REPLACE_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-09-round-01/vnext09-bg-portrait.png",
);

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-14-vnext-32-round-04");

/** 导出后的 JSON 文件落盘路径。 */
const EXPORTED_FILE_PATH = path.join(ASSET_DIR, "exported-courseware.json");

/** 当前回归使用的项目标题。 */
const PROJECT_TITLE = "VNext-32-D 资产回归课件";

/** 当前轮次固定使用的 Chrome 可执行文件路径。 */
const CHROME_EXECUTABLE_PATH =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * 打印当前测试阶段，便于排查失败步骤。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext32-asset-test]", label);
}

/**
 * 启动一套允许下载文件的无头 Chrome 浏览器会话。
 *
 * @returns {Promise<{ browser: import("playwright").Browser; context: import("playwright").BrowserContext; page: import("playwright").Page; }>}
 */
async function launchChromeBrowserSession() {
  const chromium = await loadChromium();
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_EXECUTABLE_PATH,
  });
  const context = await browser.newContext({
    viewport: DEFAULT_VIEWPORT,
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
  };
}

/**
 * 拦截默认 favicon 请求，避免开发服务缺少图标时污染错误收集。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function interceptFaviconRequest(page) {
  await page.route("**/favicon.ico", async (route) => {
    await route.fulfill({
      status: 204,
      contentType: "image/x-icon",
      body: "",
    });
  });
}

/**
 * 从工作台地址中解析当前项目 id。
 *
 * @param {string} currentUrl
 * @returns {string}
 */
function extractProjectId(currentUrl) {
  return currentUrl.match(/\/projects\/([^?]+)/)?.[1] ?? "";
}

/**
 * 读取当前项目首张页面上的第一个图片节点。
 *
 * @param {any | null} projectRecord
 * @returns {any | null}
 */
function readFirstImageNode(projectRecord) {
  return projectRecord?.document?.slides?.[0]?.nodes?.find((node) => node.type === "image") ?? null;
}

/**
 * 从图片节点来源里提取本地资产 id。
 *
 * @param {any | null} imageNode
 * @returns {string | null}
 */
function readImageAssetId(imageNode) {
  const source = imageNode?.props?.src ?? "";

  return source.startsWith(LOCAL_ASSET_PROTOCOL)
    ? source.slice(LOCAL_ASSET_PROTOCOL.length)
    : null;
}

/**
 * 读取指定项目在 localStorage 中的完整记录。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<any | null>}
 */
async function readStoredProject(page, projectId) {
  const storedProjects = await readStoredProjects(page, STORAGE_KEY);
  return findProjectById(storedProjects, projectId);
}

/**
 * 读取当前图片资产仓库中的全部资产记录。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<any[]>}
 */
async function readProjectAssetRecords(page) {
  return readIndexedDbStoreRecords(page, PROJECT_ASSET_DB_NAME, PROJECT_ASSET_STORE_NAME);
}

/**
 * 等待资产仓库中的 id 集合稳定为期望值，避免异步清理导致断言过早执行。
 *
 * @param {import("playwright").Page} page
 * @param {string[]} expectedAssetIds
 * @returns {Promise<any[]>}
 */
async function waitForAssetIds(page, expectedAssetIds) {
  const expected = [...expectedAssetIds].sort();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const records = await readProjectAssetRecords(page);
    const current = records.map((record) => record.id).filter(Boolean).sort();

    if (JSON.stringify(current) === JSON.stringify(expected)) {
      return records;
    }

    await page.waitForTimeout(250);
  }

  const latestRecords = await readProjectAssetRecords(page);
  throw new Error(
    `等待资产仓库收敛失败。期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(
      latestRecords.map((record) => record.id).filter(Boolean).sort(),
    )}`,
  );
}

/**
 * 打开右侧管理栏，确保图片属性区可见。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openEditorSide(page) {
  await page.getByRole("button", { name: "展开右侧管理栏" }).click();
  await page.locator(".editor-side").waitFor();
}

/**
 * 导出当前工作台 JSON，并把下载结果落盘到当前测试目录。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<any>}
 */
async function exportCurrentCoursewareJson(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出 JSON" }).click(),
  ]);

  await download.saveAs(EXPORTED_FILE_PATH);
  return JSON.parse(await fs.readFile(EXPORTED_FILE_PATH, "utf8"));
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, context, page } = await launchChromeBrowserSession();

/** 拦截 favicon 请求，减少无关噪音。 */
await interceptFaviconRequest(page);

/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  insertImagePath: INSERT_IMAGE_PATH,
  replaceImagePath: REPLACE_IMAGE_PATH,
  exportedFilePath: EXPORTED_FILE_PATH,
  executedAt: new Date().toISOString(),
  browser: "Google Chrome Headless",
  chromeExecutablePath: CHROME_EXECUTABLE_PATH,
  desktopViewport: DEFAULT_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open project list and reset browser persistence");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await deleteIndexedDbDatabase(page, PROJECT_ASSET_DB_NAME);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  logStep("create blank project and rename for deletion trace");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  /** 当前回归项目 id。 */
  const projectId = extractProjectId(page.url());
  if (!projectId) {
    throw new Error("未能从工作台地址解析出项目 id");
  }

  await page.getByLabel("项目标题").fill(PROJECT_TITLE);
  await page.getByLabel("项目标题").blur();
  await waitForSaved(page);

  logStep("insert local image and inspect persisted asset reference");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "图片" })
    .first()
    .locator("input[type='file']")
    .setInputFiles(INSERT_IMAGE_PATH);
  await openEditorSide(page);
  await page.getByRole("heading", { name: "图片属性" }).waitFor();
  await waitForSaved(page);

  const projectAfterInsert = await readStoredProject(page, projectId);
  const imageAfterInsert = readFirstImageNode(projectAfterInsert);
  const insertedAssetId = readImageAssetId(imageAfterInsert);
  const insertedAssetRecords = await waitForAssetIds(page, insertedAssetId ? [insertedAssetId] : []);

  await writeJsonFile(path.join(ASSET_DIR, "storage-after-insert.json"), projectAfterInsert);
  await writeJsonFile(path.join(ASSET_DIR, "asset-records-after-insert.json"), insertedAssetRecords);

  summary.checks.push({
    id: "insert-image-persists-asset-reference",
    projectId,
    imageSource: imageAfterInsert?.props?.src ?? null,
    imageAlt: imageAfterInsert?.props?.alt ?? null,
    usesLocalAssetProtocol: Boolean(insertedAssetId),
    assetRecordCount: insertedAssetRecords.length,
    assetFileName: insertedAssetRecords[0]?.fileName ?? null,
    assetMimeType: insertedAssetRecords[0]?.mimeType ?? null,
    assetBlobSize: insertedAssetRecords[0]?.blobSize ?? null,
  });

  if (!insertedAssetId) {
    throw new Error("插入图片后，localStorage 中仍未写入 `cw-asset://` 资源引用");
  }

  logStep("replace image and verify stale asset cleanup");
  const imageCard = page.locator(".group-card").filter({
    has: page.getByRole("heading", { name: "图片属性" }),
  });
  await imageCard.locator(".image-source-row input[type='file']").setInputFiles(REPLACE_IMAGE_PATH);
  await waitForSaved(page);

  const projectAfterReplace = await readStoredProject(page, projectId);
  const imageAfterReplace = readFirstImageNode(projectAfterReplace);
  const replacedAssetId = readImageAssetId(imageAfterReplace);
  const replacedAssetRecords = await waitForAssetIds(page, replacedAssetId ? [replacedAssetId] : []);

  await writeJsonFile(path.join(ASSET_DIR, "storage-after-replace.json"), projectAfterReplace);
  await writeJsonFile(path.join(ASSET_DIR, "asset-records-after-replace.json"), replacedAssetRecords);

  summary.checks.push({
    id: "replace-image-cleans-up-stale-asset",
    previousAssetId: insertedAssetId,
    nextAssetId: replacedAssetId,
    assetRecordCount: replacedAssetRecords.length,
    removedOldAsset: Boolean(replacedAssetId) && !replacedAssetRecords.some((record) => record.id === insertedAssetId),
    latestFileName: replacedAssetRecords[0]?.fileName ?? null,
  });

  if (!replacedAssetId || replacedAssetId === insertedAssetId) {
    throw new Error("换图后未写入新的本地资产引用");
  }

  logStep("reload workspace and keep runtime chain available");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const projectAfterReload = await readStoredProject(page, projectId);
  const imageAfterReload = readFirstImageNode(projectAfterReload);

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-after-reload.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "reload-restores-project-after-asset-indirection",
    titleAfterReload: await page.getByLabel("项目标题").inputValue(),
    imageSourceAfterReload: imageAfterReload?.props?.src ?? null,
    stillUsesLocalAssetProtocol: Boolean(readImageAssetId(imageAfterReload)),
  });

  logStep("export project and verify JSON still uses standard data URL");
  const exportedDocument = await exportCurrentCoursewareJson(page);
  const exportedImageNode = readFirstImageNode({
    document: exportedDocument,
  });

  await writeJsonFile(path.join(ASSET_DIR, "exported-courseware.snapshot.json"), exportedDocument);

  summary.checks.push({
    id: "export-json-keeps-standard-image-source",
    exportedImageSource: exportedImageNode?.props?.src ?? null,
    exportedUsesDataUrl:
      typeof exportedImageNode?.props?.src === "string" &&
      exportedImageNode.props.src.startsWith("data:image/"),
    exportedLeaksLocalAssetProtocol:
      typeof exportedImageNode?.props?.src === "string" &&
      exportedImageNode.props.src.startsWith(LOCAL_ASSET_PROTOCOL),
  });

  if (!exportedImageNode?.props?.src?.startsWith("data:image/")) {
    throw new Error("导出的 JSON 未能恢复为标准 data URL 图片来源");
  }

  logStep("return to project list and delete project for asset cleanup");
  await page.getByRole("button", { name: "返回项目列表" }).click();
  await page.waitForURL(/\/projects$/);
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  const projectCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: PROJECT_TITLE }),
  }).first();
  await projectCard.getByRole("button", { name: "删除" }).click();

  const popconfirm = page.locator(".arco-trigger-popup").filter({
    hasText: `确认删除项目「${PROJECT_TITLE}」吗？`,
  }).last();
  await popconfirm.waitFor();
  await popconfirm.getByRole("button", { name: "确定" }).click();
  await page.waitForTimeout(500);

  const projectsAfterDelete = await readStoredProjects(page, STORAGE_KEY);
  const assetRecordsAfterDelete = await waitForAssetIds(page, []);

  await page.screenshot({
    path: path.join(ASSET_DIR, "project-list-after-delete.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "delete-project-cleans-up-assets",
    projectStillExists: Boolean(findProjectById(projectsAfterDelete, projectId)),
    remainingAssetRecordCount: assetRecordsAfterDelete.length,
  });

  if (findProjectById(projectsAfterDelete, projectId)) {
    throw new Error("删除项目后，localStorage 中仍保留了当前项目记录");
  }

  if (assetRecordsAfterDelete.length > 0) {
    throw new Error("删除项目后，IndexedDB 图片资产仓库仍残留未清理记录");
  }

  if (pageErrors.length > 0) {
    throw new Error(`本轮回归出现运行时异常：${pageErrors[0]}`);
  }
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await context.close();
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
