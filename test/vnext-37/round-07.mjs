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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-13-preview-right-sidebar-round-01");

/**
 * 打印测试步骤，便于定位执行进度。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[preview-right-sidebar-test]", label);
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

  logStep("verify right sidebar compact summary and step-card density");
  const sidebarMetrics = await page.locator(".timeline-shell").evaluate((element) => {
    const summaryCard = element.querySelector(".timeline-summary-card");
    const summaryCopy = element.querySelector(".timeline-summary-card__copy");
    const summaryMeta = element.querySelector(".timeline-summary-card__meta");
    const summaryRows = [
      ...element.querySelectorAll(".timeline-summary-card__row"),
    ];
    const legacyHint = element.querySelector(".timeline-steps-hint");
    const firstStepCard = element.querySelector(".steps-list .preview-step-card");
    const firstStepTop = element.querySelector(".steps-list .preview-step-card__top");
    const firstStepBottom = element.querySelector(".steps-list .preview-step-card__bottom");
    const firstStepHeadline = element.querySelector(".steps-list .preview-step-card__headline");

    if (
      !(summaryCard instanceof HTMLElement) ||
      !(summaryCopy instanceof HTMLElement) ||
      !(summaryMeta instanceof HTMLElement) ||
      summaryRows.length !== 2 ||
      !(firstStepCard instanceof HTMLElement) ||
      !(firstStepTop instanceof HTMLElement) ||
      !(firstStepBottom instanceof HTMLElement) ||
      !(firstStepHeadline instanceof HTMLElement)
    ) {
      throw new Error("预览右侧栏结构不完整，无法完成布局验证");
    }

    const summaryCardRect = summaryCard.getBoundingClientRect();
    const firstStepCardRect = firstStepCard.getBoundingClientRect();

    return {
      hasLegacyHint: Boolean(legacyHint),
      summaryCardHeight: Math.round(summaryCardRect.height),
      summaryRowCount: summaryRows.length,
      firstStepCardHeight: Math.round(firstStepCardRect.height),
      firstStepCardPaddingLeft: Math.round(parseFloat(getComputedStyle(firstStepCard).paddingLeft)),
      firstStepHeadlineGap: Math.round(parseFloat(getComputedStyle(firstStepHeadline).columnGap || getComputedStyle(firstStepHeadline).gap || "0")),
      firstStepTopAlign: getComputedStyle(firstStepTop).justifyContent,
      firstStepBottomAlign: getComputedStyle(firstStepBottom).justifyContent,
      summaryMetaText: summaryMeta.textContent?.replace(/\s+/g, " ").trim() ?? "",
      summaryCopyText: summaryCopy.textContent?.replace(/\s+/g, " ").trim() ?? "",
      summaryRowsText: summaryRows.map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? ""),
    };
  });

  const summaryCardText = await readNormalizedText(page, ".timeline-summary-card");
  const firstStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );
  const secondStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(2) .preview-step-status",
  );

  summary.checks.push({
    id: "sidebar-initial-density",
    ...sidebarMetrics,
    summaryCardText,
    firstStepStatus,
    secondStepStatus,
  });

  assertOrThrow(!sidebarMetrics.hasLegacyHint, "右侧步骤栏仍残留旧的步骤提示区块。");
  assertOrThrow(
    sidebarMetrics.summaryRowCount === 2,
    `右侧摘要卡片统计行数量异常：${sidebarMetrics.summaryRowCount}`,
  );
  assertOrThrow(
    sidebarMetrics.firstStepCardHeight <= 78,
    `右侧步骤卡片高度未按预期压缩：${sidebarMetrics.firstStepCardHeight}px`,
  );
  assertOrThrow(
    sidebarMetrics.summaryCardHeight <= 126,
    `右侧摘要卡片高度偏大：${sidebarMetrics.summaryCardHeight}px`,
  );
  assertOrThrow(
    sidebarMetrics.firstStepTopAlign === "space-between" &&
      sidebarMetrics.firstStepBottomAlign === "space-between",
    `右侧步骤卡片顶部/底部未按双行结构对齐：${sidebarMetrics.firstStepTopAlign} / ${sidebarMetrics.firstStepBottomAlign}`,
  );
  assertOrThrow(
    summaryCardText.includes("当前页") &&
      summaryCardText.includes("课件进度") &&
      summaryCardText.includes("第 1 / 2 页"),
    `右侧摘要卡片文案异常：${summaryCardText}`,
  );
  assertOrThrow(firstStepStatus.includes("待触发"), `首屏第 1 步状态异常：${firstStepStatus}`);
  assertOrThrow(secondStepStatus.includes("待执行"), `首屏第 2 步状态异常：${secondStepStatus}`);

  logStep("advance one step and verify compact completed state");
  await page.locator(".preview-primary-button").first().click();
  await page.waitForFunction(() => {
    const secondStatus = document.querySelector(
      ".steps-list .preview-step-card:nth-child(2) .preview-step-status",
    );
    const text = secondStatus?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text.includes("已完成");
  });

  const postPlayFirstStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );
  const postPlaySecondStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(2) .preview-step-status",
  );
  const postPlaySummaryCopy = await readNormalizedText(
    page,
    ".timeline-summary-card__copy",
  );

  summary.checks.push({
    id: "sidebar-post-play",
    firstStepStatus: postPlayFirstStepStatus,
    secondStepStatus: postPlaySecondStepStatus,
    summaryCopy: postPlaySummaryCopy,
  });

  assertOrThrow(
    postPlayFirstStepStatus.includes("已完成"),
    `播放一步后第 1 步状态异常：${postPlayFirstStepStatus}`,
  );
  assertOrThrow(
    postPlaySecondStepStatus.includes("已完成"),
    `播放一步后第 2 步状态异常：${postPlaySecondStepStatus}`,
  );
  assertOrThrow(
    postPlaySummaryCopy.includes("当前页已播放完成"),
    `播放一步后右侧摘要补充说明异常：${postPlaySummaryCopy}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-right-sidebar.png"),
    fullPage: true,
  });

  assertOrThrow(consoleErrors.length === 0, `页面存在控制台错误：${consoleErrors.join(" | ")}`);
  assertOrThrow(pageErrors.length === 0, `页面存在运行时错误：${pageErrors.join(" | ")}`);
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}
