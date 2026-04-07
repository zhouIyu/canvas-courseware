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
/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 首次插图测试资源。 */
const INSERT_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-08-round-01/vnext08-sample.png",
);
/** 换图测试资源。 */
const REPLACE_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-09-round-01/vnext09-bg-portrait.png",
);
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-07-vnext-11-round-01");

/**
 * 打印阶段日志，便于定位失败步骤。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext11-test]", label);
}

/**
 * 读取当前项目首页中的首个图片节点。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readFirstImageNode(project) {
  return project?.document?.slides?.[0]?.nodes?.find((node) => node.type === "image") ?? null;
}

/**
 * 定位“基础属性”卡片下的数值输入框。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {import("playwright").Locator}
 */
function inspectorNumberInput(page, label) {
  const baseCard = page.locator(".group-card").filter({
    has: page.getByRole("heading", { name: "基础属性" }),
  });

  return baseCard
    .locator(".field")
    .filter({
      has: page.locator(".field-label", { hasText: label }),
    })
    .locator("input")
    .first();
}

/**
 * 更新数值输入框并触发 blur，让属性面板完成写回。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {number} value
 * @returns {Promise<void>}
 */
async function setInspectorNumber(page, label, value) {
  const input = inspectorNumberInput(page, label);
  await input.click();
  await input.fill(String(value));
  await input.blur();
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(DEFAULT_VIEWPORT);
/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  insertImagePath: INSERT_IMAGE_PATH,
  replaceImagePath: REPLACE_IMAGE_PATH,
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
    id: "toolbar-labels",
    projectId,
    toolbarText,
    hasImageButton: toolbarText.includes("图片"),
    hasImageFrameButton: toolbarText.includes("图片框"),
    hasLegacyImportLabel: toolbarText.includes("导入图片"),
    metrics: await readViewportMetrics(page),
  });

  logStep("insert local image from toolbar");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "图片" })
    .first()
    .locator("input[type='file']")
    .setInputFiles(INSERT_IMAGE_PATH);
  await page.getByRole("heading", { name: "图片属性" }).waitFor();
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-insert.png"),
    fullPage: true,
  });

  const projectsAfterInsert = await readStoredProjects(page, STORAGE_KEY);
  const imageAfterInsert = readFirstImageNode(findProjectById(projectsAfterInsert, projectId));

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-insert.json"),
    findProjectById(projectsAfterInsert, projectId),
  );

  summary.checks.push({
    id: "insert-image",
    imageNodeId: imageAfterInsert?.id ?? null,
    name: imageAfterInsert?.name ?? null,
    x: imageAfterInsert?.x ?? null,
    y: imageAfterInsert?.y ?? null,
    width: imageAfterInsert?.width ?? null,
    height: imageAfterInsert?.height ?? null,
    alt: imageAfterInsert?.props?.alt ?? null,
    objectFit: imageAfterInsert?.props?.objectFit ?? null,
  });

  logStep("adjust image layout");
  await setInspectorNumber(page, "X", 420);
  await setInspectorNumber(page, "Y", 210);
  await setInspectorNumber(page, "宽度", 360);
  await setInspectorNumber(page, "高度", 240);
  await waitForSaved(page);

  const projectsAfterLayout = await readStoredProjects(page, STORAGE_KEY);
  const imageAfterLayout = readFirstImageNode(findProjectById(projectsAfterLayout, projectId));

  summary.checks.push({
    id: "update-layout-before-replace",
    imageNodeId: imageAfterLayout?.id ?? null,
    x: imageAfterLayout?.x ?? null,
    y: imageAfterLayout?.y ?? null,
    width: imageAfterLayout?.width ?? null,
    height: imageAfterLayout?.height ?? null,
    objectFit: imageAfterLayout?.props?.objectFit ?? null,
  });

  logStep("replace image from inspector");
  const imageCard = page.locator(".group-card").filter({
    has: page.getByRole("heading", { name: "图片属性" }),
  });
  await imageCard.locator(".image-source-row input[type='file']").setInputFiles(REPLACE_IMAGE_PATH);
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-replace.png"),
    fullPage: true,
  });

  const projectsAfterReplace = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterReplace = findProjectById(projectsAfterReplace, projectId);
  const imageAfterReplace = readFirstImageNode(projectAfterReplace);

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-replace.json"),
    projectAfterReplace,
  );

  summary.checks.push({
    id: "replace-image",
    imageNodeId: imageAfterReplace?.id ?? null,
    sameNodeId: imageAfterReplace?.id === imageAfterLayout?.id,
    x: imageAfterReplace?.x ?? null,
    y: imageAfterReplace?.y ?? null,
    width: imageAfterReplace?.width ?? null,
    height: imageAfterReplace?.height ?? null,
    alt: imageAfterReplace?.props?.alt ?? null,
    objectFit: imageAfterReplace?.props?.objectFit ?? null,
    srcChanged: imageAfterReplace?.props?.src !== imageAfterLayout?.props?.src,
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
  const imageAfterReload = readFirstImageNode(findProjectById(projectsAfterReload, projectId));

  summary.checks.push({
    id: "reload-persistence",
    imageNodeId: imageAfterReload?.id ?? null,
    sameNodeAfterReload: imageAfterReload?.id === imageAfterReplace?.id,
    x: imageAfterReload?.x ?? null,
    y: imageAfterReload?.y ?? null,
    width: imageAfterReload?.width ?? null,
    height: imageAfterReload?.height ?? null,
    alt: imageAfterReload?.props?.alt ?? null,
    objectFit: imageAfterReload?.props?.objectFit ?? null,
  });

  logStep("open preview mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-after-replace.png"),
    fullPage: true,
  });

  const topPixel = await readPreviewCanvasPixel(page, 600, 230);
  const bottomPixel = await readPreviewCanvasPixel(page, 600, 430);

  const previewCheck = {
    topPixel,
    bottomPixel,
    topLooksWarm: Array.isArray(topPixel) ? topPixel[0] > topPixel[2] : false,
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
