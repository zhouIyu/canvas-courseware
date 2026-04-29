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
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-29-vnext-33-g-round-01");

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext33-g-test]", label);
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
 * 等待预览提示标题切换到指定文本。
 *
 * @param {import("playwright").Page} page
 * @param {string} expectedText
 * @returns {Promise<void>}
 */
async function waitForPlaybackHint(page, expectedText) {
  await page.waitForFunction((targetText) => {
    const element = document.querySelector(".playback-hint-title");
    return element?.textContent?.includes(targetText) ?? false;
  }, expectedText);
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
  logStep("open project list and reset local storage");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  logStep("open seeded demo project");
  await page.getByRole("button", { name: "打开" }).first().click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();

  logStep("switch to preview mode");
  await page
    .locator(".workspace-mode-switch .arco-radio-button")
    .filter({ hasText: "预览" })
    .click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=preview$/);
  await page.locator(".playback-insight-strip").waitFor();

  const previousSlideButton = page.getByRole("button", { name: "上一页" });
  const replaySlideButton = page.getByRole("button", { name: "重播当前页" });
  const nextSlideButton = page.getByRole("button", { name: "下一页" });
  const playNextStepButton = page.getByRole("button", { name: "播放下一步" });

  logStep("verify initial preview controls and first-slide status");
  const initialSlidePosition = await readNormalizedText(page, ".preview-slide-position");
  const initialHintTitle = await readNormalizedText(page, ".playback-hint-title");
  const initialHintCopy = await readNormalizedText(page, ".playback-hint-copy");
  const initialPreviousDisabled = await previousSlideButton.isDisabled();
  const initialNextDisabled = await nextSlideButton.isDisabled();

  summary.checks.push({
    id: "initial-preview-status",
    slidePosition: initialSlidePosition,
    hintTitle: initialHintTitle,
    hintCopy: initialHintCopy,
    previousDisabled: initialPreviousDisabled,
    nextDisabled: initialNextDisabled,
  });

  assertOrThrow(initialSlidePosition.includes("第 1 / 2 页"), `首屏页码提示异常：${initialSlidePosition}`);
  assertOrThrow(initialHintTitle.includes("下一步：第 1 步"), `首屏步骤提示异常：${initialHintTitle}`);
  assertOrThrow(initialHintCopy.includes("点击页面继续"), `首屏触发提示异常：${initialHintCopy}`);
  assertOrThrow(initialPreviousDisabled, "首屏位于第一页时，“上一页”应为禁用状态。");
  assertOrThrow(!initialNextDisabled, "首屏位于第一页时，“下一页”不应被禁用。");

  logStep("play first slide and wait for auto completion");
  await playNextStepButton.click();
  await page.locator(".playback-hint-copy").filter({ hasText: "自动继续" }).waitFor();
  await waitForPlaybackHint(page, "当前页已播放完成");

  const firstSlideProgress = await readNormalizedText(page, ".preview-step-progress");
  const firstStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );
  const secondStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(2) .preview-step-status",
  );

  summary.checks.push({
    id: "first-slide-completed",
    stepProgress: firstSlideProgress,
    firstStepStatus,
    secondStepStatus,
  });

  assertOrThrow(firstSlideProgress.includes("已完成 2 / 2 步"), `第一页完成态进度异常：${firstSlideProgress}`);
  assertOrThrow(firstStepStatus.includes("已完成"), `第一页首个步骤状态异常：${firstStepStatus}`);
  assertOrThrow(secondStepStatus.includes("已完成"), `第一页第二个步骤状态异常：${secondStepStatus}`);

  logStep("go to second slide and verify slide navigation state");
  await nextSlideButton.click();
  await page.waitForFunction(() => {
    const element = document.querySelector(".preview-slide-position");
    return element?.textContent?.includes("第 2 / 2 页") ?? false;
  });

  const secondSlidePosition = await readNormalizedText(page, ".preview-slide-position");
  const secondSlideHintTitle = await readNormalizedText(page, ".playback-hint-title");
  const secondSlidePreviousDisabled = await previousSlideButton.isDisabled();
  const secondSlideNextDisabled = await nextSlideButton.isDisabled();

  summary.checks.push({
    id: "second-slide-navigation",
    slidePosition: secondSlidePosition,
    hintTitle: secondSlideHintTitle,
    previousDisabled: secondSlidePreviousDisabled,
    nextDisabled: secondSlideNextDisabled,
  });

  assertOrThrow(secondSlidePosition.includes("第 2 / 2 页"), `切到第二页后的页码提示异常：${secondSlidePosition}`);
  assertOrThrow(secondSlideHintTitle.includes("下一步：第 1 步"), `第二页首个步骤提示异常：${secondSlideHintTitle}`);
  assertOrThrow(!secondSlidePreviousDisabled, "切到第二页后，“上一页”不应保持禁用。");
  assertOrThrow(secondSlideNextDisabled, "切到最后一页后，“下一页”应被禁用。");

  logStep("complete second slide and verify replay resets step state");
  await playNextStepButton.click();
  await waitForPlaybackHint(page, "当前页已播放完成");
  await replaySlideButton.click();
  await waitForPlaybackHint(page, "下一步：第 1 步");

  const replayStepProgress = await readNormalizedText(page, ".preview-step-progress");
  const replayHintCopy = await readNormalizedText(page, ".playback-hint-copy");
  const replayStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );

  summary.checks.push({
    id: "replay-current-slide",
    stepProgress: replayStepProgress,
    hintCopy: replayHintCopy,
    stepStatus: replayStepStatus,
  });

  assertOrThrow(replayStepProgress.includes("已完成 0 / 1 步"), `重播后步骤进度异常：${replayStepProgress}`);
  assertOrThrow(replayHintCopy.includes("点击页面继续"), `重播后触发提示异常：${replayHintCopy}`);
  assertOrThrow(replayStepStatus.includes("待触发"), `重播后步骤状态异常：${replayStepStatus}`);

  logStep("go back to first slide and capture evidence");
  await previousSlideButton.click();
  await page.waitForFunction(() => {
    const element = document.querySelector(".preview-slide-position");
    return element?.textContent?.includes("第 1 / 2 页") ?? false;
  });

  const returnedSlidePosition = await readNormalizedText(page, ".preview-slide-position");
  summary.checks.push({
    id: "return-to-first-slide",
    slidePosition: returnedSlidePosition,
  });
  assertOrThrow(returnedSlidePosition.includes("第 1 / 2 页"), `返回第一页后的页码提示异常：${returnedSlidePosition}`);

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-controls.png"),
    fullPage: true,
  });

  assertOrThrow(consoleErrors.length === 0, `页面存在控制台错误：${consoleErrors.join(" | ")}`);
  assertOrThrow(pageErrors.length === 0, `页面存在运行时错误：${pageErrors.join(" | ")}`);
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
