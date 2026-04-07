import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  launchBrowserSession,
  normalizeInlineText,
  readPreviewCanvasPixel,
  readStoredProjects,
  readViewportMetrics,
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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-07-vnext-12-round-01");

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext12-test]", label);
}

/**
 * 读取当前项目首页的背景配置。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readFirstSlideBackground(project) {
  return project?.document?.slides?.[0]?.background ?? null;
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
  const toolbarText = normalizeInlineText(await page.locator(".toolbar-group-insert").textContent());

  summary.checks.push({
    id: "toolbar-background-entry",
    projectId,
    toolbarText,
    hasBackgroundEntry: toolbarText.includes("设为背景"),
    metrics: await readViewportMetrics(page),
  });

  logStep("upload image as background");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "设为背景" })
    .locator("input[type='file']")
    .setInputFiles(BACKGROUND_IMAGE_PATH);
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-set-background.png"),
    fullPage: true,
  });

  const projectsAfterUpload = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterUpload = findProjectById(projectsAfterUpload, projectId);
  const backgroundAfterUpload = readFirstSlideBackground(projectAfterUpload);

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-set-background.json"),
    projectAfterUpload,
  );

  summary.checks.push({
    id: "set-background-result",
    activeTabs: await page.locator(".arco-tabs-tab-active").allTextContents(),
    sourceLabel: normalizeInlineText(
      await page.getByText("已导入本地图片，保存后会随项目一起恢复").textContent(),
    ),
    fitValue: normalizeInlineText(
      await page.locator(".slide-settings-panel .arco-select-view-value").textContent(),
    ),
    clearDisabled: await page.getByRole("button", { name: "清空背景图" }).isDisabled(),
    backgroundImageFit: backgroundAfterUpload?.image?.fit ?? null,
    backgroundHasImage: Boolean(backgroundAfterUpload?.image?.src),
    backgroundFill: backgroundAfterUpload?.fill ?? null,
  });

  logStep("reload workspace");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-reload.png"),
    fullPage: true,
  });

  const projectsAfterReload = await readStoredProjects(page, STORAGE_KEY);
  const backgroundAfterReload = readFirstSlideBackground(findProjectById(projectsAfterReload, projectId));

  summary.checks.push({
    id: "reload-persistence",
    backgroundHasImage: Boolean(backgroundAfterReload?.image?.src),
    backgroundImageFit: backgroundAfterReload?.image?.fit ?? null,
  });

  logStep("open preview mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-after-set-background.png"),
    fullPage: true,
  });

  const topPixel = await readPreviewCanvasPixel(page, 100, 80);
  const middlePixel = await readPreviewCanvasPixel(page, 100, 360);
  const bottomPixel = await readPreviewCanvasPixel(page, 100, 640);

  const previewCheck = {
    topPixel,
    middlePixel,
    bottomPixel,
    topLooksWarm: Array.isArray(topPixel) ? topPixel[0] > topPixel[2] : false,
    middleLooksLight: Array.isArray(middlePixel) ? middlePixel[0] > 200 && middlePixel[1] > 200 : false,
    bottomLooksBlue: Array.isArray(bottomPixel) ? bottomPixel[2] > bottomPixel[0] : false,
  };

  await writeJsonFile(path.join(ASSET_DIR, "preview-check.json"), previewCheck);

  summary.checks.push({
    id: "preview-render",
    ...previewCheck,
    metrics: await readViewportMetrics(page),
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
