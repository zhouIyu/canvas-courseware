import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  launchBrowserSession,
  normalizeInlineText,
  readStoredProjects,
  readViewportMetrics,
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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-09-vnext-19-round-01");

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext19-test]", label);
}

/**
 * 读取当前首页中的第一个 slide。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readFirstSlide(project) {
  return project?.document?.slides?.[0] ?? null;
}

/**
 * 读取当前首页中的第一个图片节点。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readFirstImageNode(project) {
  return readFirstSlide(project)?.nodes?.find((node) => node.type === "image") ?? null;
}

/**
 * 把画布本地坐标换算成当前视口中的点击点。
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
 * 根据节点几何信息，返回一个稳定落在节点区域内的点击点。
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
 * 在指定节点位置触发右键菜单。
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

  logStep("insert empty image frame");
  await page.getByRole("button", { name: "图片框" }).click();
  await waitForSaved(page);

  const projectsAfterFrameInsert = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterFrameInsert = findProjectById(projectsAfterFrameInsert, projectId);
  const emptyImageFrame = readFirstImageNode(projectAfterFrameInsert);
  if (!emptyImageFrame) {
    throw new Error("未找到刚插入的空图片框");
  }

  logStep("verify empty image frame has no background shortcut");
  await openNodeContextMenu(page, emptyImageFrame);
  const emptyFrameMenuText = normalizeInlineText(await page.locator(".stage-context-menu").textContent());

  summary.checks.push({
    id: "empty-image-frame-context-menu",
    menuText: emptyFrameMenuText,
    hasSetBackground: emptyFrameMenuText.includes("设为背景"),
    hasDelete: emptyFrameMenuText.includes("删除所选"),
    metrics: await readViewportMetrics(page),
  });

  await page.getByRole("button", { name: "删除所选" }).click();
  await waitForSaved(page);

  logStep("insert local image node");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({
      has: page.getByRole("button", { name: "插入图片" }),
    })
    .locator("input[type='file']")
    .setInputFiles(IMAGE_PATH);
  await waitForSaved(page);

  const projectsAfterImageInsert = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterImageInsert = findProjectById(projectsAfterImageInsert, projectId);
  const imageNode = readFirstImageNode(projectAfterImageInsert);
  if (!imageNode || !imageNode.props?.src) {
    throw new Error("插入本地图片后，未在项目存储中找到有效图片节点");
  }

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-image-insert.json"),
    projectAfterImageInsert,
  );

  logStep("open image context menu");
  await openNodeContextMenu(page, imageNode);

  await page.screenshot({
    path: path.join(ASSET_DIR, "image-context-menu.png"),
    fullPage: true,
  });

  const imageMenuText = normalizeInlineText(await page.locator(".stage-context-menu").textContent());

  summary.checks.push({
    id: "image-context-menu",
    menuText: imageMenuText,
    hasSetBackground: imageMenuText.includes("设为背景"),
    hasCopy: imageMenuText.includes("复制所选"),
    hasDuplicate: imageMenuText.includes("重复所选"),
    hasDelete: imageMenuText.includes("删除所选"),
  });

  logStep("convert image node to slide background");
  await page.getByRole("button", { name: "设为背景" }).click();
  await page.locator(".slide-settings-drawer .slide-settings-panel").waitFor();
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-set-background-from-context-menu.png"),
    fullPage: true,
  });

  const projectsAfterConvert = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterConvert = findProjectById(projectsAfterConvert, projectId);
  const slideAfterConvert = readFirstSlide(projectAfterConvert);
  const sourceLabel = normalizeInlineText(
    await page
      .locator(".slide-settings-drawer .field-help")
      .filter({ hasText: "保存后会随项目一起恢复" })
      .first()
      .textContent(),
  );

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-context-set-background.json"),
    projectAfterConvert,
  );

  summary.checks.push({
    id: "set-background-from-image-node",
    remainingNodeCount: slideAfterConvert?.nodes?.length ?? null,
    hasBackgroundImage: Boolean(slideAfterConvert?.background?.image?.src),
    backgroundFit: slideAfterConvert?.background?.image?.fit ?? null,
    sourceLabel,
    removedOriginalNode: (slideAfterConvert?.nodes?.length ?? 0) === 0,
  });

  logStep("reload workspace");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
    fullPage: true,
  });

  const projectsAfterReload = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterReload = findProjectById(projectsAfterReload, projectId);
  const slideAfterReload = readFirstSlide(projectAfterReload);

  summary.checks.push({
    id: "reload-persistence",
    remainingNodeCount: slideAfterReload?.nodes?.length ?? null,
    hasBackgroundImage: Boolean(slideAfterReload?.background?.image?.src),
    backgroundFit: slideAfterReload?.background?.image?.fit ?? null,
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
