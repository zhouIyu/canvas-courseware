import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  deleteIndexedDbDatabase,
  ensureDirectory,
  findProjectById,
  normalizeInlineText,
  readStoredProjects,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";
import { loadChromium } from "../shared/playwright-runtime.mjs";

/** 当前回归默认使用的项目列表地址。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 图片资产仓库对应的数据库名。 */
const PROJECT_ASSET_DB_NAME = "canvas-courseware-assets";

/** 首次插图时使用的本地图片资源。 */
const LOCAL_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-08-round-01/vnext08-sample.png",
);

/** 当前轮次产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-11-vnext-36-d-round-01");

/** 当前轮次导出的 JSON 文件。 */
const EXPORTED_FILE_PATH = path.join(ASSET_DIR, "exported-courseware.json");

/** 当前轮次固定项目标题。 */
const PROJECT_TITLE = "VNext-36-D 资源链路回归课件";

/**
 * 打印当前测试阶段，便于失败时快速定位。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext36-d-test]", label);
}

/**
 * 启动一套允许下载文件的浏览器会话。
 *
 * @returns {Promise<{ browser: import("playwright").Browser; context: import("playwright").BrowserContext; page: import("playwright").Page; }>}
 */
async function launchChromeBrowserSession() {
  const chromium = await loadChromium();
  const browser = await chromium.launch({ headless: true });
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
 * 启动一个不返回 CORS 头的本地图片服务，模拟“可显示但无法安全截图”的远程资源。
 *
 * @returns {Promise<{ close: () => Promise<void>; imageUrl: string; }>}
 */
async function startNoCorsImageServer() {
  const imageBuffer = await fs.readFile(LOCAL_IMAGE_PATH);

  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.url === "/remote.png") {
        response.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        });
        response.end(imageBuffer);
        return;
      }

      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("not-found");
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("未能拿到本地远程图片服务端口"));
        return;
      }

      resolve({
        imageUrl: `http://127.0.0.1:${address.port}/remote.png`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          }),
      });
    });
  });
}

/**
 * 读取指定项目记录。
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
 * 读取浏览器最近保留的结构化诊断日志。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<any[]>}
 */
async function readDiagnosticEntries(page) {
  return page.evaluate(() => window.__CW_DIAGNOSTICS__.getEntries());
}

/**
 * 读取编辑器调试桥中的最新标准快照。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<any>}
 */
async function readEditorSnapshot(page) {
  return page.evaluate(() => window.__CW_EDITOR_DEBUG__.getSnapshot());
}

/**
 * 读取首张页面。
 *
 * @param {any | null} projectRecord
 * @returns {any | null}
 */
function readFirstSlide(projectRecord) {
  return projectRecord?.document?.slides?.[0] ?? null;
}

/**
 * 读取首张页面里的首个图片节点。
 *
 * @param {any | null} projectRecord
 * @returns {any | null}
 */
function readFirstImageNode(projectRecord) {
  return readFirstSlide(projectRecord)?.nodes?.find((node) => node.type === "image") ?? null;
}

/**
 * 打开右侧管理栏，确保属性面板可见。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openEditorSide(page) {
  const expandButton = page.getByRole("button", { name: "展开右侧管理栏" });
  if (await expandButton.isVisible()) {
    await expandButton.click();
  }

  await page.locator(".editor-side").waitFor();
}

/**
 * 打开页面设置抽屉。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openSlideSettingsDrawer(page) {
  await page.getByRole("button", { name: "打开页面设置" }).click();
  await page.locator(".slide-settings-drawer .slide-settings-summary").waitFor();
}

/**
 * 把当前页面背景地址改成给定远程 URL。
 *
 * @param {import("playwright").Page} page
 * @param {string} source
 * @returns {Promise<void>}
 */
async function updateBackgroundImageSource(page, source) {
  await openSlideSettingsDrawer(page);
  const input = page
    .locator(".slide-settings-drawer .field")
    .filter({
      has: page.locator(".field-label", { hasText: "背景图地址" }),
    })
    .locator("input")
    .first();

  await input.fill(source);
  await input.blur();
  await waitForSaved(page);
  await page.locator(".slide-settings-drawer .arco-drawer-close-btn").click();
  await page.locator(".slide-settings-drawer").waitFor({ state: "hidden" });
}

