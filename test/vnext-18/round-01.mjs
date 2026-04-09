import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  launchBrowserSession,
  readStoredProjects,
  readViewportMetrics,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";
/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-08-vnext-18-round-01");
/** 当前测试项目标题。 */
const PROJECT_TITLE = "VNext-18 文本缩放测试 Round01";

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext18-test]", label);
}

/**
 * 读取指定项目中的首个文本节点。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readFirstTextNode(project) {
  return project?.document?.slides?.[0]?.nodes?.find((node) => node.type === "text") ?? null;
}

/**
 * 读取当前已持久化的目标项目。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<any | null>}
 */
async function readPersistedProject(page, projectId) {
  const projects = await readStoredProjects(page, STORAGE_KEY);
  return findProjectById(projects, projectId);
}

/**
 * 把画布坐标换算成当前视口中的像素位置。
 *
 * @param {import("playwright").Page} page
 * @param {number} x
 * @param {number} y
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function resolveCanvasViewportPoint(page, x, y) {
  return page.locator(".stage-surface").evaluate((element, point) => {
    const rect = element.getBoundingClientRect();
    const canvas = element.querySelector("canvas.lower-canvas");
    const canvasWidth = canvas instanceof HTMLCanvasElement ? canvas.width : 1280;
    const canvasHeight = canvas instanceof HTMLCanvasElement ? canvas.height : 720;

    return {
      x: rect.left + (point.x / canvasWidth) * rect.width,
      y: rect.top + (point.y / canvasHeight) * rect.height,
    };
  }, { x, y });
}

/**
 * 读取开发态调试桥中当前选中文本对象的右下角控制点。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function readActiveTextBottomRightControl(page) {
  return page.evaluate(() => {
    const target = window.__CW_EDITOR_DEBUG__?.getCanvas?.()?.getActiveObject?.();
    const control = target?.oCoords?.br;

    if (!control) {
      throw new Error("未找到当前文本对象的右下角控制点");
    }

    return {
      x: control.x,
      y: control.y,
    };
  });
}

/**
 * 读取开发态调试桥中当前选中文本对象的实时几何。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ width: number | null; height: number | null; scaledWidth: number | null; scaledHeight: number | null; }>}
 */
async function readActiveTextGeometry(page) {
  return page.evaluate(() => {
    const target = window.__CW_EDITOR_DEBUG__?.getCanvas?.()?.getActiveObject?.();

    return {
      width: target?.width ?? null,
      height: target?.height ?? null,
      scaledWidth: target?.getScaledWidth?.() ?? null,
      scaledHeight: target?.getScaledHeight?.() ?? null,
    };
  });
}

/**
 * 拖动当前文本对象的右下角控制点，触发一次真实缩放。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function resizeActiveTextNode(page) {
  const controlPoint = await readActiveTextBottomRightControl(page);
  const viewportPoint = await resolveCanvasViewportPoint(page, controlPoint.x, controlPoint.y);

  await page.mouse.move(viewportPoint.x, viewportPoint.y);
  await page.mouse.down();
  await page.mouse.move(viewportPoint.x + 140, viewportPoint.y + 60, {
    steps: 12,
  });
  await page.mouse.up();
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(DEFAULT_VIEWPORT);
/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  projectTitle: PROJECT_TITLE,
  executedAt: new Date().toISOString(),
  desktopViewport: DEFAULT_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open project list");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
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

  /** 当前测试项目 id。 */
  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";

  logStep("rename project");
  const titleInput = page.getByLabel("项目标题");
  await titleInput.click();
  await titleInput.fill(PROJECT_TITLE);
  await titleInput.blur();
  await waitForSaved(page);

  logStep("insert text node");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);

  const projectAfterInsert = await readPersistedProject(page, projectId);
  const textNodeBeforeResize = readFirstTextNode(projectAfterInsert);
  const canvasGeometryBeforeResize = await readActiveTextGeometry(page);

  summary.checks.push({
    id: "before-resize",
    storedWidth: textNodeBeforeResize?.width ?? null,
    storedHeight: textNodeBeforeResize?.height ?? null,
    canvasGeometryBeforeResize,
  });

  logStep("resize text node from bottom-right control");
  await resizeActiveTextNode(page);
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-text-resize.png"),
    fullPage: true,
  });

  const projectAfterResize = await readPersistedProject(page, projectId);
  const textNodeAfterResize = readFirstTextNode(projectAfterResize);
  const canvasGeometryAfterResize = await readActiveTextGeometry(page);

  summary.checks.push({
    id: "after-resize",
    storedWidth: textNodeAfterResize?.width ?? null,
    storedHeight: textNodeAfterResize?.height ?? null,
    canvasGeometryAfterResize,
    widthIncreased:
      typeof textNodeAfterResize?.width === "number" &&
      typeof textNodeBeforeResize?.width === "number" &&
      textNodeAfterResize.width > textNodeBeforeResize.width,
    heightUpdated:
      typeof textNodeAfterResize?.height === "number" &&
      typeof textNodeBeforeResize?.height === "number" &&
      textNodeAfterResize.height !== textNodeBeforeResize.height,
  });

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-text-resize.json"),
    projectAfterResize,
  );

  logStep("reload workspace");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
    fullPage: true,
  });

  const projectAfterReload = await readPersistedProject(page, projectId);
  const textNodeAfterReload = readFirstTextNode(projectAfterReload);
  const canvasGeometryAfterReload = await readActiveTextGeometry(page);

  summary.checks.push({
    id: "reload-persistence",
    storedWidth: textNodeAfterReload?.width ?? null,
    storedHeight: textNodeAfterReload?.height ?? null,
    canvasGeometryAfterReload,
    widthPersisted: textNodeAfterReload?.width === textNodeAfterResize?.width,
    heightPersisted: textNodeAfterReload?.height === textNodeAfterResize?.height,
  });

  logStep("open preview mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-after-resize.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "preview-smoke",
    previewStageVisible: await page.locator(".preview-stage-surface .lower-canvas").isVisible(),
    resetButtonVisible: await page
      .locator(".embedded-preview-actions")
      .getByRole("button", { name: "重置播放" })
      .isVisible(),
    metrics: await readViewportMetrics(page),
  });

  if (!summary.checks.find((check) => check.id === "after-resize")?.widthIncreased) {
    throw new Error("VNext-18 text width did not update after dragging the bottom-right control");
  }

  if (!summary.checks.find((check) => check.id === "after-resize")?.heightUpdated) {
    throw new Error("VNext-18 text height did not update after dragging the bottom-right control");
  }

  if (!summary.checks.find((check) => check.id === "reload-persistence")?.widthPersisted) {
    throw new Error("VNext-18 resized text width did not persist after reload");
  }
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
