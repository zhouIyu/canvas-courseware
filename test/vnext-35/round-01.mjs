import path from "node:path";
import {
  attachPageErrorCollectors,
  ensureDirectory,
  launchBrowserSession,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-30-vnext-35-a-round-01");

/** 本轮需要覆盖的桌面视口集合。 */
const VIEWPORTS = [
  {
    id: "desktop-1440x900",
    width: 1440,
    height: 900,
  },
  {
    id: "desktop-1280x720",
    width: 1280,
    height: 720,
  },
];

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext35-a-test]", label);
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
 * 从缩放标签文本里解析当前百分比数值。
 *
 * @param {string | null | undefined} label
 * @returns {number | null}
 */
function readScalePercent(label) {
  const matchedValue = String(label ?? "").match(/(\d+)%/);
  return matchedValue ? Number.parseInt(matchedValue[1], 10) : null;
}

/**
 * 打开默认示例项目并进入编辑工作台。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openDemoProject(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
  await page.getByRole("button", { name: "打开" }).first().click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.locator(".stage-surface .lower-canvas").waitFor();
}

/**
 * 切到预览模式并等待预览画布稳定挂载。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openPreviewMode(page) {
  const currentUrl = page.url();
  const previewUrl = currentUrl.replace("mode=edit", "mode=preview");

  await page.goto(previewUrl, { waitUntil: "networkidle" });
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
}

/**
 * 读取当前模式下画布视图控制与滚动承载指标。
 *
 * @param {import("playwright").Page} page
 * @param {"edit" | "preview"} mode
 * @returns {Promise<{
 *   mode: "edit" | "preview";
 *   zoomLabel: string | null;
 *   frameWidth: number | null;
 *   frameHeight: number | null;
 *   viewportClientWidth: number | null;
 *   viewportClientHeight: number | null;
 *   viewportScrollWidth: number | null;
 *   viewportScrollHeight: number | null;
 *   surfaceTransform: string | null;
 * }>}
 */
async function readStageViewportMetrics(page, mode) {
  return page.evaluate((currentMode) => {
    const selectors =
      currentMode === "edit"
        ? {
            controls: ".stage-floating-tools .stage-viewport-controls",
            frame: ".stage-scale-frame",
            viewport: ".stage-fit-viewport",
            surface: ".stage-surface",
          }
        : {
            controls: ".preview-stage-shell .stage-viewport-controls",
            frame: ".preview-stage-frame",
            viewport: ".preview-stage-viewport",
            surface: ".preview-stage-surface",
          };

    const controls = document.querySelector(selectors.controls);
    const indicator = controls?.querySelector(".stage-viewport-controls__indicator");
    const frame = document.querySelector(selectors.frame);
    const viewport = document.querySelector(selectors.viewport);
    const surface = document.querySelector(selectors.surface);

    return {
      mode: currentMode,
      zoomLabel: indicator?.textContent?.trim() ?? null,
      frameWidth: frame?.getBoundingClientRect().width ?? null,
      frameHeight: frame?.getBoundingClientRect().height ?? null,
      viewportClientWidth: viewport instanceof HTMLElement ? viewport.clientWidth : null,
      viewportClientHeight: viewport instanceof HTMLElement ? viewport.clientHeight : null,
      viewportScrollWidth: viewport instanceof HTMLElement ? viewport.scrollWidth : null,
      viewportScrollHeight: viewport instanceof HTMLElement ? viewport.scrollHeight : null,
      surfaceTransform: surface ? window.getComputedStyle(surface).transform : null,
    };
  }, mode);
}

/**
 * 执行单个模式下的缩放控制回归。
 *
 * @param {import("playwright").Page} page
 * @param {"edit" | "preview"} mode
 * @returns {Promise<Record<string, unknown>>}
 */
