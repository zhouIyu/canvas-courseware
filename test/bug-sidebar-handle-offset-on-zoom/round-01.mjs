import path from "node:path";
import {
  attachPageErrorCollectors,
  ensureDirectory,
  launchBrowserSession,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";
/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve(
  "docs/test-reports/assets/2026-04-10-bug-sidebar-handle-offset-on-zoom-round-02",
);
/** 用来模拟浏览器缩放后的窄桌面视口。 */
const ZOOMED_DESKTOP_VIEWPORT = {
  width: 960,
  height: 760,
};
/** 工作台在桌面模式下锁定的最小宽度。 */
const WORKSPACE_MIN_WIDTH_PX = 1280;
/** 允许侧栏 handle 偏离栏位分界线的最大阈值。 */
const HANDLE_ALIGNMENT_THRESHOLD_PX = 24;
/** 编辑器页面栏在桌面布局下允许的最小高度。 */
const MIN_EDITOR_RAIL_HEIGHT_PX = 160;
/** 宽度断言允许的浮动阈值。 */
const WIDTH_TOLERANCE_PX = 1;

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[bug-sidebar-handle-offset-on-zoom]", label);
}

/**
 * 打开默认示例项目并进入编辑工作台。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openDemoProject(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
  await page.getByRole("button", { name: "打开" }).first().click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.waitForTimeout(1200);
}

/**
 * 展开编辑器右侧管理栏，确保编辑态真正进入三栏布局。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openEditorSide(page) {
  const toggleButton = page.getByRole("button", { name: "展开右侧管理栏" });
  if (!(await toggleButton.isVisible().catch(() => false))) {
    return;
  }

  await toggleButton.click();
  await page.locator(".editor-side").waitFor();
  await page.waitForTimeout(300);
}

/**
 * 统计当前 grid 模板里一共解析出了多少列。
 *
 * @param {string | null} template
 * @returns {number}
 */
function resolveGridColumnCount(template) {
  return template?.split(/\s+/).filter(Boolean).length ?? 0;
}

/**
 * 计算 handle 中心点与“页面栏 / 主工作区”分界线中点之间的偏差。
 *
 * @param {{
 *   badge: { left: number; right: number; } | null;
 *   rail: { right: number; height: number; } | null;
 *   stage: { left: number; } | null;
 * }} snapshot
 * @returns {number | null}
 */
function resolveHandleBoundaryOffset(snapshot) {
  if (!snapshot.badge || !snapshot.rail || !snapshot.stage) {
    return null;
  }

  const badgeCenter = (snapshot.badge.left + snapshot.badge.right) / 2;
  const boundaryCenter = (snapshot.rail.right + snapshot.stage.left) / 2;
  return Number(Math.abs(badgeCenter - boundaryCenter).toFixed(4));
}

/**
 * 断言工作台已经锁定到最小 1280px 宽度，并通过横向滚动承载窄视口。
 *
 * @param {{
 *   pageWidth: number | null;
 *   pageClientWidth: number | null;
 *   pageScrollWidth: number | null;
 *   topbarWidth: number | null;
 *   stageWidth: number | null;
 * }} snapshot
 * @param {string} modeLabel
 * @returns {void}
 */
function assertWorkspaceMinWidth(snapshot, modeLabel) {
  if (
    snapshot.topbarWidth === null ||
    snapshot.stageWidth === null ||
    snapshot.pageClientWidth === null ||
    snapshot.pageScrollWidth === null
  ) {
    throw new Error(`${modeLabel} 未读取到完整的工作台宽度快照`);
  }

  if (snapshot.topbarWidth < WORKSPACE_MIN_WIDTH_PX - WIDTH_TOLERANCE_PX) {
    throw new Error(`${modeLabel} 顶部工具区未锁定到最小 ${WORKSPACE_MIN_WIDTH_PX}px：${snapshot.topbarWidth}`);
  }

  if (snapshot.stageWidth < WORKSPACE_MIN_WIDTH_PX - WIDTH_TOLERANCE_PX) {
    throw new Error(`${modeLabel} 内容区未锁定到最小 ${WORKSPACE_MIN_WIDTH_PX}px：${snapshot.stageWidth}`);
  }

  if (snapshot.pageScrollWidth <= snapshot.pageClientWidth) {
    throw new Error(
      `${modeLabel} 在窄视口下没有产生横向滚动承载最小宽度：scroll=${snapshot.pageScrollWidth}, client=${snapshot.pageClientWidth}`,
    );
  }
}

