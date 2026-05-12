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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-01-vnext-35-d-round-01");

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext35-d-test]", label);
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
    .locator(".arco-trigger-popup:visible .arco-dropdown-option")
    .filter({ hasText: optionText })
    .first();
  await option.waitFor();
  await option.click({ force: true });
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
 * 读取当前页面顶部与主舞台的沉浸状态快照。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, boolean | string | null>>}
 */
async function readImmersiveState(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".preview-shell");
    const topbar = document.querySelector(".preview-topbar");
    const insightStrip = document.querySelector(".playback-insight-strip");
    const stageHint = document.querySelector(".immersive-playback-hint");
    const embeddedActions = document.querySelector(".embedded-preview-actions");

    return {
      isShellImmersive: shell?.classList.contains("is-immersive") ?? false,
      hasTopbar: Boolean(topbar),
      hasInsightStrip: Boolean(insightStrip),
      hasStageHint: Boolean(stageHint),
      hasEmbeddedActions: Boolean(embeddedActions),
      fullscreenElementClassName:
        document.fullscreenElement instanceof HTMLElement
          ? document.fullscreenElement.className
          : null,
      stageHintText: stageHint?.textContent?.replace(/\s+/g, " ").trim() ?? "",
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
  await page.locator(".preview-stage-shell").waitFor();
  await page.locator(".preview-slide-position-tag").waitFor();
  await page.locator(".steps-list").waitFor();

  const previousSlideButton = page.getByRole("button", { name: "上一页" }).first();
  const previousStepButton = page.getByRole("button", { name: "上一步" }).first();
  const replaySlideButton = page.getByRole("button", { name: "重播" }).first();
  logStep("verify initial preview state");
  const initialNextTrigger = await readNormalizedText(page, ".preview-next-trigger-tag");
  const initialSlidePosition = await readNormalizedText(page, ".preview-slide-position-tag");
  const initialPreviousStepDisabled = await previousStepButton.isDisabled();
  const initialFirstStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );
  const initialSecondStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(2) .preview-step-status",
  );

  summary.checks.push({
    id: "initial-preview-state",
    nextTrigger: initialNextTrigger,
    slidePosition: initialSlidePosition,
    previousStepDisabled: initialPreviousStepDisabled,
    firstStepStatus: initialFirstStepStatus,
    secondStepStatus: initialSecondStepStatus,
  });

  assertOrThrow(initialNextTrigger.includes("点击页面继续"), `首屏触发提示异常：${initialNextTrigger}`);
  assertOrThrow(initialSlidePosition.includes("第 1 / 2 页"), `首屏页码异常：${initialSlidePosition}`);
  assertOrThrow(initialPreviousStepDisabled, "首屏未播放时，“上一步”应为禁用状态。");
  assertOrThrow(initialFirstStepStatus.includes("待触发"), `首屏第 1 步状态异常：${initialFirstStepStatus}`);
  assertOrThrow(initialSecondStepStatus.includes("待执行"), `首屏第 2 步状态异常：${initialSecondStepStatus}`);

  logStep("verify keyboard next-step playback");
  await page.keyboard.press("ArrowRight");
  await page
    .locator(".steps-list .preview-step-card:nth-child(2) .preview-step-status")
    .filter({ hasText: "已完成" })
    .waitFor();

  const completedStepStatusFirst = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );
  const completedStepStatusSecond = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(2) .preview-step-status",
  );
  const previousStepEnabledAfterPlay = await previousStepButton.isDisabled();

  summary.checks.push({
    id: "keyboard-play-next",
    firstStepStatus: completedStepStatusFirst,
    secondStepStatus: completedStepStatusSecond,
    previousStepDisabled: previousStepEnabledAfterPlay,
  });

  assertOrThrow(completedStepStatusFirst.includes("已完成"), `键盘推进后第 1 步状态异常：${completedStepStatusFirst}`);
  assertOrThrow(completedStepStatusSecond.includes("已完成"), `键盘推进后第 2 步状态异常：${completedStepStatusSecond}`);
  assertOrThrow(!previousStepEnabledAfterPlay, "完成播放后，“上一步”应可用。");

  logStep("verify keyboard step backward stops at previous step");
  await page.keyboard.press("ArrowLeft");
  await page
    .locator(".steps-list .preview-step-card:nth-child(2) .preview-step-status")
    .filter({ hasText: "自动触发" })
    .waitFor();

  const steppedBackNextTrigger = await readNormalizedText(page, ".preview-next-trigger-tag");
  const steppedBackFirstStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );
  const steppedBackStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(2) .preview-step-status",
  );

  summary.checks.push({
    id: "keyboard-step-backward",
    nextTrigger: steppedBackNextTrigger,
    firstStepStatus: steppedBackFirstStepStatus,
    stepStatus: steppedBackStatus,
  });

  assertOrThrow(steppedBackNextTrigger.includes("自动继续"), `回退后自动步骤提示异常：${steppedBackNextTrigger}`);
  assertOrThrow(steppedBackFirstStepStatus.includes("已完成"), `回退后第 1 步状态异常：${steppedBackFirstStepStatus}`);
  assertOrThrow(steppedBackStatus.includes("自动触发"), `回退后步骤状态异常：${steppedBackStatus}`);

  logStep("verify replay shortcut resets slide");
  await page.keyboard.press("KeyR");
  await page
    .locator(".steps-list .preview-step-card:nth-child(1) .preview-step-status")
    .filter({ hasText: "待触发" })
    .waitFor();

  const replayedNextTrigger = await readNormalizedText(page, ".preview-next-trigger-tag");
  const replayedFirstStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(1) .preview-step-status",
  );
  const replayedSecondStepStatus = await readNormalizedText(
    page,
    ".steps-list .preview-step-card:nth-child(2) .preview-step-status",
  );

  summary.checks.push({
    id: "keyboard-replay",
    nextTrigger: replayedNextTrigger,
    firstStepStatus: replayedFirstStepStatus,
    secondStepStatus: replayedSecondStepStatus,
  });

  assertOrThrow(replayedNextTrigger.includes("点击页面继续"), `重播后提示异常：${replayedNextTrigger}`);
  assertOrThrow(replayedFirstStepStatus.includes("待触发"), `重播后第 1 步状态异常：${replayedFirstStepStatus}`);
  assertOrThrow(replayedSecondStepStatus.includes("待执行"), `重播后第 2 步状态异常：${replayedSecondStepStatus}`);

  logStep("verify immersive playback UI degradation");
  await selectPreviewMoreAction(page, "沉浸播放");
  await page.waitForFunction(() => {
    const shell = document.querySelector(".preview-shell");
    return shell?.classList.contains("is-immersive") ?? false;
  });

  const immersiveState = await readImmersiveState(page);
  summary.checks.push({
    id: "immersive-enter",
    ...immersiveState,
  });

  assertOrThrow(immersiveState.isShellImmersive, "进入沉浸播放后，预览壳层未进入沉浸状态。");
  assertOrThrow(!immersiveState.hasTopbar, "进入沉浸播放后，顶部工具栏应降级隐藏。");
  assertOrThrow(!immersiveState.hasInsightStrip, "进入沉浸播放后，播放提示卡片应降级隐藏。");
  assertOrThrow(immersiveState.hasStageHint, "进入沉浸播放后，应展示轻量键盘提示。");
  assertOrThrow(
    String(immersiveState.stageHintText).includes("← 上一步") &&
      String(immersiveState.stageHintText).includes("F / Esc 退出"),
    `沉浸态键盘提示异常：${immersiveState.stageHintText}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "immersive-preview.png"),
    fullPage: true,
  });

  logStep("verify immersive keyboard exit");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const shell = document.querySelector(".preview-shell");
    return !(shell?.classList.contains("is-immersive") ?? false);
  });

  const exitedImmersiveState = await readImmersiveState(page);
  summary.checks.push({
    id: "immersive-exit",
    ...exitedImmersiveState,
  });

  assertOrThrow(!exitedImmersiveState.isShellImmersive, "按 Escape 后，沉浸播放未退出。");
  assertOrThrow(exitedImmersiveState.hasEmbeddedActions, "退出沉浸播放后，内嵌播放控制未恢复。");
  assertOrThrow(
    !exitedImmersiveState.hasStageHint,
    "退出沉浸播放后，沉浸态键盘提示未按预期隐藏。",
  );

  logStep("verify page navigation shortcuts still work");
  await page.keyboard.press("PageDown");
  await page.waitForFunction(() => {
    const element = document.querySelector(".preview-slide-position-tag");
    return element?.textContent?.includes("第 2 / 2 页") ?? false;
  });
  await page.keyboard.press("PageUp");
  await page.waitForFunction(() => {
    const element = document.querySelector(".preview-slide-position-tag");
    return element?.textContent?.includes("第 1 / 2 页") ?? false;
  });

  const finalSlidePosition = await readNormalizedText(page, ".preview-slide-position-tag");
  summary.checks.push({
    id: "page-navigation-shortcuts",
    slidePosition: finalSlidePosition,
  });
  assertOrThrow(finalSlidePosition.includes("第 1 / 2 页"), `页切换快捷键后页码异常：${finalSlidePosition}`);

  await replaySlideButton.click();
  await previousSlideButton.isDisabled();

  assertOrThrow(consoleErrors.length === 0, `页面存在控制台错误：${consoleErrors.join(" | ")}`);
  assertOrThrow(pageErrors.length === 0, `页面存在运行时错误：${pageErrors.join(" | ")}`);
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
