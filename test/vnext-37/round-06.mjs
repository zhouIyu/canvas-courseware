import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  normalizeInlineText,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址，允许在端口占用时临时覆写。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-14-vnext-37-f-round-02");

/**
 * 打印测试步骤，便于定位执行进度。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext37-f-test]", label);
}

/**
 * 条件不满足时抛出清晰错误。
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
 * 读取目标元素的文本并规整空白符。
 *
 * @param {import("playwright").Page} page
 * @param {string} selector
 * @returns {Promise<string>}
 */
async function readNormalizedText(page, selector) {
  return normalizeInlineText(await page.locator(selector).innerText());
}

/**
 * 打开默认 demo 项目并切到预览模式。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openPreviewWorkspace(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
  await page.getByRole("button", { name: "打开" }).first().click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page
    .locator(".workspace-mode-switch .arco-radio-button")
    .filter({ hasText: "预览" })
    .click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=preview$/);
  await page.locator(".preview-shell .preview-primary-button").waitFor();
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(DEFAULT_VIEWPORT);

/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  assetDir: ASSET_DIR,
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  desktopViewport: DEFAULT_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open preview workspace");
  await openPreviewWorkspace(page);

  logStep("verify central insight strip and floating status card have been removed");
  const initialMetrics = await page.locator(".preview-stage-shell").evaluate((element) => {
    const frame = element.querySelector(".preview-stage-frame");
    const badge = element.querySelector(".preview-status-badge");
    const bridge = element.querySelector(".preview-progress-bridge");
    const insightStrip = element.querySelector(".playback-insight-strip");
    const viewport = element.querySelector(".preview-stage-viewport");
    const stageHead = element.querySelector(".stage-head");

    if (
      !(frame instanceof HTMLElement) ||
      !(bridge instanceof HTMLElement) ||
      !(viewport instanceof HTMLElement) ||
      !(stageHead instanceof HTMLElement)
    ) {
      throw new Error("VNext-37-F 预览中心区域结构不完整");
    }

    const viewportRect = viewport.getBoundingClientRect();
    const stageHeadRect = stageHead.getBoundingClientRect();

    return {
      hasInsightStrip: Boolean(insightStrip),
      hasBadge: Boolean(badge),
      viewportHeight: Math.round(viewportRect.height),
      stageHeadHeight: Math.round(stageHeadRect.height),
      bridgeText: bridge.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });

  summary.checks.push({
    id: "initial-layout",
    ...initialMetrics,
  });

  assertOrThrow(!initialMetrics.hasInsightStrip, "预览中心区域仍然存在旧的底部信息条。");
  assertOrThrow(
    !initialMetrics.hasBadge,
    "预览中心区域仍然渲染了右上角浮动状态卡。",
  );
  assertOrThrow(
    initialMetrics.bridgeText.includes("已完成 0 / 2 页") &&
      initialMetrics.bridgeText.includes("第 1 / 2 页"),
    `预览进度桥接文案异常：${initialMetrics.bridgeText}`,
  );

  logStep("verify sidebar summary remains the only visible progress carrier");
  const sidebarHeadingText = await readNormalizedText(page, ".timeline-heading p");
  const sidebarSummaryText = await readNormalizedText(page, ".timeline-summary-card");

  summary.checks.push({
    id: "sidebar-summary-only",
    sidebarHeadingText,
    sidebarSummaryText,
  });

  assertOrThrow(
    sidebarHeadingText.includes("已完成 0 / 2 页"),
    `右侧步骤栏顶部未承接课件级进度：${sidebarHeadingText}`,
  );
  assertOrThrow(
    sidebarSummaryText.includes("当前页") &&
      sidebarSummaryText.includes("课件进度") &&
      sidebarSummaryText.includes("0/2 步"),
    `右侧步骤栏摘要结构异常：${sidebarSummaryText}`,
  );

  logStep("advance one step and verify sidebar summary still updates without floating card");
  await page.locator(".preview-primary-button").first().click();
  await page.waitForFunction(() => {
    const summaryCard = document.querySelector(".timeline-summary-card");
    return summaryCard?.textContent?.includes("1/2 步") ?? false;
  });

  const postPlaySidebarHeadingText = await readNormalizedText(page, ".timeline-heading p");
  const postPlaySidebarSummaryText = await readNormalizedText(page, ".timeline-summary-card");
  const postPlayFloatingCardCount = await page.locator(".preview-status-badge").count();

  summary.checks.push({
    id: "post-play-state",
    postPlaySidebarHeadingText,
    postPlaySidebarSummaryText,
    postPlayFloatingCardCount,
  });

  assertOrThrow(
    postPlayFloatingCardCount === 0,
    `播放一步后仍然出现了浮动状态卡：${postPlayFloatingCardCount}`,
  );
  assertOrThrow(
    postPlaySidebarHeadingText.includes("已完成 0 / 2 页"),
    `播放一步后右侧课件级进度不应提前记为整页完成：${postPlaySidebarHeadingText}`,
  );
  assertOrThrow(
    postPlaySidebarSummaryText.includes("1/2 步"),
    `播放一步后右侧步骤摘要未正确更新：${postPlaySidebarSummaryText}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-right-sidebar-summary.png"),
    fullPage: true,
  });

  assertOrThrow(consoleErrors.length === 0, `页面存在控制台错误：${consoleErrors.join(" | ")}`);
  assertOrThrow(pageErrors.length === 0, `页面存在运行时错误：${pageErrors.join(" | ")}`);
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}