/**
 * 断言编辑器在缩放后的窄桌面宽度下仍保持桌面布局，且左侧 handle 没有漂进工作区。
 *
 * @param {{
 *   badge: { left: number; right: number; } | null;
 *   rail: { right: number; height: number; } | null;
 *   stage: { left: number; } | null;
 *   gridTemplateColumns: string | null;
 * }} snapshot
 * @returns {void}
 */
function assertEditorLayoutStable(snapshot) {
  const columnCount = resolveGridColumnCount(snapshot.gridTemplateColumns);
  if (columnCount < 3) {
    throw new Error(`编辑器布局在 960px 视口下意外退化为 ${columnCount} 列：${snapshot.gridTemplateColumns}`);
  }

  if (!snapshot.rail || snapshot.rail.height < MIN_EDITOR_RAIL_HEIGHT_PX) {
    throw new Error(`编辑器左侧页面栏高度异常：${snapshot.rail?.height ?? "null"}px`);
  }

  const offset = resolveHandleBoundaryOffset(snapshot);
  if (offset === null || offset > HANDLE_ALIGNMENT_THRESHOLD_PX) {
    throw new Error(`编辑器左侧 handle 偏离分界线：offset=${offset}`);
  }
}

/**
 * 断言预览器在缩放后的窄桌面宽度下仍保持三栏结构，且左侧 handle 没有漂进页面内容区。
 *
 * @param {{
 *   badge: { left: number; right: number; } | null;
 *   rail: { right: number; } | null;
 *   stage: { left: number; } | null;
 *   gridTemplateColumns: string | null;
 * }} snapshot
 * @returns {void}
 */
function assertPreviewLayoutStable(snapshot) {
  const columnCount = resolveGridColumnCount(snapshot.gridTemplateColumns);
  if (columnCount < 3) {
    throw new Error(`预览器布局在 960px 视口下意外退化为 ${columnCount} 列：${snapshot.gridTemplateColumns}`);
  }

  const offset = resolveHandleBoundaryOffset(snapshot);
  if (offset === null || offset > HANDLE_ALIGNMENT_THRESHOLD_PX) {
    throw new Error(`预览器左侧 handle 偏离分界线：offset=${offset}`);
  }
}

/**
 * 读取工作台壳层的宽度与滚动快照。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{
 *   pageWidth: number | null;
 *   pageClientWidth: number | null;
 *   pageScrollWidth: number | null;
 *   topbarWidth: number | null;
 *   stageWidth: number | null;
 * }>}
 */
async function readWorkspaceShellSnapshot(page) {
  return page.evaluate(() => {
    const workspacePage = document.querySelector(".workspace-page");
    const workspaceTopbar = document.querySelector(".workspace-topbar");
    const workspaceStage = document.querySelector(".workspace-stage");

    return {
      pageWidth: workspacePage?.getBoundingClientRect().width ?? null,
      pageClientWidth: workspacePage instanceof HTMLElement ? workspacePage.clientWidth : null,
      pageScrollWidth: workspacePage instanceof HTMLElement ? workspacePage.scrollWidth : null,
      topbarWidth: workspaceTopbar?.getBoundingClientRect().width ?? null,
      stageWidth: workspaceStage?.getBoundingClientRect().width ?? null,
    };
  });
}

/**
 * 读取编辑器三栏布局与左侧 handle 的定位快照。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{
 *   badge: { left: number; right: number; top: number; width: number; height: number; } | null;
 *   rail: { left: number; right: number; top: number; width: number; height: number; } | null;
 *   stage: { left: number; right: number; top: number; width: number; height: number; } | null;
 *   gridTemplateColumns: string | null;
 * }>}
 */
