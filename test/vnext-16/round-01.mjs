import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  launchBrowserSession,
  normalizeInlineText,
  readCanvasPixel,
  readPreviewCanvasPixel,
  readStoredProjects,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";
/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 背景图测试资源。 */
const BACKGROUND_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-09-round-01/vnext09-bg-portrait.png",
);
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-08-vnext-16-round-01");
/** 当前测试项目标题。 */
const PROJECT_TITLE = "VNext-16 背景独立回归 Round01";

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext16-test]", label);
}

/**
 * 读取指定项目中的全部 slide。
 *
 * @param {any} project
 * @returns {any[]}
 */
function readSlides(project) {
  return project?.document?.slides ?? [];
}

/**
 * 判断一个像素点是否接近纯白背景。
 *
 * @param {number[] | null} pixel
 * @returns {boolean}
 */
function isNearWhitePixel(pixel) {
  return Array.isArray(pixel) && pixel[0] >= 245 && pixel[1] >= 245 && pixel[2] >= 245;
}

/**
 * 判断一个像素点是否明显不是纯白背景。
 *
 * @param {number[] | null} pixel
 * @returns {boolean}
 */
function isNonWhitePixel(pixel) {
  return Array.isArray(pixel) && (pixel[0] < 235 || pixel[1] < 235 || pixel[2] < 235);
}

/**
 * 读取编辑器页左侧指定序号缩略页的背景样式。
 *
 * @param {import("playwright").Page} page
 * @param {number} index
 * @returns {Promise<{ backgroundImage: string; backgroundColor: string; }>}
 */
async function readEditorSlideThumbnailStyle(page, index) {
  return page.locator(".slide-rail .slide-card-shell .slide-thumbnail").nth(index).evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      backgroundImage: styles.backgroundImage,
      backgroundColor: styles.backgroundColor,
    };
  });
}

/**
 * 读取预览页左侧指定序号缩略页的背景样式。
 *
 * @param {import("playwright").Page} page
 * @param {number} index
 * @returns {Promise<{ backgroundImage: string; backgroundColor: string; }>}
 */
async function readPreviewSlideThumbnailStyle(page, index) {
  return page.locator(".preview-rail .slide-card .slide-thumbnail").nth(index).evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      backgroundImage: styles.backgroundImage,
      backgroundColor: styles.backgroundColor,
    };
  });
}

/**
 * 读取当前持久化项目记录。
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
 * 把当前项目名改成测试专用名称。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function renameProject(page) {
  const titleInput = page.getByLabel("项目标题");
  await titleInput.click();
  await titleInput.fill(PROJECT_TITLE);
  await titleInput.blur();
  await waitForSaved(page);
}

/**
 * 通过工具栏上传背景图到当前页面。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function setCurrentSlideBackgroundFromToolbar(page) {
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "设为背景" })
    .locator("input[type='file']")
    .setInputFiles(BACKGROUND_IMAGE_PATH);
  await waitForSaved(page);
  await page.waitForTimeout(400);
}

/**
 * 激活左侧页面栏中的指定页面。
 *
 * @param {import("playwright").Page} page
 * @param {number} index
 * @returns {Promise<void>}
 */
async function activateEditorSlideByIndex(page, index) {
  await page.locator(".slide-rail .slide-card").nth(index).click();
  await page.waitForTimeout(300);
}

/**
 * 激活预览页左侧页面栏中的指定页面。
 *
 * @param {import("playwright").Page} page
 * @param {number} index
 * @returns {Promise<void>}
 */
async function activatePreviewSlideByIndex(page, index) {
  await page.locator(".preview-rail .slide-card").nth(index).click();
  await page.waitForTimeout(600);
}

/**
 * 在左侧第一个页面卡片上执行“后插入”。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function createSlideAfterFirst(page) {
  await page
    .locator(".slide-rail .slide-card-shell")
    .first()
    .getByRole("button", { name: "后插入" })
    .click();
  await waitForSaved(page);
  await page.waitForTimeout(300);
}

/**
 * 读取编辑器当前画布上的一个像素点。
 *
 * @param {import("playwright").Page} page
 * @param {number} x
 * @param {number} y
 * @returns {Promise<number[] | null>}
 */
async function readEditorCanvasPixel(page, x, y) {
  return readCanvasPixel(page, ".stage-surface .lower-canvas", x, y);
}

