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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-12-vnext-37-e-round-01");

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext37-e-test]", label);
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
 * 读取目标元素的文本并统一规整空白字符。
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

/**
 * 打开预览播放控制区的“更多”菜单并点击指定动作。
 *
 * @param {import("playwright").Page} page
 * @param {string} optionText
 * @returns {Promise<void>}
 */
async function selectPreviewMoreAction(page, optionText) {
  const moreButton = page.getByRole("button", { name: "更多" }).first();
  await moreButton.click();
  const popup = page.locator(".arco-trigger-popup:visible").last();
  await popup.waitFor();
  const option = popup.locator(".preview-more-menu__item").filter({ hasText: optionText }).first();
  await option.waitFor();
  await option.click();
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
  logStep("open preview workspace");
  await openPreviewWorkspace(page);

  logStep("verify topbar controls stay on one row and expose grouped actions");
  const topbarMetrics = await page.locator(".preview-stage-shell .stage-head").evaluate((element) => {
    const topbarActionGroup = element.querySelector(".embedded-preview-actions");
    const playbackControls = element.querySelector(".preview-playback-controls");
    const topbarActions = element.querySelector(".stage-head-actions");
    const navigationGroup = element.querySelector(".preview-playback-controls__navigation");
    const primaryGroup = element.querySelector(".preview-playback-controls__primary");
    const primaryButton = element.querySelector(".preview-primary-button");
    const secondaryButtons = [
      ...element.querySelectorAll(".preview-secondary-button"),
    ].map((button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "");
    const moreButton = element.querySelector(".preview-more-button");

    if (
      !(topbarActionGroup instanceof HTMLElement) ||
      !(playbackControls instanceof HTMLElement) ||
      !(topbarActions instanceof HTMLElement) ||
      !(navigationGroup instanceof HTMLElement) ||
      !(primaryGroup instanceof HTMLElement) ||
      !(primaryButton instanceof HTMLElement) ||
      !(moreButton instanceof HTMLElement)
    ) {
      throw new Error("VNext-37-E 顶部控制区结构不完整");
    }

    const topbarActionsRect = topbarActions.getBoundingClientRect();
    const actionGroupRect = topbarActionGroup.getBoundingClientRect();
    const playbackControlsRect = playbackControls.getBoundingClientRect();
    const primaryRect = primaryButton.getBoundingClientRect();

    return {
      hasSingleRow:
        Math.abs(actionGroupRect.top - playbackControlsRect.top) < 6 &&
        Math.abs(actionGroupRect.bottom - playbackControlsRect.bottom) < 16,
      controlRowHeight: Math.round(
        Math.max(actionGroupRect.bottom, playbackControlsRect.bottom) -
          Math.min(actionGroupRect.top, playbackControlsRect.top),
      ),
      topbarActionsHeight: Math.round(topbarActionsRect.height),
      actionGroupWidth: Math.round(actionGroupRect.width),
      playbackControlsWidth: Math.round(playbackControlsRect.width),
      navigationTop: Math.round(navigationGroup.getBoundingClientRect().top),
      primaryTop: Math.round(primaryGroup.getBoundingClientRect().top),
      primaryHeight: Math.round(primaryRect.height),
      primaryText: primaryButton.textContent?.replace(/\s+/g, " ").trim() ?? "",
      moreText: moreButton.textContent?.replace(/\s+/g, " ").trim() ?? "",
      secondaryButtons,
    };
  });

  summary.checks.push({
    id: "topbar-layout",
    ...topbarMetrics,
  });

  assertOrThrow(topbarMetrics.hasSingleRow, "预览页顶部控制区未按预期压缩为一行。");
  assertOrThrow(
    topbarMetrics.controlRowHeight <= 56,
    `预览页控制行高度异常：${topbarMetrics.controlRowHeight}px`,
  );
  assertOrThrow(
    topbarMetrics.primaryText.includes("播放下一步"),
    `主操作按钮文案异常：${topbarMetrics.primaryText}`,
  );
  assertOrThrow(topbarMetrics.moreText.includes("更多"), `更多按钮文案异常：${topbarMetrics.moreText}`);
  assertOrThrow(
    topbarMetrics.secondaryButtons.join("|").includes("上一页") &&
      topbarMetrics.secondaryButtons.join("|").includes("上一步") &&
      topbarMetrics.secondaryButtons.join("|").includes("重播") &&
      topbarMetrics.secondaryButtons.join("|").includes("下一页"),
    `次要操作按钮组异常：${topbarMetrics.secondaryButtons.join(" | ")}`,
  );

  logStep("verify more menu contains low-frequency actions only");
  await page.getByRole("button", { name: "更多" }).first().click();
  const moreMenuLabels = await page
    .locator(".arco-trigger-popup:visible .preview-more-menu__item")
    .evaluateAll((options) =>
      options.map((option) => option.textContent?.replace(/\s+/g, " ").trim() ?? ""),
    );

  summary.checks.push({
    id: "more-menu-options",
    options: moreMenuLabels,
  });

  assertOrThrow(
    moreMenuLabels.some((label) => label.includes("重新开始课件")),
    `更多菜单缺少“重新开始课件”入口：${moreMenuLabels.join(" | ")}`,
  );
  assertOrThrow(
    moreMenuLabels.some((label) => label.includes("沉浸播放")),
    `更多菜单缺少“沉浸播放”入口：${moreMenuLabels.join(" | ")}`,
  );
  assertOrThrow(
    moreMenuLabels.every(
      (label) =>
        !label.includes("上一页") &&
        !label.includes("上一步") &&
        !label.includes("下一页") &&
        !label.includes("播放下一步"),
    ),
    `更多菜单混入了高频主链路操作：${moreMenuLabels.join(" | ")}`,
  );

  logStep("verify more menu restart action still works");
  const initialFirstStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.locator(".preview-primary-button").first().click();
  await page.waitForFunction((expectedInitialFirstStepStatus) => {
    const currentStatus = document.querySelector(
      ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
    );
    const text = currentStatus?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text !== expectedInitialFirstStepStatus;
  }, initialFirstStepStatus);
  await selectPreviewMoreAction(page, "重新开始课件");
  await page.waitForFunction(() => {
    const currentStatus = document.querySelector(
      ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
    );
    const text = currentStatus?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text.length > 0 && !text.includes("已完成");
  });

  const restartedSlidePosition = await readNormalizedText(page, ".preview-slide-position-tag");
  const restartedFirstStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );
  const restartedPrimaryText = await readNormalizedText(
    page,
    ".preview-primary-button",
  );

  summary.checks.push({
    id: "more-menu-actions",
    restartedSlidePosition,
    restartedFirstStepStatus,
    restartedPrimaryText,
  });

  assertOrThrow(
    restartedSlidePosition.includes("第 1 / 2 页"),
    `通过更多菜单重新开始后页码异常：${restartedSlidePosition}`,
  );
  assertOrThrow(
    !restartedFirstStepStatus.includes("已完成"),
    `通过更多菜单重新开始后首步状态仍停留在完成态：${restartedFirstStepStatus}`,
  );
  assertOrThrow(
    restartedPrimaryText.includes("播放下一步"),
    `重新开始后主操作按钮文案异常：${restartedPrimaryText}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-topbar-controls.png"),
    fullPage: true,
  });

  assertOrThrow(consoleErrors.length === 0, `页面存在控制台错误：${consoleErrors.join(" | ")}`);
  assertOrThrow(pageErrors.length === 0, `页面存在运行时错误：${pageErrors.join(" | ")}`);
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
