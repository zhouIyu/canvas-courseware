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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-10-vnext-24-round-01");

/** 页面设置中要写入的新页面名。 */
const UPDATED_SLIDE_NAME = "VNext-24 页面设置页";

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext24-test]", label);
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
 * 打开页面设置抽屉。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openSlideSettingsDrawer(page) {
  await page.getByRole("button", { name: "打开页面设置" }).click();
  await page.locator(".slide-settings-drawer .slide-settings-summary").waitFor();
}

/**
 * 关闭页面设置抽屉。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function closeSlideSettingsDrawer(page) {
  await page.locator(".slide-settings-drawer .arco-drawer-close-btn").click();
  await page.locator(".slide-settings-drawer").waitFor({ state: "hidden" });
}

/**
 * 读取页面设置里的页面名称输入框。
 *
 * @param {import("playwright").Page} page
 * @returns {import("playwright").Locator}
 */
function slideNameInput(page) {
  return page
    .locator(".slide-settings-drawer .field")
    .filter({
      has: page.locator(".field-label", { hasText: "页面名称" }),
    })
    .locator("input")
    .first();
}

/**
 * 把第一页名称更新为指定值。
 *
 * @param {import("playwright").Page} page
 * @param {string} value
 * @returns {Promise<void>}
 */
async function updateSlideNameFromDrawer(page, value) {
  const input = slideNameInput(page);
  await input.click();
  await input.fill(value);
  await input.blur();
  await waitForSaved(page);
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
  executedAt: new Date().toISOString(),
  updatedSlideName: UPDATED_SLIDE_NAME,
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

  logStep("open slide settings from unified entry");
  await openSlideSettingsDrawer(page);
  const slideSettingsSummaryText = normalizeInlineText(
    await page.locator(".slide-settings-drawer .slide-settings-summary").textContent(),
  );
  const basicSectionText = normalizeInlineText(
    await page.locator(".slide-settings-drawer .arco-collapse-item").first().textContent(),
  );

  summary.checks.push({
    id: "manual-slide-settings-entry",
    summaryText: slideSettingsSummaryText,
    basicSectionText,
    hasScopeHint: slideSettingsSummaryText.includes("仅作用于当前页"),
    hasCurrentSlideLabel: slideSettingsSummaryText.includes("第 1 页"),
    hasBasicGroup: basicSectionText.includes("页面基础信息"),
  });

  logStep("rename slide inside drawer");
  await updateSlideNameFromDrawer(page, UPDATED_SLIDE_NAME);
  await closeSlideSettingsDrawer(page);

  const entryButtonText = normalizeInlineText(
    await page.getByRole("button", { name: "打开页面设置" }).textContent(),
  );

  summary.checks.push({
    id: "entry-reflects-current-slide",
    entryButtonText,
    hasUpdatedSlideName: entryButtonText.includes(UPDATED_SLIDE_NAME),
    hasPageIndex: entryButtonText.includes("P1"),
  });

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

  logStep("set image as background and verify unified jump");
  await openNodeContextMenu(page, imageNode);
  await page.getByRole("button", { name: "设为背景" }).click();
  const fitModalText = await confirmBackgroundFit(page, "完整显示");
  await page.locator(".slide-settings-drawer .field-label").filter({ hasText: "背景图地址" }).waitFor();
  await page.locator(".slide-settings-drawer .arco-alert").waitFor();
  await waitForSaved(page);

  const feedbackText = normalizeInlineText(
    await page.locator(".slide-settings-drawer .arco-alert").textContent(),
  );
  const summaryAfterShortcutText = normalizeInlineText(
    await page.locator(".slide-settings-drawer .slide-settings-summary").textContent(),
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "slide-settings-after-shortcut-background.png"),
    fullPage: true,
  });

  const projectsAfterSetBackground = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterSetBackground = findProjectById(projectsAfterSetBackground, projectId);
  const slideAfterSetBackground = readFirstSlide(projectAfterSetBackground);

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-vnext-24.json"),
    projectAfterSetBackground,
  );

  summary.checks.push({
    id: "shortcut-jumps-to-background-group",
    fitModalText,
    feedbackText,
    summaryAfterShortcutText,
    hasFeedback: feedbackText.includes("设为当前页背景"),
    hasScopeHint: summaryAfterShortcutText.includes("仅作用于当前页"),
    backgroundFit: slideAfterSetBackground?.background?.image?.fit ?? null,
    hasBackgroundImage: Boolean(slideAfterSetBackground?.background?.image?.src),
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