/**
 * 把调试快照中的画布坐标换算成真实点击位置。
 *
 * @param {import("playwright").Page} page
 * @param {number} localX
 * @param {number} localY
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function resolveCanvasViewportPoint(page, localX, localY) {
  return page.locator(".stage-surface").evaluate((element, point) => {
    const rect = element.getBoundingClientRect();
    const canvas = element.querySelector("canvas");
    const canvasWidth = canvas instanceof HTMLCanvasElement ? canvas.width : 1280;
    const canvasHeight = canvas instanceof HTMLCanvasElement ? canvas.height : 720;

    return {
      x: rect.left + (point.x / canvasWidth) * rect.width,
      y: rect.top + (point.y / canvasHeight) * rect.height,
    };
  }, {
    x: localX,
    y: localY,
  });
}

/**
 * 点击当前首个图片节点，确保右侧属性面板切换到图片态。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function selectFirstImageNode(page) {
  const snapshot = await readEditorSnapshot(page);
  const imageNode = snapshot.document?.slides?.[0]?.nodes?.find((node) => node.type === "image");
  if (!imageNode) {
    throw new Error("未能从编辑器快照中找到首个图片节点");
  }

  const point = await resolveCanvasViewportPoint(
    page,
    imageNode.x + Math.max(Math.round(imageNode.width / 2), 24),
    imageNode.y + Math.max(Math.round(imageNode.height / 2), 24),
  );

  await page.mouse.click(point.x, point.y);
  await page.getByRole("heading", { name: "图片属性" }).waitFor();
}

/**
 * 把当前选中图片节点的地址改成给定远程 URL。
 *
 * @param {import("playwright").Page} page
 * @param {string} source
 * @returns {Promise<void>}
 */
async function updateSelectedImageSource(page, source) {
  const input = page
    .locator(".group-card")
    .filter({
      has: page.getByRole("heading", { name: "图片属性" }),
    })
    .locator(".field")
    .filter({
      has: page.locator(".field-label", { hasText: "图片地址" }),
    })
    .locator("input")
    .first();

  await input.fill(source);
  await input.blur();
  await waitForSaved(page);
}

/**
 * 导出当前工作台 JSON，并返回解析后的对象。
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

/** 当前本地无 CORS 图片服务。 */
const noCorsImageServer = await startNoCorsImageServer();

/** 当前浏览器会话。 */
const { browser, page } = await launchChromeBrowserSession();

/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次的同源远程背景地址。 */
const SAME_ORIGIN_REMOTE_BACKGROUND_URL = `${new URL(BASE_URL).origin}/test-assets/vnext-36-remote-grid.svg`;