async function readEditorLayoutSnapshot(page) {
  return page.evaluate(() => {
    const badge = document.querySelector(".stage-side-badge-left");
    const rail = document.querySelector(".slide-rail-host");
    const stage = document.querySelector(".workspace-shell");
    const layout = document.querySelector(".editor-layout");
    const rect = (element) =>
      element
        ? {
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
            top: element.getBoundingClientRect().top,
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          }
        : null;

    return {
      badge: rect(badge),
      rail: rect(rail),
      stage: rect(stage),
      gridTemplateColumns: layout ? getComputedStyle(layout).gridTemplateColumns : null,
    };
  });
}

/**
 * 读取预览器三栏布局与左侧 handle 的定位快照。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{
 *   badge: { left: number; right: number; top: number; width: number; height: number; } | null;
 *   rail: { left: number; right: number; top: number; width: number; height: number; } | null;
 *   stage: { left: number; right: number; top: number; width: number; height: number; } | null;
 *   gridTemplateColumns: string | null;
 * }>}
 */
async function readPreviewLayoutSnapshot(page) {
  return page.evaluate(() => {
    const badge = document.querySelector(".preview-side-badge-left");
    const rail = document.querySelector(".preview-rail");
    const stage = document.querySelector(".preview-stage-shell");
    const layout = document.querySelector(".preview-layout");
    const rect = (element) =>
      element
        ? {
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
            top: element.getBoundingClientRect().top,
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
          }
        : null;

    return {
      badge: rect(badge),
      rail: rect(rail),
      stage: rect(stage),
      gridTemplateColumns: layout ? getComputedStyle(layout).gridTemplateColumns : null,
    };
  });
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(ZOOMED_DESKTOP_VIEWPORT);
/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  viewport: ZOOMED_DESKTOP_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open demo project");
  await openDemoProject(page);

  logStep("open editor side panel");
  await openEditorSide(page);

  logStep("read editor workspace shell snapshot");
  const editorWorkspaceSnapshot = await readWorkspaceShellSnapshot(page);
  assertWorkspaceMinWidth(editorWorkspaceSnapshot, "编辑态");

  logStep("read editor layout snapshot");
  const editorSnapshot = await readEditorLayoutSnapshot(page);
  assertEditorLayoutStable(editorSnapshot);
  summary.checks.push({
    id: "editor-workspace-min-width",
    snapshot: editorWorkspaceSnapshot,
  });
  summary.checks.push({
    id: "editor-handle-docked",
    snapshot: editorSnapshot,
    boundaryOffset: resolveHandleBoundaryOffset(editorSnapshot),
    gridColumnCount: resolveGridColumnCount(editorSnapshot.gridTemplateColumns),
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-zoomed-desktop.png"),
    fullPage: true,
  });

  logStep("switch to preview mode");
  await page.goto(page.url().replace("mode=edit", "mode=preview"), { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  logStep("read preview workspace shell snapshot");
  const previewWorkspaceSnapshot = await readWorkspaceShellSnapshot(page);
  assertWorkspaceMinWidth(previewWorkspaceSnapshot, "预览态");

  logStep("read preview layout snapshot");
  const previewSnapshot = await readPreviewLayoutSnapshot(page);
  assertPreviewLayoutStable(previewSnapshot);
  summary.checks.push({
    id: "preview-workspace-min-width",
    snapshot: previewWorkspaceSnapshot,
  });
  summary.checks.push({
    id: "preview-handle-docked",
    snapshot: previewSnapshot,
    boundaryOffset: resolveHandleBoundaryOffset(previewSnapshot),
    gridColumnCount: resolveGridColumnCount(previewSnapshot.gridTemplateColumns),
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-zoomed-desktop.png"),
    fullPage: true,
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(
      `自动化执行期间捕获到错误；console=${consoleErrors.length}, page=${pageErrors.length}`,
    );
  }

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
} finally {
  await browser.close();
}
