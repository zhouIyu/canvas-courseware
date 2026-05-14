import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  normalizeInlineText,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve(
  "docs/test-reports/assets/2026-05-14-bug-preview-single-slide-card-height-round-01",
);

/** 单页预览左栏卡片允许占据列表高度的最大比例。 */
const MAX_CARD_HEIGHT_RATIO = 0.6;

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[bug-preview-single-slide-card-height]", label);
}

/**
 * 在断言失败时抛出更清晰的问题描述。
 *
 * @param {unknown} condition
 * @param {string} message
 * @returns {void}
 */
function assertOrThrow(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 打开首页并清理项目存储，确保本轮从单页新项目开始。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openCleanProjectList(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
}

/**
 * 创建一个只有默认第一页的新项目，并进入编辑工作台。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectTitle
 * @returns {Promise<void>}
 */
async function createSingleSlideProject(page, projectTitle) {
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.locator("#project-title-input input").fill(projectTitle);
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
}

/**
 * 从编辑态切到预览态，并等待左侧单页卡片完成渲染。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function switchToPreviewMode(page) {
  await page
    .locator(".workspace-mode-switch .arco-radio-button")
    .filter({ hasText: "预览" })
    .click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=preview$/);
  await page.locator(".preview-rail .slide-card").first().waitFor();
}

/**
 * 读取单页预览左栏列表与页卡的几何信息。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{
 *   cardCount: number;
 *   listHeight: number;
 *   cardHeight: number;
 *   cardTopOffset: number;
 *   cardHeightRatio: number;
 *   summaryText: string;
 * }>}
 */
async function readSingleSlideCardMetrics(page) {
  return page.evaluate(() => {
    const listElement = document.querySelector(".slide-chip-list");
    const cardElement = document.querySelector(".preview-rail .slide-card");
    const summaryElement = document.querySelector(".slide-rail-summary");
    const listRect = listElement?.getBoundingClientRect();
    const cardRect = cardElement?.getBoundingClientRect();

    return {
      cardCount: document.querySelectorAll(".preview-rail .slide-card").length,
      listHeight: Number(listRect?.height ?? 0),
      cardHeight: Number(cardRect?.height ?? 0),
      cardTopOffset: Number((cardRect?.top ?? 0) - (listRect?.top ?? 0)),
      cardHeightRatio:
        listRect && cardRect && listRect.height > 0 ? cardRect.height / listRect.height : 0,
      summaryText: summaryElement?.textContent ?? "",
    };
  });
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(DEFAULT_VIEWPORT);

/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  desktopViewport: DEFAULT_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  const projectTitle = `单页预览左栏高度回归 ${Date.now()}`;

  logStep("open clean project list");
  await openCleanProjectList(page);

  logStep("create single-slide project");
  await createSingleSlideProject(page, projectTitle);

  logStep("switch to preview mode");
  await switchToPreviewMode(page);

  const metrics = await readSingleSlideCardMetrics(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "single-slide-preview-sidebar.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "single-slide-preview-sidebar",
    projectTitle,
    metrics,
  });

  assertOrThrow(metrics.cardCount === 1, `预览左栏页卡数量异常：${metrics.cardCount}`);
  assertOrThrow(
    normalizeInlineText(metrics.summaryText).includes("1 / 1 页"),
    `预览左栏摘要未处于单页状态：${normalizeInlineText(metrics.summaryText)}`,
  );
  assertOrThrow(metrics.listHeight > 0, "预览左栏列表高度异常，未读取到有效列表高度。");
  assertOrThrow(metrics.cardHeight > 0, "预览左栏页卡高度异常，未读取到有效页卡高度。");
  assertOrThrow(
    metrics.cardTopOffset >= 0 && metrics.cardTopOffset < 40,
    `预览左栏页卡未贴顶排列，顶部偏移异常：${metrics.cardTopOffset}px`,
  );
  assertOrThrow(
    metrics.cardHeightRatio < MAX_CARD_HEIGHT_RATIO,
    `预览左栏单页卡片高度被异常拉伸，占列表高度比例为 ${(metrics.cardHeightRatio * 100).toFixed(2)}%`,
  );
  assertOrThrow(
    consoleErrors.length === 0,
    `检测到控制台错误：${consoleErrors.join(" | ")}`,
  );
  assertOrThrow(
    pageErrors.length === 0,
    `检测到运行时错误：${pageErrors.join(" | ")}`,
  );
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
