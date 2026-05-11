import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-11-vnext-37-round-03");

/**
 * 打印当前阶段，便于定位执行进度。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext37-c-test]", label);
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

/**
 * 读取编辑态右上工具区的关键视觉指标。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, unknown>>}
 */
async function readEditorToolbarMetrics(page) {
  return page.evaluate(() => {
    const slideSettingsButton = document.querySelector(".slide-settings-entry");
    const layerTriggerButton = document.querySelector(".floating-layer-manager__trigger");
    const viewportControls = document.querySelector(".workspace-shell .stage-viewport-controls");
    const statusTags = Array.from(
      document.querySelectorAll(".workspace-shell .stage-status-badges .arco-tag"),
    ).map((element) => element.textContent?.trim() ?? "");
    const zoomButtons = Array.from(
      document.querySelectorAll(".workspace-shell .stage-viewport-controls .arco-btn"),
    ).map((element) => (element.textContent ?? "").trim());
    const zoomTagText =
      document.querySelector(".workspace-shell .stage-viewport-controls .arco-tag")
        ?.textContent?.trim() ?? "";

    const readRect = (element) => {
      if (!(element instanceof HTMLElement)) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      };
    };

    const readIconSize = (selector) => {
      const icon = document.querySelector(selector);
      if (!(icon instanceof HTMLElement)) {
        return null;
      }

      return Number.parseFloat(window.getComputedStyle(icon).fontSize);
    };

    return {
      slideSettingsButtonRect: readRect(slideSettingsButton),
      layerTriggerButtonRect: readRect(layerTriggerButton),
      slideSettingsIconSize: readIconSize(".slide-settings-entry .arco-btn-icon"),
      layerTriggerIconSize: readIconSize(".floating-layer-manager__trigger .arco-btn-icon"),
      viewportControlsRect: readRect(viewportControls),
      zoomButtons,
      zoomButtonCount: zoomButtons.length,
      zoomTagText,
      statusTags,
    };
  });
}

/**
 * 读取预览态画布头部工具区的关键视觉指标。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, unknown>>}
 */
async function readPreviewToolbarMetrics(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector(".preview-stage-toolbar");
    const zoomButtons = Array.from(
      document.querySelectorAll(".preview-stage-toolbar .stage-viewport-controls .arco-btn"),
    ).map((element) => (element.textContent ?? "").trim());
    const zoomTagText =
      document.querySelector(".preview-stage-toolbar .stage-viewport-controls .arco-tag")
        ?.textContent?.trim() ?? "";
    const statusTags = Array.from(
      document.querySelectorAll(".preview-stage-toolbar .preview-stage-status-badges .arco-tag"),
    ).map((element) => element.textContent?.trim() ?? "");

    if (!(toolbar instanceof HTMLElement)) {
      return {
        toolbarExists: false,
        zoomButtons,
        zoomTagText,
        statusTags,
      };
    }

    const rect = toolbar.getBoundingClientRect();
    return {
      toolbarExists: true,
      toolbarRect: {
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      },
      zoomButtons,
      zoomButtonCount: zoomButtons.length,
      zoomTagText,
      statusTags,
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

  logStep("create blank project and wait for edit workspace");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);
  await page.locator(".stage-floating-tools").waitFor();

  logStep("measure edit toolbar");
  const editToolbarMetrics = await readEditorToolbarMetrics(page);
  summary.checks.push({
    id: "edit-toolbar-metrics",
    metrics: editToolbarMetrics,
  });

  assertOrThrow(
    editToolbarMetrics.slideSettingsButtonRect &&
      editToolbarMetrics.slideSettingsButtonRect.width >= 32 &&
      editToolbarMetrics.slideSettingsButtonRect.height >= 32,
    `编辑态页面设置按钮热区不足 32x32：${JSON.stringify(editToolbarMetrics.slideSettingsButtonRect)}`,
  );
  assertOrThrow(
    editToolbarMetrics.layerTriggerButtonRect &&
      editToolbarMetrics.layerTriggerButtonRect.width >= 32 &&
      editToolbarMetrics.layerTriggerButtonRect.height >= 32,
    `编辑态图层按钮热区不足 32x32：${JSON.stringify(editToolbarMetrics.layerTriggerButtonRect)}`,
  );
  assertOrThrow(
    typeof editToolbarMetrics.slideSettingsIconSize === "number" &&
      editToolbarMetrics.slideSettingsIconSize >= 22,
    `编辑态页面设置图标未放大到 24px 级别：${editToolbarMetrics.slideSettingsIconSize}`,
  );
  assertOrThrow(
    typeof editToolbarMetrics.layerTriggerIconSize === "number" &&
      editToolbarMetrics.layerTriggerIconSize >= 22,
    `编辑态图层图标未放大到 24px 级别：${editToolbarMetrics.layerTriggerIconSize}`,
  );
  assertOrThrow(
    editToolbarMetrics.zoomButtonCount === 4,
    `编辑态缩放控件按钮数量异常：${editToolbarMetrics.zoomButtonCount}`,
  );
  assertOrThrow(
    typeof editToolbarMetrics.zoomTagText === "string" &&
      editToolbarMetrics.zoomTagText.includes("%"),
    `编辑态缩放标签缺少百分比：${editToolbarMetrics.zoomTagText}`,
  );
  assertOrThrow(
    Array.isArray(editToolbarMetrics.statusTags) &&
      editToolbarMetrics.statusTags.includes("编辑模式") &&
      editToolbarMetrics.statusTags.some((tag) => tag.includes("第 1/1 页")),
    `编辑态状态标签未按预期展示：${JSON.stringify(editToolbarMetrics.statusTags)}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-edit-vnext-37-c.png"),
    fullPage: true,
  });

  logStep("switch to preview workspace");
  await page.getByText("预览", { exact: true }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=preview$/);
  await page.locator(".preview-stage-toolbar").waitFor();

  logStep("measure preview toolbar");
  const previewToolbarMetrics = await readPreviewToolbarMetrics(page);
  summary.checks.push({
    id: "preview-toolbar-metrics",
    metrics: previewToolbarMetrics,
  });

  assertOrThrow(previewToolbarMetrics.toolbarExists, "预览态工具区未渲染。");
  assertOrThrow(
    previewToolbarMetrics.zoomButtonCount === 4,
    `预览态缩放控件按钮数量异常：${previewToolbarMetrics.zoomButtonCount}`,
  );
  assertOrThrow(
    typeof previewToolbarMetrics.zoomTagText === "string" &&
      previewToolbarMetrics.zoomTagText.includes("%"),
    `预览态缩放标签缺少百分比：${previewToolbarMetrics.zoomTagText}`,
  );
  assertOrThrow(
    Array.isArray(previewToolbarMetrics.statusTags) &&
      previewToolbarMetrics.statusTags.length >= 3 &&
      previewToolbarMetrics.statusTags.some((tag) =>
        /^第\s*1\s*\/\s*1\s*页$/.test(tag),
      ),
    `预览态状态标签数量或内容异常：${JSON.stringify(previewToolbarMetrics.statusTags)}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-preview-vnext-37-c.png"),
    fullPage: true,
  });
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}
