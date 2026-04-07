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

/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-07-vnext-14-round-01");

/** 当前测试项目标题。 */
const PROJECT_TITLE = "VNext-14 缩略图测试 Round01";

/**
 * 打印当前测试阶段，便于在终端中定位运行进度。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext14-test]", label);
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
 * 判断一段缩略图是否已经是图片 data URL。
 *
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
function isImageThumbnail(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

/**
 * 读取项目记录中指定 slide 的缩略图字符串。
 *
 * @param {any} project
 * @param {string} slideId
 * @returns {string | null}
 */
function readSlideThumbnail(project, slideId) {
  return project?.slideThumbnails?.[slideId] ?? null;
}

/**
 * 读取项目记录中的首屏项目封面。
 *
 * @param {any} project
 * @returns {string | null}
 */
function readProjectThumbnail(project) {
  return project?.thumbnail ?? null;
}

/**
 * 读取编辑页左侧指定序号缩略页的背景样式。
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
 * 读取项目列表卡片封面的背景样式。
 *
 * @param {import("playwright").Locator} card
 * @returns {Promise<{ backgroundImage: string; backgroundColor: string; }>}
 */
async function readProjectCardThumbnailStyle(card) {
  return card.locator(".project-thumbnail").evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      backgroundImage: styles.backgroundImage,
      backgroundColor: styles.backgroundColor,
    };
  });
}

/**
 * 读取当前工作台持久化后的项目记录。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<any | null>}
 */
async function readPersistedProject(page, projectId) {
  const records = await readStoredProjects(page, STORAGE_KEY);
  return findProjectById(records, projectId);
}

/**
 * 通过顶部工具条新增一个文本节点。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function addTextNode(page) {
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
}

/**
 * 通过顶部工具条新增一个矩形节点。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function addRectNode(page) {
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
}

/**
 * 把项目标题改成当前测试专用名称，并等待自动保存完成。
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
 * 在左侧页面栏点击“后插入”，创建第二页并等待当前活动页稳定。
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
  await page.waitForTimeout(300);
}

/**
 * 读取当前页面栏中全部页面名称，便于确认切页结果。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string[]>}
 */