async function runViewportControlChecks(page, mode) {
  const controlsRoot =
    mode === "edit"
      ? page.locator(".stage-floating-tools .stage-viewport-controls")
      : page.locator(".preview-stage-shell .stage-viewport-controls");

  await controlsRoot.waitFor();

  const initialMetrics = await readStageViewportMetrics(page, mode);
  const initialScalePercent = readScalePercent(initialMetrics.zoomLabel);
  assertOrThrow(
    initialMetrics.zoomLabel?.startsWith("适配 "),
    `${mode} 初始视图没有进入适配模式：${initialMetrics.zoomLabel}`,
  );
  assertOrThrow(
    initialScalePercent !== null && initialScalePercent < 100,
    `${mode} 初始适配缩放未小于 100%：${initialMetrics.zoomLabel}`,
  );

  await controlsRoot.getByRole("button", { name: "100%" }).click();
  const actualSizeMetrics = await readStageViewportMetrics(page, mode);
  const actualSizePercent = readScalePercent(actualSizeMetrics.zoomLabel);
  assertOrThrow(actualSizePercent === 100, `${mode} 点击 100% 后未回到 100% 视图`);
  assertOrThrow(
    actualSizeMetrics.viewportScrollWidth !== null &&
      actualSizeMetrics.viewportClientWidth !== null &&
      actualSizeMetrics.viewportScrollWidth > actualSizeMetrics.viewportClientWidth,
    `${mode} 点击 100% 后未出现横向滚动承载`,
  );

  await controlsRoot.getByRole("button", { name: "缩小" }).click();
  const zoomOutMetrics = await readStageViewportMetrics(page, mode);
  const zoomOutPercent = readScalePercent(zoomOutMetrics.zoomLabel);
  assertOrThrow(zoomOutPercent === 90, `${mode} 点击缩小后未切到 90% 视图`);

  await controlsRoot.getByRole("button", { name: "放大" }).click();
  const zoomInMetrics = await readStageViewportMetrics(page, mode);
  const zoomInPercent = readScalePercent(zoomInMetrics.zoomLabel);
  assertOrThrow(zoomInPercent === 100, `${mode} 点击放大后未回到 100% 视图`);

  await controlsRoot.getByRole("button", { name: "适配" }).click();
  const fitMetrics = await readStageViewportMetrics(page, mode);
  const fitScalePercent = readScalePercent(fitMetrics.zoomLabel);
  assertOrThrow(
    fitMetrics.zoomLabel?.startsWith("适配 "),
    `${mode} 点击适配后没有恢复适配标签：${fitMetrics.zoomLabel}`,
  );
  assertOrThrow(
    fitScalePercent === initialScalePercent,
    `${mode} 点击适配后缩放比例未回到初始值：initial=${initialScalePercent}, current=${fitScalePercent}`,
  );

  return {
    initialMetrics,
    actualSizeMetrics,
    zoomOutMetrics,
    zoomInMetrics,
    fitMetrics,
  };
}

await ensureDirectory(ASSET_DIR);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  viewports: VIEWPORTS,
  checks: [],
};

for (const viewport of VIEWPORTS) {
  logStep(`open viewport ${viewport.id}`);
  const { browser, page } = await launchBrowserSession(viewport);
  const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

  try {
    await openDemoProject(page);
    const editChecks = await runViewportControlChecks(page, "edit");

    await page.screenshot({
      path: path.join(ASSET_DIR, `${viewport.id}-edit-fit.png`),
      fullPage: true,
    });

    await openPreviewMode(page);
    const previewChecks = await runViewportControlChecks(page, "preview");

    await page.screenshot({
      path: path.join(ASSET_DIR, `${viewport.id}-preview-fit.png`),
      fullPage: true,
    });

    assertOrThrow(
      consoleErrors.length === 0,
      `${viewport.id} 存在控制台错误：${consoleErrors.join(" | ")}`,
    );
    assertOrThrow(
      pageErrors.length === 0,
      `${viewport.id} 存在页面运行时错误：${pageErrors.join(" | ")}`,
    );

    summary.checks.push({
      viewport,
      editChecks,
      previewChecks,
      consoleErrors,
      pageErrors,
    });
  } finally {
    await browser.close();
  }
}

await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
