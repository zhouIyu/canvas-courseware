import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  readStoredProjects,
  readViewportMetrics,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";
import { loadChromium } from "../shared/playwright-runtime.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-13-vnext-32-round-02");

/** 当前轮次固定使用的 Chrome 可执行文件路径。 */
const CHROME_EXECUTABLE_PATH =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext32-test]", label);
}

/**
 * 启动一套基于本机 Google Chrome 的无头浏览器会话。
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
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
  };
}

/**
 * 拦截浏览器默认发起的 favicon 请求，避免测试因为开发服务未提供图标而产生无关 404。
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
 * 从当前地址中提取工作台项目 id，供读取本地持久化结果时复用。
 *
 * @param {string} currentUrl
 * @returns {string}
 */
function extractProjectId(currentUrl) {
  return currentUrl.match(/\/projects\/([^?]+)/)?.[1] ?? "";
}

/**
 * 读取工作台当前的首屏渲染状态，便于在报错时快速判断页面是否已挂起。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, unknown>>}
 */
async function readWorkspaceSnapshot(page) {
  const viewportMetrics = await readViewportMetrics(page);
  const domSnapshot = await page.evaluate(() => ({
    currentUrl: window.location.href,
    documentTitle: document.title,
    bodyTextLength: document.body.innerText.length,
    bodyHtmlLength: document.body.innerHTML.length,
    hasWorkspacePage: Boolean(document.querySelector(".workspace-page")),
    hasWorkspaceTopbar: Boolean(document.querySelector(".workspace-topbar")),
    hasProjectTitleInput: Boolean(
      document.querySelector('.workspace-topbar .title-input input[placeholder="请输入项目标题"]'),
    ),
    hasEditorShell: Boolean(document.querySelector(".editor-shell")),
  }));

  return {
    ...domSnapshot,
    ...viewportMetrics,
  };
}

/**
 * 读取预览模式首屏状态，确认切换后预览壳层、画布区和侧栏都已完成渲染。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, unknown>>}
 */
async function readPreviewSnapshot(page) {
  const viewportMetrics = await readViewportMetrics(page);
  const domSnapshot = await page.evaluate(() => ({
    currentUrl: window.location.href,
    hasPreviewShell: Boolean(document.querySelector(".preview-shell")),
    hasPreviewRail: Boolean(document.querySelector(".preview-rail")),
    hasPreviewStageSurface: Boolean(document.querySelector(".preview-stage-surface")),
    hasPreviewTimeline: Boolean(document.querySelector(".preview-side.timeline-shell")),
  }));

  return {
    ...domSnapshot,
    ...viewportMetrics,
  };
}

/**
 * 从本地存储中读取当前测试项目记录，确认插入与保存结果已经真正落盘。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<any | null>}
 */
async function readStoredProject(page, projectId) {
  const projects = await readStoredProjects(page, STORAGE_KEY);
  return findProjectById(projects, projectId);
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, context, page } = await launchChromeBrowserSession();

/** 拦截 favicon 404，避免把静态资源缺失误判成业务异常。 */
await interceptFaviconRequest(page);

/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  browser: "Google Chrome Headless",
  chromeExecutablePath: CHROME_EXECUTABLE_PATH,
  desktopViewport: DEFAULT_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open project list");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  logStep("create blank project");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.locator(".editor-shell").waitFor();
  await waitForSaved(page);

  /** 当前自动创建项目的唯一 id。 */
  const projectId = extractProjectId(page.url());
  if (!projectId) {
    throw new Error("未能从工作台地址中解析出项目 id");
  }

  logStep("capture workspace entry snapshot");
  const workspaceSnapshot = await readWorkspaceSnapshot(page);
  summary.checks.push({
    id: "workspace-entry",
    projectId,
    titleValue: await page.getByLabel("项目标题").inputValue(),
    ...workspaceSnapshot,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-entry.png"),
    fullPage: true,
  });

  if (pageErrors.length > 0) {
    throw new Error(`进入工作台后出现运行时异常：${pageErrors[0]}`);
  }

  if (!workspaceSnapshot.hasProjectTitleInput) {
    throw new Error("进入工作台后未渲染出“项目标题”输入框");
  }

  logStep("insert text node and wait for persistence");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);

  /** 新增文本节点后的项目持久化快照。 */
  const projectAfterInsert = await readStoredProject(page, projectId);
  /** 当前首页 slide，用于确认新增节点已真正写回本地存储。 */
  const firstSlideAfterInsert = projectAfterInsert?.document?.slides?.[0] ?? null;
  /** 当前首页新增的文本节点。 */
  const insertedTextNode =
    firstSlideAfterInsert?.nodes?.find((node) => node.type === "text") ?? null;

  summary.checks.push({
    id: "insert-text",
    firstSlideNodeCount: firstSlideAfterInsert?.nodes?.length ?? 0,
    insertedTextNodeId: insertedTextNode?.id ?? null,
    insertedTextContent: insertedTextNode?.props?.text ?? null,
  });

  if (!insertedTextNode) {
    throw new Error("插入文本后，未能在本地持久化记录中读取到新增文本节点");
  }

  logStep("trigger manual save");
  await page.getByRole("button", { name: "保存" }).click();
  await waitForSaved(page);

  summary.checks.push({
    id: "manual-save",
    saveMetaText: await page.locator(".save-inline-meta").innerText(),
  });

  logStep("switch to preview mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-shell").waitFor();
  await page.waitForTimeout(800);

  const previewSnapshot = await readPreviewSnapshot(page);
  summary.checks.push({
    id: "preview-mode",
    ...previewSnapshot,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-entry.png"),
    fullPage: true,
  });

  if (!previewSnapshot.hasPreviewShell || !previewSnapshot.hasPreviewStageSurface) {
    throw new Error("切换到预览模式后，预览壳层或画布区未正常渲染");
  }

  logStep("switch back to edit mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "编辑" }).click();
  await page.waitForURL(/mode=edit$/);
  await page.locator(".editor-shell").waitFor();
  await waitForSaved(page);

  summary.checks.push({
    id: "return-to-edit",
    ...await readWorkspaceSnapshot(page),
  });

  if (consoleErrors.length > 0) {
    throw new Error(`页面存在控制台错误：${consoleErrors.join(" | ")}`);
  }

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
} catch (error) {
  summary.failure = String(error);
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  throw error;
} finally {
  await page.close();
  await context.close();
  await browser.close();
}
