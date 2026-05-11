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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-11-vnext-37-round-02");

/**
 * 打印当前阶段，便于定位执行进度。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext37-b-test]", label);
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
 * 读取工作台三栏布局的关键宽度与中央区域占比。
 *
 * @param {import("playwright").Page} page
 * @param {"edit" | "preview"} mode
 * @returns {Promise<Record<string, number | null>>}
 */
async function readWorkspaceLayoutMetrics(page, mode) {
  return page.evaluate((currentMode) => {
    const rootSelector =
      currentMode === "edit" ? ".workspace-editor" : ".workspace-preview";
    const layoutSelector =
      currentMode === "edit" ? ".editor-layout" : ".preview-layout";
    const railSelector =
      currentMode === "edit" ? ".slide-rail-host" : ".preview-rail";
    const stageSelector =
      currentMode === "edit" ? ".workspace-shell" : ".preview-stage-shell";
    const sideSelector =
      currentMode === "edit" ? ".editor-side" : ".preview-side.timeline-shell";
    const thumbnailSelector =
      currentMode === "edit"
        ? ".slide-rail .slide-thumbnail"
        : ".preview-rail .slide-thumbnail";

    const rootElement = document.querySelector(rootSelector);
    const layoutElement = document.querySelector(layoutSelector);
    const railElement = document.querySelector(railSelector);
    const stageElement = document.querySelector(stageSelector);
    const sideElement = document.querySelector(sideSelector);
    const thumbnailElement = document.querySelector(thumbnailSelector);

    const rootRect = rootElement?.getBoundingClientRect() ?? null;
    const layoutRect = layoutElement?.getBoundingClientRect() ?? null;
    const railRect = railElement?.getBoundingClientRect() ?? null;
    const stageRect = stageElement?.getBoundingClientRect() ?? null;
    const sideRect = sideElement?.getBoundingClientRect() ?? null;
    const thumbnailRect = thumbnailElement?.getBoundingClientRect() ?? null;

    return {
      viewportWidth: window.innerWidth,
      rootWidth: rootRect ? Number(rootRect.width.toFixed(2)) : null,
      layoutWidth: layoutRect ? Number(layoutRect.width.toFixed(2)) : null,
      railWidth: railRect ? Number(railRect.width.toFixed(2)) : null,
      stageWidth: stageRect ? Number(stageRect.width.toFixed(2)) : null,
      sideWidth: sideRect ? Number(sideRect.width.toFixed(2)) : null,
      thumbnailHeight: thumbnailRect ? Number(thumbnailRect.height.toFixed(2)) : null,
      stageRatioToLayout:
        layoutRect && stageRect
          ? Number((stageRect.width / layoutRect.width).toFixed(4))
          : null,
    };
  }, mode);
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
  await page.locator(".editor-layout").waitFor();
  await page.getByRole("button", { name: "展开右侧管理栏" }).click();
  await page.locator(".editor-side").waitFor();

  logStep("measure edit layout");
  const editMetrics = await readWorkspaceLayoutMetrics(page, "edit");
  summary.checks.push({
    id: "edit-layout-metrics",
    metrics: editMetrics,
  });

  assertOrThrow(
    typeof editMetrics.railWidth === "number" && editMetrics.railWidth <= 176,
    `编辑态左栏宽度未收敛到 160px 级别，当前为 ${editMetrics.railWidth}`,
  );
  assertOrThrow(
    typeof editMetrics.sideWidth === "number" && editMetrics.sideWidth <= 256,
    `编辑态右栏宽度未收敛到 240px 级别，当前为 ${editMetrics.sideWidth}`,
  );
  assertOrThrow(
    typeof editMetrics.thumbnailHeight === "number" && editMetrics.thumbnailHeight <= 76,
    `编辑态缩略图高度未压缩到 64px 级别，当前为 ${editMetrics.thumbnailHeight}`,
  );
  assertOrThrow(
    typeof editMetrics.stageRatioToLayout === "number" &&
      editMetrics.stageRatioToLayout >= 0.72,
    `编辑态中央区域占比不足 72%，当前为 ${editMetrics.stageRatioToLayout}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-edit-vnext-37-b.png"),
    fullPage: true,
  });

  logStep("switch to preview workspace");
  await page.getByText("预览", { exact: true }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=preview$/);
  await page.locator(".preview-layout").waitFor();
  const previewTimelinePanel = page.locator(".preview-side.timeline-shell");
  if ((await previewTimelinePanel.count()) === 0) {
    await page.getByRole("button", { name: "展开右侧步骤栏" }).click();
    await previewTimelinePanel.waitFor();
  }

  logStep("measure preview layout");
  const previewMetrics = await readWorkspaceLayoutMetrics(page, "preview");
  summary.checks.push({
    id: "preview-layout-metrics",
    metrics: previewMetrics,
  });

  assertOrThrow(
    typeof previewMetrics.railWidth === "number" && previewMetrics.railWidth <= 176,
    `预览态左栏宽度未收敛到 160px 级别，当前为 ${previewMetrics.railWidth}`,
  );
  assertOrThrow(
    typeof previewMetrics.sideWidth === "number" && previewMetrics.sideWidth <= 256,
    `预览态右栏宽度未收敛到 240px 级别，当前为 ${previewMetrics.sideWidth}`,
  );
  assertOrThrow(
    typeof previewMetrics.thumbnailHeight === "number" && previewMetrics.thumbnailHeight <= 60,
    `预览态缩略图高度未压缩到 48px 级别，当前为 ${previewMetrics.thumbnailHeight}`,
  );
  assertOrThrow(
    typeof previewMetrics.stageRatioToLayout === "number" &&
      previewMetrics.stageRatioToLayout >= 0.72,
    `预览态中央区域占比不足 72%，当前为 ${previewMetrics.stageRatioToLayout}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-preview-vnext-37-b.png"),
    fullPage: true,
  });
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}
