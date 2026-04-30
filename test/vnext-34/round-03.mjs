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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-29-vnext-34-c-round-01");

/** 允许的适配误差，单位像素。 */
const FIT_TOLERANCE_PX = 0.5;

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
  console.log("[vnext34-c-test]", label);
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
}

/**
 * 读取当前模式下画布外框与可用区的适配指标。
 *
 * @param {import("playwright").Page} page
 * @param {"edit" | "preview"} mode
 * @returns {Promise<{
 *   mode: "edit" | "preview";
 *   frameWidth: number | null;
 *   frameHeight: number | null;
 *   fitWidth: number | null;
 *   fitHeight: number | null;
 *   surfaceTransform: string | null;
 *   hasInsightStrip: boolean;
 * }>}
 */
async function readStageFitMetrics(page, mode) {
  return page.evaluate((currentMode) => {
    /**
     * 把 CSS 盒模型尺寸文本转成数值。
     *
     * @param {string} value
     * @returns {number}
     */
    function readCssBoxValue(value) {
      const parsedValue = Number.parseFloat(value);
      return Number.isFinite(parsedValue) ? parsedValue : 0;
    }

    /**
     * 读取目标元素真正可用于摆放画布的内容区尺寸。
     *
     * @param {Element | null} element
     * @returns {{ width: number; height: number; }}
     */
    function readContentSize(element) {
      if (!(element instanceof HTMLElement)) {
        return {
          width: 0,
          height: 0,
        };
      }

      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      const horizontalInset =
        readCssBoxValue(styles.paddingLeft) +
        readCssBoxValue(styles.paddingRight) +
        readCssBoxValue(styles.borderLeftWidth) +
        readCssBoxValue(styles.borderRightWidth);
      const verticalInset =
        readCssBoxValue(styles.paddingTop) +
        readCssBoxValue(styles.paddingBottom) +
        readCssBoxValue(styles.borderTopWidth) +
        readCssBoxValue(styles.borderBottomWidth);

      return {
        width: Math.max(rect.width - horizontalInset, 0),
        height: Math.max(rect.height - verticalInset, 0),
      };
    }

    const frameSelector =
      currentMode === "edit" ? ".stage-scale-frame" : ".preview-stage-frame";
    const fitAreaSelector =
      currentMode === "edit" ? ".stage-fit-viewport" : ".preview-stage-viewport";
    const surfaceSelector =
      currentMode === "edit" ? ".stage-surface" : ".preview-stage-surface";
    const frame = document.querySelector(frameSelector);
    const fitArea = document.querySelector(fitAreaSelector);
    const surface = document.querySelector(surfaceSelector);
    const fitSize = readContentSize(fitArea);

    return {
      mode: currentMode,
      frameWidth: frame?.getBoundingClientRect().width ?? null,
      frameHeight: frame?.getBoundingClientRect().height ?? null,
      fitWidth: fitSize.width,
      fitHeight: fitSize.height,
      surfaceTransform: surface ? window.getComputedStyle(surface).transform : null,
      hasInsightStrip: Boolean(document.querySelector(".playback-insight-strip")),
    };
  }, mode);
}

/**
 * 断言当前画布外框没有超出真实可用区。
 *
 * @param {{ frameWidth: number | null; frameHeight: number | null; fitWidth: number | null; fitHeight: number | null; }} metrics
 * @param {string} label
 * @returns {void}
 */
function assertStageFits(metrics, label) {
  assertOrThrow(
    metrics.frameWidth !== null && metrics.frameHeight !== null,
    `${label} 未读取到画布外框尺寸`,
  );
  assertOrThrow(metrics.fitWidth !== null && metrics.fitHeight !== null, `${label} 未读取到可用区尺寸`);
  assertOrThrow(
    metrics.frameWidth <= metrics.fitWidth + FIT_TOLERANCE_PX,
    `${label} 画布宽度超出可用区：frame=${metrics.frameWidth}, fit=${metrics.fitWidth}`,
  );
  assertOrThrow(
    metrics.frameHeight <= metrics.fitHeight + FIT_TOLERANCE_PX,
    `${label} 画布高度超出可用区：frame=${metrics.frameHeight}, fit=${metrics.fitHeight}`,
  );
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

await ensureDirectory(ASSET_DIR);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  tolerancePx: FIT_TOLERANCE_PX,
  viewports: VIEWPORTS,
  checks: [],
};

for (const viewport of VIEWPORTS) {
  logStep(`open viewport ${viewport.id}`);
  const { browser, page } = await launchBrowserSession(viewport);
  const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

  try {
    await openDemoProject(page);
    await page.locator(".stage-surface .lower-canvas").waitFor();

    logStep(`read edit metrics for ${viewport.id}`);
    const editMetrics = await readStageFitMetrics(page, "edit");
    assertStageFits(editMetrics, `${viewport.id} 编辑态`);

    await page.screenshot({
      path: path.join(ASSET_DIR, `${viewport.id}-edit.png`),
      fullPage: true,
    });

    logStep(`read preview metrics for ${viewport.id}`);
    await openPreviewMode(page);
    const previewMetrics = await readStageFitMetrics(page, "preview");
    assertStageFits(previewMetrics, `${viewport.id} 预览态`);
    assertOrThrow(
      !previewMetrics.hasInsightStrip,
      `${viewport.id} 预览态中心区域仍保留了播放说明卡片`,
    );

    await page.screenshot({
      path: path.join(ASSET_DIR, `${viewport.id}-preview.png`),
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
      editMetrics,
      previewMetrics,
      consoleErrors,
      pageErrors,
    });
  } finally {
    await browser.close();
  }
}

await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
