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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-11-vnext-36-e-round-01");

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext36-e-test]", label);
}

/**
 * 在断言失败时抛出更容易定位的问题描述。
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
 * 打开预览播放控制区的“更多”菜单并点击指定动作。
 *
 * @param {import("playwright").Page} page
 * @param {string} optionText
 * @returns {Promise<void>}
 */
async function selectPreviewMoreAction(page, optionText) {
  const moreButton = page.getByRole("button", { name: "更多" }).first();
  await moreButton.click();
  const option = page
    .locator(".arco-trigger-popup:visible .preview-more-menu__item")
    .filter({ hasText: optionText })
    .first();
  await option.waitFor();
  await option.click();
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
 * 打开默认 demo 项目并切换到预览模式。
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
  await page.locator(".preview-stage-shell").waitFor();
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

  const previousSlideButton = page.getByRole("button", { name: "上一页" }).first();
  const nextSlideButton = page.getByRole("button", { name: "下一页" }).first();
  const playNextStepButton = page.locator(".preview-primary-button").first();

  logStep("verify initial courseware progress");
  const initialCoursewareProgress = await readNormalizedText(page, ".courseware-progress-value");
  const initialCoursewareCopy = await readNormalizedText(page, ".courseware-progress-copy");
  const initialFirstSlideProgress = await readNormalizedText(
    page,
    ".slide-chip-list .slide-card:nth-child(1) .slide-progress-text",
  );
  const initialSecondSlideStatus = await readNormalizedText(
    page,
    ".slide-chip-list .slide-card:nth-child(2) .slide-status-text",
  );
  const initialPlayNextDisabled = await playNextStepButton.isDisabled();

  summary.checks.push({
    id: "initial-courseware-progress",
    coursewareProgress: initialCoursewareProgress,
    coursewareCopy: initialCoursewareCopy,
    firstSlideProgress: initialFirstSlideProgress,
    secondSlideStatus: initialSecondSlideStatus,
    playNextDisabled: initialPlayNextDisabled,
  });

  assertOrThrow(
    initialCoursewareProgress.includes("已完成 0 / 2 页"),
    `首屏课件进度异常：${initialCoursewareProgress}`,
  );
  assertOrThrow(
    initialCoursewareCopy.includes("第 1 / 2 页"),
    `首屏课件进度补充说明异常：${initialCoursewareCopy}`,
  );
  assertOrThrow(
    initialFirstSlideProgress.includes("0/2 步"),
    `首屏第一页步骤进度异常：${initialFirstSlideProgress}`,
  );
  assertOrThrow(
    initialSecondSlideStatus.includes("未播放"),
    `首屏第二页状态异常：${initialSecondSlideStatus}`,
  );
  assertOrThrow(!initialPlayNextDisabled, "首屏存在待执行步骤时，“播放下一步”不应禁用。");

  logStep("complete first slide and verify courseware progress updates");
  await playNextStepButton.click();
  await page
    .locator(".slide-chip-list .slide-card:nth-child(1)")
    .locator(".slide-status-text")
    .filter({ hasText: "已完成" })
    .waitFor();

  const firstSlideCompletedProgress = await readNormalizedText(
    page,
    ".courseware-progress-value",
  );
  const firstSlideCompletedStatus = await readNormalizedText(
    page,
    ".slide-chip-list .slide-card:nth-child(1) .slide-status-text",
  );

  summary.checks.push({
    id: "first-slide-complete",
    coursewareProgress: firstSlideCompletedProgress,
    firstSlideStatus: firstSlideCompletedStatus,
  });

  assertOrThrow(
    firstSlideCompletedProgress.includes("已完成 1 / 2 页"),
    `第一页播放完成后课件进度异常：${firstSlideCompletedProgress}`,
  );
  assertOrThrow(
    firstSlideCompletedStatus.includes("已完成"),
    `第一页播放完成后页卡状态异常：${firstSlideCompletedStatus}`,
  );

  logStep("navigate to second slide and verify ongoing state");
  await nextSlideButton.click();
  await page.waitForFunction(() => {
    const value = document.querySelector(".preview-slide-position-tag");
    return value?.textContent?.includes("第 2 / 2 页") ?? false;
  });

  const secondSlideProgressSummary = await readNormalizedText(
    page,
    ".courseware-progress-copy",
  );
  const secondSlideSidebarSummary = await readNormalizedText(
    page,
    ".timeline-summary-card strong",
  );

  summary.checks.push({
    id: "second-slide-opened",
    coursewareCopy: secondSlideProgressSummary,
    sidebarSummary: secondSlideSidebarSummary,
  });

  assertOrThrow(
    secondSlideProgressSummary.includes("第 2 / 2 页"),
    `切到第二页后课件补充说明异常：${secondSlideProgressSummary}`,
  );
  assertOrThrow(
    secondSlideSidebarSummary.includes("0/1 步"),
    `切到第二页后右侧步骤摘要异常：${secondSlideSidebarSummary}`,
  );

  logStep("complete second slide and verify courseware completion state");
  await playNextStepButton.click();
  await page.waitForFunction(() => {
    const title = document.querySelector(".playback-hint-title");
    return title?.textContent?.includes("整份课件已播放完成") ?? false;
  });

  const finalCoursewareProgress = await readNormalizedText(page, ".courseware-progress-value");
  const finalHintTitle = await readNormalizedText(page, ".playback-hint-title");
  const finalHintCopy = await readNormalizedText(page, ".playback-hint-copy");
  const finalPlayNextDisabled = await playNextStepButton.isDisabled();

  summary.checks.push({
    id: "courseware-completed",
    coursewareProgress: finalCoursewareProgress,
    hintTitle: finalHintTitle,
    hintCopy: finalHintCopy,
    playNextDisabled: finalPlayNextDisabled,
  });

  assertOrThrow(
    finalCoursewareProgress.includes("已完成 2 / 2 页"),
    `整份课件完成后课件进度异常：${finalCoursewareProgress}`,
  );
  assertOrThrow(
    finalHintTitle.includes("整份课件已播放完成"),
    `整份课件完成后提示标题异常：${finalHintTitle}`,
  );
  assertOrThrow(
    finalHintCopy.includes("重新开始课件"),
    `整份课件完成后提示说明未包含重新开始入口：${finalHintCopy}`,
  );
  assertOrThrow(finalPlayNextDisabled, "整份课件完成后，“播放下一步”应为禁用状态。");

  logStep("restart full courseware by keyboard shortcut");
  await page.keyboard.press("Shift+R");
  await page.waitForFunction(() => {
    const slidePosition = document.querySelector(".preview-slide-position-tag");
    const coursewareProgress = document.querySelector(".courseware-progress-value");
    return (
      (slidePosition?.textContent?.includes("第 1 / 2 页") ?? false) &&
      (coursewareProgress?.textContent?.includes("已完成 0 / 2 页") ?? false)
    );
  });

  const restartedSlidePosition = await readNormalizedText(
    page,
    ".preview-slide-position-tag",
  );
  const restartedCoursewareProgress = await readNormalizedText(
    page,
    ".courseware-progress-value",
  );
  const restartedFirstSlideStatus = await readNormalizedText(
    page,
    ".slide-chip-list .slide-card:nth-child(1) .slide-status-text",
  );
  const restartedNextDisabled = await nextSlideButton.isDisabled();
  const restartedPreviousDisabled = await previousSlideButton.isDisabled();
  const restartedPlayNextDisabled = await playNextStepButton.isDisabled();

  summary.checks.push({
    id: "courseware-restarted",
    slidePosition: restartedSlidePosition,
    coursewareProgress: restartedCoursewareProgress,
    firstSlideStatus: restartedFirstSlideStatus,
    previousDisabled: restartedPreviousDisabled,
    nextDisabled: restartedNextDisabled,
    playNextDisabled: restartedPlayNextDisabled,
  });

  assertOrThrow(
    restartedSlidePosition.includes("第 1 / 2 页"),
    `重新开始课件后页码异常：${restartedSlidePosition}`,
  );
  assertOrThrow(
    restartedCoursewareProgress.includes("已完成 0 / 2 页"),
    `重新开始课件后总进度异常：${restartedCoursewareProgress}`,
  );
  assertOrThrow(
    restartedFirstSlideStatus.includes("当前页"),
    `重新开始课件后第一页状态异常：${restartedFirstSlideStatus}`,
  );
  assertOrThrow(restartedPreviousDisabled, "重新开始后第一页“上一页”应恢复禁用。");
  assertOrThrow(!restartedNextDisabled, "重新开始后仍应允许切到下一页。");
  assertOrThrow(!restartedPlayNextDisabled, "重新开始后存在待执行步骤，“播放下一步”不应禁用。");

  logStep("restart full courseware by button");
  await nextSlideButton.click();
  await page.waitForFunction(() => {
    const slidePosition = document.querySelector(".preview-slide-position-tag");
    return slidePosition?.textContent?.includes("第 2 / 2 页") ?? false;
  });
  await selectPreviewMoreAction(page, "重新开始课件");
  await page.waitForFunction(() => {
    const slidePosition = document.querySelector(".preview-slide-position-tag");
    return slidePosition?.textContent?.includes("第 1 / 2 页") ?? false;
  });

  const restartedByButtonProgress = await readNormalizedText(
    page,
    ".courseware-progress-value",
  );
  summary.checks.push({
    id: "courseware-restarted-by-button",
    coursewareProgress: restartedByButtonProgress,
  });
  assertOrThrow(
    restartedByButtonProgress.includes("已完成 0 / 2 页"),
    `通过按钮重新开始课件后总进度异常：${restartedByButtonProgress}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-courseware-progress.png"),
    fullPage: true,
  });

  assertOrThrow(consoleErrors.length === 0, `页面存在控制台错误：${consoleErrors.join(" | ")}`);
  assertOrThrow(pageErrors.length === 0, `页面存在运行时错误：${pageErrors.join(" | ")}`);
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
