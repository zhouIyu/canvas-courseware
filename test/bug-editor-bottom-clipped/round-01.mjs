import path from "node:path";
import {
  attachPageErrorCollectors,
  ensureDirectory,
  launchBrowserSession,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";
/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve(
  "docs/test-reports/assets/2026-05-12-bug-editor-bottom-clipped-round-01",
);
/** 当前轮次验证使用的桌面视口。 */
const DESKTOP_VIEWPORT = {
  width: 1440,
  height: 900,
};
/** 缺陷验证前需强制展开的右侧面板标签。 */
const RIGHT_PANEL_TAB_NAME = "时间轴";
/** 容器底部允许超出视口的最大阈值。 */
const MAX_ALLOWED_BOTTOM_OVERFLOW_PX = 0;

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[bug-editor-bottom-clipped]", label);
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
 * 展开编辑器右侧管理栏并切到指定标签，稳定复现真实编辑场景。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openTimelinePanel(page) {
  const expandButton = page.getByRole("button", { name: "展开右侧管理栏" });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
  }

  await page.locator(".editor-side").waitFor();
  await page
    .locator(".editor-side .arco-tabs-tab")
    .filter({ hasText: RIGHT_PANEL_TAB_NAME })
    .first()
    .click();
  await page.waitForTimeout(400);
}

/**
 * 读取编辑页关键容器与滚动承载的底部快照。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{
 *   viewportHeight: number;
 *   bodyScrollHeight: number;
 *   documentScrollHeight: number;
 *   pageClientHeight: number | null;
 *   pageScrollHeight: number | null;
 *   pageOverflowY: string | null;
 *   stageOverflowY: string | null;
 *   elements: Record<string, {
 *     top: number | null;
 *     bottom: number | null;
 *     height: number | null;
 *     clientHeight: number | null;
 *     scrollHeight: number | null;
 *     overflowY: string | null;
 *   } | null>;
 * }>}
 */
async function readBottomVisibilitySnapshot(page) {
  return page.evaluate(() => {
    /**
     * 读取单个容器的几何与滚动信息。
     *
     * @param {string} selector
     * @returns {{
     *   top: number | null;
     *   bottom: number | null;
     *   height: number | null;
     *   clientHeight: number | null;
     *   scrollHeight: number | null;
     *   overflowY: string | null;
     * } | null}
     */
    const readBox = (selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();

      return {
        top: Number(rect.top.toFixed(4)),
        bottom: Number(rect.bottom.toFixed(4)),
        height: Number(rect.height.toFixed(4)),
        clientHeight: element instanceof HTMLElement ? element.clientHeight : null,
        scrollHeight: element instanceof HTMLElement ? element.scrollHeight : null,
        overflowY: getComputedStyle(element).overflowY,
      };
    };

    const workspacePage = document.querySelector(".workspace-page");
    const workspaceStage = document.querySelector(".workspace-stage");

    return {
      viewportHeight: window.innerHeight,
      bodyScrollHeight: document.body.scrollHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      pageClientHeight:
        workspacePage instanceof HTMLElement ? workspacePage.clientHeight : null,
      pageScrollHeight:
        workspacePage instanceof HTMLElement ? workspacePage.scrollHeight : null,
      pageOverflowY: workspacePage ? getComputedStyle(workspacePage).overflowY : null,
      stageOverflowY: workspaceStage ? getComputedStyle(workspaceStage).overflowY : null,
      elements: {
        ".workspace-page": readBox(".workspace-page"),
        ".workspace-stage": readBox(".workspace-stage"),
        ".editor-shell": readBox(".editor-shell"),
        ".editor-workbench": readBox(".editor-workbench"),
        ".editor-layout": readBox(".editor-layout"),
        ".slide-rail-host": readBox(".slide-rail-host"),
        ".workspace-shell": readBox(".workspace-shell"),
        ".editor-side": readBox(".editor-side"),
        ".editor-side-body": readBox(".editor-side-body"),
      },
    };
  });
}