/** 当前轮次结构化结果。 */
const summary = {
  assetDir: ASSET_DIR,
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  exportedFilePath: EXPORTED_FILE_PATH,
  noCorsRemoteImageUrl: noCorsImageServer.imageUrl,
  projectTitle: PROJECT_TITLE,
  sameOriginRemoteBackgroundUrl: SAME_ORIGIN_REMOTE_BACKGROUND_URL,
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

  logStep("create blank project");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.waitForFunction(() =>
    Boolean(window.__CW_EDITOR_DEBUG__) && Boolean(window.__CW_DIAGNOSTICS__),
  );
  await waitForSaved(page);

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";
  if (!projectId) {
    throw new Error("未能从工作台地址解析出项目 id");
  }

  await page.getByLabel("项目标题").fill(PROJECT_TITLE);
  await page.getByLabel("项目标题").blur();
  await waitForSaved(page);

  logStep("insert local asset image and keep cw-asset persistence");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "图片" })
    .first()
    .locator("input[type='file']")
    .setInputFiles(LOCAL_IMAGE_PATH);
  await waitForSaved(page);

  logStep("configure same-origin remote background");
  await openEditorSide(page);
  await updateBackgroundImageSource(page, SAME_ORIGIN_REMOTE_BACKGROUND_URL);

  const projectAfterMixedSave = await readStoredProject(page, projectId);
  const firstSlideAfterMixedSave = readFirstSlide(projectAfterMixedSave);
  const firstImageNodeAfterMixedSave = readFirstImageNode(projectAfterMixedSave);

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-mixed-save.json"),
    projectAfterMixedSave,
  );

  summary.checks.push({
    id: "mixed-source-storage",
    backgroundSource: firstSlideAfterMixedSave?.background?.image?.src ?? null,
    imageSource: firstImageNodeAfterMixedSave?.props?.src ?? null,
    usesRemoteBackgroundUrl:
      firstSlideAfterMixedSave?.background?.image?.src === SAME_ORIGIN_REMOTE_BACKGROUND_URL,
    usesLocalAssetProtocol:
      (firstImageNodeAfterMixedSave?.props?.src ?? "").startsWith("cw-asset://"),
  });

  if (firstSlideAfterMixedSave?.background?.image?.src !== SAME_ORIGIN_REMOTE_BACKGROUND_URL) {
    throw new Error("远程背景图地址没有按原值写回项目存储");
  }

  if (!(firstImageNodeAfterMixedSave?.props?.src ?? "").startsWith("cw-asset://")) {
    throw new Error("本地图片保存后没有继续写入 cw-asset:// 资产引用");
  }

  logStep("export mixed-source project");
  const exportedDocument = await exportCurrentCoursewareJson(page);
  const exportedFirstSlide = exportedDocument.slides?.[0] ?? null;
  const exportedFirstImageNode =
    exportedFirstSlide?.nodes?.find((node) => node.type === "image") ?? null;

  summary.checks.push({
    id: "mixed-source-export",
    backgroundSource: exportedFirstSlide?.background?.image?.src ?? null,
    imageSource: exportedFirstImageNode?.props?.src ?? null,
    keepsRemoteBackgroundUrl:
      exportedFirstSlide?.background?.image?.src === SAME_ORIGIN_REMOTE_BACKGROUND_URL,
    convertsLocalAssetToDataUrl:
      (exportedFirstImageNode?.props?.src ?? "").startsWith("data:image/"),
  });

  if (exportedFirstSlide?.background?.image?.src !== SAME_ORIGIN_REMOTE_BACKGROUND_URL) {
    throw new Error("导出 JSON 后远程背景图地址被意外改写");
  }

  if (!(exportedFirstImageNode?.props?.src ?? "").startsWith("data:image/")) {
    throw new Error("导出 JSON 后本地图片没有恢复成标准 data URL");
  }

  logStep("reload workspace and verify runtime recovery");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    Boolean(window.__CW_EDITOR_DEBUG__) && Boolean(window.__CW_DIAGNOSTICS__),
  );
  await waitForSaved(page);

  const runtimeSnapshotAfterReload = await readEditorSnapshot(page);
  const runtimeFirstSlideAfterReload = runtimeSnapshotAfterReload.document?.slides?.[0] ?? null;
  const runtimeFirstImageNodeAfterReload =
    runtimeFirstSlideAfterReload?.nodes?.find((node) => node.type === "image") ?? null;

  await writeJsonFile(
    path.join(ASSET_DIR, "runtime-snapshot-after-reload.json"),
    runtimeSnapshotAfterReload,
  );

  summary.checks.push({
    id: "runtime-recovery-after-reload",
    runtimeBackgroundSource: runtimeFirstSlideAfterReload?.background?.image?.src ?? null,
    runtimeImageSource: runtimeFirstImageNodeAfterReload?.props?.src ?? null,
    keepsRemoteBackgroundUrl:
      runtimeFirstSlideAfterReload?.background?.image?.src === SAME_ORIGIN_REMOTE_BACKGROUND_URL,
    hydratesLocalAssetToDataUrl:
      (runtimeFirstImageNodeAfterReload?.props?.src ?? "").startsWith("data:image/"),
  });

  if (runtimeFirstSlideAfterReload?.background?.image?.src !== SAME_ORIGIN_REMOTE_BACKGROUND_URL) {
    throw new Error("刷新后运行时背景图地址没有恢复成原远程 URL");
  }

  if (!(runtimeFirstImageNodeAfterReload?.props?.src ?? "").startsWith("data:image/")) {
    throw new Error("刷新后运行时本地图片没有恢复成 data URL");
  }

  logStep("switch current image to no-cors remote url and verify warning feedback");
  await page.evaluate(() => {
    window.__CW_DIAGNOSTICS__.clear();
  });
  await openEditorSide(page);
  await selectFirstImageNode(page);
  await updateSelectedImageSource(page, noCorsImageServer.imageUrl);
  await page.locator(".io-feedback").waitFor();
  const warningText = normalizeInlineText(await page.locator(".io-feedback").textContent());
  const diagnosticsAfterThumbnailFailure = await readDiagnosticEntries(page);
  const projectAfterRemoteImageSave = await readStoredProject(page, projectId);

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-after-thumbnail-warning.png"),
    fullPage: true,
  });
  await writeJsonFile(
    path.join(ASSET_DIR, "diagnostics-after-thumbnail-warning.json"),
    diagnosticsAfterThumbnailFailure,
  );
  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-remote-image-save.json"),
    projectAfterRemoteImageSave,
  );

  summary.checks.push({
    id: "thumbnail-warning-feedback",
    warningText,
    savedImageSource: readFirstImageNode(projectAfterRemoteImageSave)?.props?.src ?? null,
    diagnosticEvents: diagnosticsAfterThumbnailFailure.map((entry) => entry.event),
    hasEditorThumbnailFailure: diagnosticsAfterThumbnailFailure.some(
      (entry) => entry.event === "editor.thumbnail.capture.failed",
    ),
    hasProjectThumbnailSkip: diagnosticsAfterThumbnailFailure.some(
      (entry) => entry.event === "project.thumbnail.capture.skipped",
    ),
  });

  if (!warningText.includes("封面截图")) {
    throw new Error(`远程图片缩略图失败后没有看到明确警告：${warningText}`);
  }

  if (!diagnosticsAfterThumbnailFailure.some((entry) => entry.event === "editor.thumbnail.capture.failed")) {
    throw new Error("远程图片导致缩略图失败后，诊断日志里缺少 editor.thumbnail.capture.failed");
  }

  if (!diagnosticsAfterThumbnailFailure.some((entry) => entry.event === "project.thumbnail.capture.skipped")) {
    throw new Error("远程图片导致缩略图失败后，诊断日志里缺少 project.thumbnail.capture.skipped");
  }

  if (readFirstImageNode(projectAfterRemoteImageSave)?.props?.src !== noCorsImageServer.imageUrl) {
    throw new Error("远程图片地址保存后没有按原值写回项目存储");
  }
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
  await noCorsImageServer.close();
}

console.log(JSON.stringify(summary, null, 2));