/**
 * 如果页面设置抽屉当前处于打开态，则主动关闭它，避免遮挡左侧页面操作。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function closeSlideSettingsDrawerIfNeeded(page) {
  const drawer = page.locator(".slide-settings-drawer");

  if (!(await drawer.isVisible().catch(() => false))) {
    return;
  }

  await drawer.locator(".arco-drawer-close-btn").click();
  await drawer.waitFor({ state: "hidden" });
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(DEFAULT_VIEWPORT);
/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  backgroundImagePath: BACKGROUND_IMAGE_PATH,
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
  await renameProject(page);

  logStep("set first slide background");
  await setCurrentSlideBackgroundFromToolbar(page);
  await closeSlideSettingsDrawerIfNeeded(page);

  const firstSlidePixel = await readEditorCanvasPixel(page, 100, 80);
  const firstSlideThumbnail = await readEditorSlideThumbnailStyle(page, 0);
  const projectAfterFirstBackground = await readPersistedProject(page, projectId);

  summary.checks.push({
    id: "first-slide-background",
    firstSlidePixel,
    firstSlideHasImagePixel: isNonWhitePixel(firstSlidePixel),
    firstSlideThumbnail,
    firstSlideStorageBackground: readSlides(projectAfterFirstBackground)[0]?.background ?? null,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-first-slide-background.png"),
    fullPage: true,
  });

  logStep("create second slide from toolbar");
  await page.getByRole("button", { name: "新建页面" }).click();
  await waitForSaved(page);
  await page.waitForTimeout(200);

  const toolbarNewSlideImmediatePixel = await readEditorCanvasPixel(page, 100, 80);
  await page.waitForTimeout(600);
  const toolbarNewSlideSettledPixel = await readEditorCanvasPixel(page, 100, 80);
  const toolbarNewProject = await readPersistedProject(page, projectId);
  const toolbarNewSlides = readSlides(toolbarNewProject);

  summary.checks.push({
    id: "toolbar-new-slide",
    slideCount: toolbarNewSlides.length,
    immediatePixel: toolbarNewSlideImmediatePixel,
    settledPixel: toolbarNewSlideSettledPixel,
    background: toolbarNewSlides[1]?.background ?? null,
    thumbnail: await readEditorSlideThumbnailStyle(page, 1),
    imageIsClearedInStorage: toolbarNewSlides[1]?.background?.image === null,
    immediateLooksBlank: isNearWhitePixel(toolbarNewSlideImmediatePixel),
    settledLooksBlank: isNearWhitePixel(toolbarNewSlideSettledPixel),
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-toolbar-new-slide.png"),
    fullPage: true,
  });

  logStep("create slide after first slide");
  await activateEditorSlideByIndex(page, 0);
  await createSlideAfterFirst(page);

  const insertAfterImmediatePixel = await readEditorCanvasPixel(page, 100, 80);
  await page.waitForTimeout(600);
  const insertAfterSettledPixel = await readEditorCanvasPixel(page, 100, 80);
  const insertAfterProject = await readPersistedProject(page, projectId);
  const insertAfterSlides = readSlides(insertAfterProject);

  summary.checks.push({
    id: "insert-after-slide",
    slideCount: insertAfterSlides.length,
    immediatePixel: insertAfterImmediatePixel,
    settledPixel: insertAfterSettledPixel,
    background: insertAfterSlides[1]?.background ?? null,
    thumbnail: await readEditorSlideThumbnailStyle(page, 1),
    imageIsClearedInStorage: insertAfterSlides[1]?.background?.image === null,
    immediateLooksBlank: isNearWhitePixel(insertAfterImmediatePixel),
    settledLooksBlank: isNearWhitePixel(insertAfterSettledPixel),
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-insert-after-slide.png"),
    fullPage: true,
  });

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-slide-creation.json"),
    insertAfterProject,
  );

  logStep("reload workspace");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);
  await page.waitForTimeout(300);

  const reloadedProject = await readPersistedProject(page, projectId);
  const reloadedSlides = readSlides(reloadedProject);
  const reloadedBlankThumbnail = await readEditorSlideThumbnailStyle(page, 1);

  summary.checks.push({
    id: "reload-persistence",
    slideCount: reloadedSlides.length,
    firstSlideHasImage: Boolean(reloadedSlides[0]?.background?.image?.src),
    insertedSlideHasImage: Boolean(reloadedSlides[1]?.background?.image?.src),
    trailingSlideHasImage: Boolean(reloadedSlides[2]?.background?.image?.src),
    reloadedBlankThumbnail,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-reload.png"),
    fullPage: true,
  });

  logStep("open preview mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
  await page.waitForTimeout(800);

  const previewInitialSlideIndexLabel = normalizeInlineText(
    await page.locator(".preview-rail .slide-card.is-active .slide-index").textContent(),
  );
  await activatePreviewSlideByIndex(page, 1);
  const previewBlankPixel = await readPreviewCanvasPixel(page, 100, 80);
  const previewBlankSlideIndexLabel = normalizeInlineText(
    await page.locator(".preview-rail .slide-card.is-active .slide-index").textContent(),
  );
  await activatePreviewSlideByIndex(page, 0);
  const previewFirstSlidePixel = await readPreviewCanvasPixel(page, 100, 80);
  const previewFirstThumbnail = await readPreviewSlideThumbnailStyle(page, 0);
  const previewInsertedThumbnail = await readPreviewSlideThumbnailStyle(page, 1);
  const previewTrailingThumbnail = await readPreviewSlideThumbnailStyle(page, 2);

  summary.checks.push({
    id: "preview-regression",
    previewInitialSlideIndexLabel,
    previewBlankSlideIndexLabel,
    previewBlankPixel,
    previewBlankLooksBlank: isNearWhitePixel(previewBlankPixel),
    previewFirstSlidePixel,
    previewFirstSlideHasImagePixel: isNonWhitePixel(previewFirstSlidePixel),
    previewFirstThumbnail,
    previewInsertedThumbnail,
    previewTrailingThumbnail,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-after-reload.png"),
    fullPage: true,
  });

  const toolbarNewCheck = summary.checks.find((check) => check.id === "toolbar-new-slide");
  const insertAfterCheck = summary.checks.find((check) => check.id === "insert-after-slide");
  const previewCheck = summary.checks.find((check) => check.id === "preview-regression");

  if (!summary.checks[0]?.firstSlideHasImagePixel) {
    throw new Error("VNext-16 baseline failed: first slide background image did not render");
  }

  if (!toolbarNewCheck?.imageIsClearedInStorage || !toolbarNewCheck?.settledLooksBlank) {
    throw new Error("VNext-16 regression: toolbar-created slide still inherits previous background");
  }

  if (!insertAfterCheck?.imageIsClearedInStorage || !insertAfterCheck?.settledLooksBlank) {
    throw new Error("VNext-16 regression: insert-after slide still inherits previous background");
  }

  if (!previewCheck?.previewBlankLooksBlank || !previewCheck?.previewFirstSlideHasImagePixel) {
    throw new Error("VNext-16 regression: preview slide still shows stale background");
  }
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