async function readSlideNames(page) {
  const names = await page.locator(".slide-rail .slide-card-shell .slide-name").allTextContents();
  return names.map((value) => normalizeInlineText(value));
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(DEFAULT_VIEWPORT);

/** 当前页面错误收集器。 */
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

  logStep("add first text node and wait for saved thumbnail");
  await addTextNode(page);
  await waitForSaved(page);

  const projectAfterText = await readPersistedProject(page, projectId);
  const firstSlideId = readSlides(projectAfterText)[0]?.id ?? null;
  const firstThumbnailAfterText = firstSlideId ? readSlideThumbnail(projectAfterText, firstSlideId) : null;
  const projectThumbnailAfterText = readProjectThumbnail(projectAfterText);
  const editorFirstThumbAfterText = await readEditorSlideThumbnailStyle(page, 0);

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-first-text.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "save-captures-first-slide-thumbnail",
    projectId,
    firstSlideId,
    firstSlideThumbnailIsImage: isImageThumbnail(firstThumbnailAfterText),
    projectThumbnailIsImage: isImageThumbnail(projectThumbnailAfterText),
    projectThumbnailMatchesFirstSlide: projectThumbnailAfterText === firstThumbnailAfterText,
    editorBackgroundImage: editorFirstThumbAfterText.backgroundImage,
    editorUsesBackgroundImage: editorFirstThumbAfterText.backgroundImage !== "none",
  });

  logStep("add rect and confirm first slide thumbnail changes on save");
  await addRectNode(page);
  await waitForSaved(page);

  const projectAfterRect = await readPersistedProject(page, projectId);
  const firstThumbnailAfterRect = firstSlideId ? readSlideThumbnail(projectAfterRect, firstSlideId) : null;
  const editorFirstThumbAfterRect = await readEditorSlideThumbnailStyle(page, 0);

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-first-rect.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "repeat-save-refreshes-first-slide-thumbnail",
    firstSlideId,
    previousThumbnailLength: firstThumbnailAfterText?.length ?? 0,
    nextThumbnailLength: firstThumbnailAfterRect?.length ?? 0,
    thumbnailChangedAfterRect: Boolean(firstThumbnailAfterText && firstThumbnailAfterRect)
      && firstThumbnailAfterText !== firstThumbnailAfterRect,
    editorBackgroundImage: editorFirstThumbAfterRect.backgroundImage,
    editorUsesBackgroundImage: editorFirstThumbAfterRect.backgroundImage !== "none",
  });

  logStep("create second slide");
  await createSlideAfterFirst(page);

  const slideNamesAfterCreate = await readSlideNames(page);

  summary.checks.push({
    id: "create-second-slide",
    slideCount: slideNamesAfterCreate.length,
    slideNames: slideNamesAfterCreate,
  });

  logStep("edit second slide and switch back before autosave");
  await addRectNode(page);
  await page.waitForTimeout(120);
  await page.locator(".slide-rail .slide-card-shell").first().locator(".slide-card").click();
  await waitForSaved(page);

  const projectAfterSwitch = await readPersistedProject(page, projectId);
  const secondSlideId = readSlides(projectAfterSwitch)[1]?.id ?? null;
  const secondThumbnailAfterSwitch = secondSlideId ? readSlideThumbnail(projectAfterSwitch, secondSlideId) : null;
  const editorSecondThumbAfterSwitch = await readEditorSlideThumbnailStyle(page, 1);

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-switch.json"),
    projectAfterSwitch,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-switch-back.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "switch-captures-current-slide-thumbnail",
    secondSlideId,
    secondSlideThumbnailIsImage: isImageThumbnail(secondThumbnailAfterSwitch),
    secondThumbnailDiffersFromFirst: Boolean(firstThumbnailAfterRect && secondThumbnailAfterSwitch)
      && firstThumbnailAfterRect !== secondThumbnailAfterSwitch,
    editorBackgroundImage: editorSecondThumbAfterSwitch.backgroundImage,
    editorUsesBackgroundImage: editorSecondThumbAfterSwitch.backgroundImage !== "none",
  });

  logStep("open preview mode and verify slide rail thumbnails");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
  await page.waitForTimeout(800);

  const previewFirstThumb = await readPreviewSlideThumbnailStyle(page, 0);
  const previewSecondThumb = await readPreviewSlideThumbnailStyle(page, 1);

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-overview.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "preview-consumes-persisted-thumbnails",
    previewFirstBackgroundImage: previewFirstThumb.backgroundImage,
    previewSecondBackgroundImage: previewSecondThumb.backgroundImage,
    previewFirstUsesBackgroundImage: previewFirstThumb.backgroundImage !== "none",
    previewSecondUsesBackgroundImage: previewSecondThumb.backgroundImage !== "none",
  });

  logStep("return to project list and verify project cover");
  await page.getByRole("button", { name: "返回项目列表" }).click();
  await page.waitForURL(/\/projects$/);
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  const projectCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: PROJECT_TITLE }),
  }).first();
  const projectCardThumb = await readProjectCardThumbnailStyle(projectCard);

  await page.screenshot({
    path: path.join(ASSET_DIR, "project-list-after-thumbnail-sync.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "project-list-cover-uses-first-slide-thumbnail",
    coverBackgroundImage: projectCardThumb.backgroundImage,
    coverUsesBackgroundImage: projectCardThumb.backgroundImage !== "none",
    persistedProjectThumbnailIsImage: isImageThumbnail(readProjectThumbnail(projectAfterSwitch)),
    persistedProjectThumbnailMatchesFirstSlide:
      readProjectThumbnail(projectAfterSwitch) === readSlideThumbnail(projectAfterSwitch, firstSlideId),
  });

  logStep("reopen project and reload to verify persistence");
  await projectCard.getByRole("button", { name: "打开" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const persistedAfterReload = await readPersistedProject(page, projectId);
  const reloadedFirstThumb = await readEditorSlideThumbnailStyle(page, 0);
  const reloadedSecondThumb = await readEditorSlideThumbnailStyle(page, 1);

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-reload.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "reload-restores-slide-thumbnails",
    storedSlideThumbnailCount: Object.keys(persistedAfterReload?.slideThumbnails ?? {}).length,
    firstSlideThumbnailStillImage: isImageThumbnail(readSlideThumbnail(persistedAfterReload, firstSlideId)),
    secondSlideThumbnailStillImage: isImageThumbnail(readSlideThumbnail(persistedAfterReload, secondSlideId)),
    reloadedFirstBackgroundImage: reloadedFirstThumb.backgroundImage,
    reloadedSecondBackgroundImage: reloadedSecondThumb.backgroundImage,
    reloadedFirstUsesBackgroundImage: reloadedFirstThumb.backgroundImage !== "none",
    reloadedSecondUsesBackgroundImage: reloadedSecondThumb.backgroundImage !== "none",
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
