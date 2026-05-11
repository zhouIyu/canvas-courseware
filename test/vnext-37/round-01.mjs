import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  readWorkspaceIoFeedbackText,
  readWorkspaceSaveStatusLabel,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-11-vnext-37-round-01");

/**
 * 打印当前阶段，便于定位执行进度。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext37-a-test]", label);
}

/**
 * 断言条件成立，否则抛出明确错误。
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
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open project list and reset localStorage");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  logStep("create blank project");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  logStep("measure topbar height and initial save state");
  const topbarMetrics = await page.locator(".workspace-topbar").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
    };
  });
  const initialSaveLabel = await readWorkspaceSaveStatusLabel(page);

  summary.checks.push({
    id: "initial-topbar",
    topbarMetrics,
    initialSaveLabel,
  });

  assertOrThrow(initialSaveLabel === "已保存", `初始保存状态异常：${initialSaveLabel}`);
  assertOrThrow(
    topbarMetrics.height <= 60,
    `顶栏高度未收敛到 56px 左右，当前高度为 ${topbarMetrics.height}`,
  );

  logStep("update project title and wait for autosave lifecycle");
  await page.getByLabel("项目标题").fill("VNext-37-A 顶栏反馈优化回归");
  await page.waitForTimeout(150);
  const dirtySaveLabel = await readWorkspaceSaveStatusLabel(page);
  await waitForSaved(page);
  const savedSaveLabel = await readWorkspaceSaveStatusLabel(page);

  summary.checks.push({
    id: "autosave-status-cycle",
    dirtySaveLabel,
    savedSaveLabel,
  });

  assertOrThrow(dirtySaveLabel === "未保存", `编辑后顶部状态未进入“未保存”：${dirtySaveLabel}`);
  assertOrThrow(savedSaveLabel === "已保存", `自动保存完成后顶部状态未回到“已保存”：${savedSaveLabel}`);

  logStep("wait for saved text collapse");
  await page.waitForTimeout(3200);
  const collapsedState = await page.locator("[data-save-status-label]").evaluate((element) => ({
    label: element instanceof HTMLElement ? element.dataset.saveStatusLabel ?? "" : "",
    textWidth: element.querySelector(".save-status-text") instanceof HTMLElement
      ? window.getComputedStyle(element.querySelector(".save-status-text")).maxWidth
      : "",
    className: element.className,
  }));

  summary.checks.push({
    id: "saved-text-collapse",
    collapsedState,
  });

  assertOrThrow(
    collapsedState.className.includes("is-collapsed"),
    `已保存状态 3 秒后未收起文字：${collapsedState.className}`,
  );

  logStep("export json and verify io feedback bridge still updates");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出 JSON" }).click(),
  ]);
  const downloadPath = path.join(ASSET_DIR, download.suggestedFilename());
  await download.saveAs(downloadPath);
  const ioFeedbackText = await readWorkspaceIoFeedbackText(page);
  const hasVisibleAlert = await page.locator(".workspace-topbar .arco-alert").count();

  summary.checks.push({
    id: "io-feedback-bridge",
    ioFeedbackText,
    hasVisibleAlert,
    downloadPath,
  });

  assertOrThrow(
    ioFeedbackText.includes("已导出"),
    `导出后顶部反馈桥接文案未更新：${ioFeedbackText}`,
  );
  assertOrThrow(hasVisibleAlert === 0, "顶栏内仍然存在可见 Alert 横幅。");

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-topbar-vnext-37-a.png"),
    fullPage: true,
  });
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}
