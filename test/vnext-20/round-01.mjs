import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  launchBrowserSession,
  normalizeInlineText,
  readStoredProjects,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";
/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 图片节点测试资源。 */
const IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-08-round-01/vnext08-sample.png",
);
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-09-vnext-20-round-01");

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext20-test]", label);
}

/**
 * 读取当前项目中的首页 slide。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readFirstSlide(project) {
  return project?.document?.slides?.[0] ?? null;
}

/**
 * 读取当前首页中的第一张图片节点。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readFirstImageNode(project) {
  return readFirstSlide(project)?.nodes?.find((node) => node.type === "image") ?? null;
}

/**
 * 把画布本地坐标换算成视口中的真实点击位置。
 *
 * @param {import("playwright").Page} page
 * @param {number} localX
 * @param {number} localY
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function resolveCanvasViewportPoint(page, localX, localY) {
  return page.locator(".stage-surface").evaluate((element, point) => {
    const rect = element.getBoundingClientRect();
    const canvas = element.querySelector("canvas");
    const canvasWidth = canvas instanceof HTMLCanvasElement ? canvas.width : 1280;
    const canvasHeight = canvas instanceof HTMLCanvasElement ? canvas.height : 720;

    return {
      x: rect.left + (point.x / canvasWidth) * rect.width,
      y: rect.top + (point.y / canvasHeight) * rect.height,
    };
  }, {
    x: localX,
    y: localY,
  });
}

/**
 * 根据节点几何信息返回稳定落在节点内部的点击点。
 *
 * @param {import("playwright").Page} page
 * @param {any} node
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function resolveNodePoint(page, node) {
  const localX = node.x + Math.max(Math.round(node.width / 2), 24);
  const localY = node.y + Math.max(Math.round(node.height / 2), 24);
  return resolveCanvasViewportPoint(page, localX, localY);
}

/**
 * 在指定图片节点处打开右键菜单。
 *
 * @param {import("playwright").Page} page
 * @param {any} node
 * @returns {Promise<void>}
 */
async function openNodeContextMenu(page, node) {
  const point = await resolveNodePoint(page, node);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.locator(".stage-context-menu").waitFor();
}

/**
 * 如页面设置抽屉仍然打开，则先关闭，避免遮挡画布交互。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function closeSlideSettingsDrawerIfVisible(page) {
  const drawer = page.locator(".slide-settings-drawer");
  if (!(await drawer.isVisible().catch(() => false))) {
    return;
  }

  await drawer.locator(".arco-drawer-close-btn").click();
  await drawer.waitFor({ state: "hidden" });
}

/**
 * 在“设为背景”确认弹层中选择目标填充方式并完成确认。
 *
 * @param {import("playwright").Page} page
 * @param {string} optionLabel
 * @returns {Promise<string>}
 */
async function confirmBackgroundFit(page, optionLabel) {
  const modal = page.locator(".background-fit-modal");
  await modal.waitFor();
  const modalText = normalizeInlineText(await modal.textContent());

  await modal.getByRole("button", { name: new RegExp(optionLabel) }).click();
  await modal.getByRole("button", { name: "确认设为背景" }).click();

  return modalText;
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(DEFAULT_VIEWPORT);
/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  imagePath: IMAGE_PATH,
  executedAt: new Date().toISOString(),
  desktopViewport: DEFAULT_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open project list");
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

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";

  logStep("set toolbar background with explicit contain");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "设为背景" })
    .locator("input[type='file']")
    .setInputFiles(IMAGE_PATH);

  const toolbarModalText = await confirmBackgroundFit(page, "完整显示");
  await page.locator(".slide-settings-drawer .slide-settings-panel").waitFor();
  await waitForSaved(page);

  const projectsAfterToolbarBackground = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterToolbarBackground = findProjectById(projectsAfterToolbarBackground, projectId);
  const slideAfterToolbarBackground = readFirstSlide(projectAfterToolbarBackground);

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-toolbar-set-background.json"),
    projectAfterToolbarBackground,
  );

  summary.checks.push({
    id: "toolbar-background-fit-modal",
    modalText: toolbarModalText,
    backgroundFit: slideAfterToolbarBackground?.background?.image?.fit ?? null,
    hasBackgroundImage: Boolean(slideAfterToolbarBackground?.background?.image?.src),
  });

  await closeSlideSettingsDrawerIfVisible(page);

  logStep("insert local image node");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "图片" })
    .locator("input[type='file']")
    .setInputFiles(IMAGE_PATH);
  await waitForSaved(page);

  const projectsAfterImageInsert = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterImageInsert = findProjectById(projectsAfterImageInsert, projectId);
  const imageNode = readFirstImageNode(projectAfterImageInsert);
  if (!imageNode || !imageNode.props?.src) {
    throw new Error("插入本地图片后，未在项目存储中找到有效图片节点");
  }

  logStep("convert image node to background with explicit fill");
  await openNodeContextMenu(page, imageNode);
  await page.getByRole("button", { name: "设为背景" }).click();

  const contextModalText = await confirmBackgroundFit(page, "拉伸铺满");
  await page.locator(".slide-settings-drawer .slide-settings-panel").waitFor();
  await waitForSaved(page);

  const projectsAfterContextBackground = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterContextBackground = findProjectById(projectsAfterContextBackground, projectId);
  const slideAfterContextBackground = readFirstSlide(projectAfterContextBackground);

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-context-set-background.json"),
    projectAfterContextBackground,
  );

  summary.checks.push({
    id: "context-background-fit-modal",
    modalText: contextModalText,
    backgroundFit: slideAfterContextBackground?.background?.image?.fit ?? null,
    hasBackgroundImage: Boolean(slideAfterContextBackground?.background?.image?.src),
    remainingNodeCount: slideAfterContextBackground?.nodes?.length ?? null,
  });

  logStep("reload workspace");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const projectsAfterReload = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterReload = findProjectById(projectsAfterReload, projectId);
  const slideAfterReload = readFirstSlide(projectAfterReload);

  summary.checks.push({
    id: "reload-persistence",
    backgroundFit: slideAfterReload?.background?.image?.fit ?? null,
    hasBackgroundImage: Boolean(slideAfterReload?.background?.image?.src),
    remainingNodeCount: slideAfterReload?.nodes?.length ?? null,
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