/**
 * 计算目标容器底部超出视口的像素值。
 *
 * @param {{
 *   viewportHeight: number;
 *   elements: Record<string, { bottom: number | null; } | null>;
 * }} snapshot
 * @param {string} selector
 * @returns {number | null}
 */
function resolveBottomOverflow(snapshot, selector) {
  const target = snapshot.elements[selector];
  if (!target || target.bottom === null) {
    return null;
  }

  return Number((target.bottom - snapshot.viewportHeight).toFixed(4));
}

/**
 * 断言关键容器底部没有越出视口；如果越出，则页面必须提供纵向滚动承载。
 *
 * @param {{
 *   viewportHeight: number;
 *   bodyScrollHeight: number;
 *   documentScrollHeight: number;
 *   pageClientHeight: number | null;
 *   pageScrollHeight: number | null;
 *   pageOverflowY: string | null;
 *   elements: Record<string, {
 *     bottom: number | null;
 *   } | null>;
 * }} snapshot
 * @returns {void}
 */
function assertEditorBottomVisible(snapshot) {
  const targetSelectors = [
    ".editor-shell",
    ".editor-layout",
    ".slide-rail-host",
    ".workspace-shell",
    ".editor-side",
  ];
  const overflowPairs = targetSelectors.map((selector) => ({
    selector,
    overflow: resolveBottomOverflow(snapshot, selector),
  }));
  const clippedTargets = overflowPairs.filter(
    (pair) => pair.overflow !== null && pair.overflow > MAX_ALLOWED_BOTTOM_OVERFLOW_PX,
  );

  if (clippedTargets.length === 0) {
    return;
  }

  const allowsPageVerticalScroll =
    snapshot.pageOverflowY === "auto" || snapshot.pageOverflowY === "scroll";
  const pageHasVerticalOverflow =
    snapshot.bodyScrollHeight > snapshot.viewportHeight ||
    snapshot.documentScrollHeight > snapshot.viewportHeight ||
    (snapshot.pageScrollHeight !== null &&
      snapshot.pageClientHeight !== null &&
      snapshot.pageScrollHeight > snapshot.pageClientHeight);
  const hasVerticalScrollCarrier = allowsPageVerticalScroll && pageHasVerticalOverflow;

  if (hasVerticalScrollCarrier) {
    return;
  }

  const detail = clippedTargets
    .map((pair) => `${pair.selector}: +${pair.overflow}px`)
    .join(", ");
  throw new Error(
    `编辑页底部被裁切且没有纵向滚动承载：${detail}; pageOverflowY=${snapshot.pageOverflowY}, pageScrollHeight=${snapshot.pageScrollHeight}, viewportHeight=${snapshot.viewportHeight}`,
  );
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, context, page } = await launchBrowserSession(DESKTOP_VIEWPORT);
/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  viewport: DESKTOP_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open demo project");
  await openDemoProject(page);

  logStep("open timeline panel");
  await openTimelinePanel(page);

  logStep("read bottom visibility snapshot");
  const snapshot = await readBottomVisibilitySnapshot(page);
  const overflowBySelector = Object.fromEntries(
    Object.keys(snapshot.elements).map((selector) => [
      selector,
      resolveBottomOverflow(snapshot, selector),
    ]),
  );

  summary.checks.push({
    id: "editor-bottom-visibility",
    pageOverflowY: snapshot.pageOverflowY,
    stageOverflowY: snapshot.stageOverflowY,
    pageScrollHeight: snapshot.pageScrollHeight,
    pageClientHeight: snapshot.pageClientHeight,
    bodyScrollHeight: snapshot.bodyScrollHeight,
    documentScrollHeight: snapshot.documentScrollHeight,
    overflowBySelector,
    snapshot,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-bottom-clipped.png"),
    fullPage: false,
  });

  assertEditorBottomVisible(snapshot);
} catch (error) {
  summary.error = error instanceof Error ? error.message : String(error);

  try {
    await page.screenshot({
      path: path.join(ASSET_DIR, "editor-bottom-clipped-failure.png"),
      fullPage: false,
    });
  } catch {
    // 截图失败时保留原始错误即可。
  }

  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await context.close();
  await browser.close();
}
