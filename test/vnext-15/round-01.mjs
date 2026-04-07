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

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-07-vnext-15-round-01");

/** 当前测试项目名称。 */
const PROJECT_TITLE = "VNext-15 组件浮层测试 Round01";

/** 页面设置中要写入的新页面名。 */
const UPDATED_SLIDE_NAME = "封面页-浮层抽屉";

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext15-test]", label);
}

/**
 * 读取当前项目的第一页节点。
 *
 * @param {any} project
 * @returns {any[]}
 */
function readFirstSlideNodes(project) {
  return project?.document?.slides?.[0]?.nodes ?? [];
}

/**
 * 读取当前项目的第一页。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readFirstSlide(project) {
  return project?.document?.slides?.[0] ?? null;
}

/**
 * 根据节点类型生成浮层中展示的“类型-名称”文案。
 *
 * @param {any} node
 * @returns {string}
 */
function resolveLayerDisplayLabel(node) {
  const typeLabelMap = {
    text: "文本",
    rect: "矩形",
    image: "图片",
  };

  const typeLabel = typeLabelMap[node?.type] ?? String(node?.type ?? "");
  return `${typeLabel}-${node?.name ?? ""}`;
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
 * 读取浮层图层列表中的全部名称。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string[]>}
 */
async function readFloatingLayerLabels(page) {
  const contents = await page.locator(".floating-layer-item__name").allTextContents();
  return contents.map((value) => normalizeInlineText(value));
}

/**
 * 读取右侧 tabs 的文本摘要。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function readSideTabsText(page) {
  return normalizeInlineText(await page.locator(".side-tabs-nav").textContent());
}

/**
 * 通过顶部标题输入框改项目名。
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
 * 通过工具栏快速新增文本、矩形和图片框。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function seedNodes(page) {
  const toolbar = page.locator(".toolbar-group-insert");
  await toolbar.getByRole("button", { name: "文本" }).click();
  await toolbar.getByRole("button", { name: "矩形" }).click();
  await toolbar.getByRole("button", { name: "图片框" }).click();
  await waitForSaved(page);
}

/**
 * 打开图层浮层。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openFloatingLayerManager(page) {
  await page.getByRole("button", { name: "展开图层管理" }).click();
  await page.locator(".floating-layer-manager__panel").waitFor();
}

/**
 * 打开右侧管理栏。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openEditorSide(page) {
  await page.getByRole("button", { name: "展开右侧管理栏" }).click();
  await page.locator(".editor-side").waitFor();
}

/**
 * 打开页面设置抽屉。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openSlideSettingsDrawer(page) {
  await page.getByRole("button", { name: "打开页面设置" }).click();
  await page.locator(".slide-settings-drawer").waitFor();
  await page
    .locator(".slide-settings-drawer .field-label")
    .filter({ hasText: "页面名称" })
    .waitFor();
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
 * 把一个图层项拖到另一个图层项后方。
 *
 * @param {import("playwright").Locator} source
 * @param {import("playwright").Locator} target
 * @returns {Promise<void>}
 */
async function dragLayerItemAfter(source, target) {
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error("未能读取目标图层项尺寸，无法执行拖拽");
  }

  await source.dragTo(target, {
    targetPosition: {
      x: Math.max(Math.floor(targetBox.width / 2), 8),
      y: Math.max(Math.floor(targetBox.height - 6), 8),
    },
  });
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
  updatedSlideName: UPDATED_SLIDE_NAME,
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

  logStep("check default collapsed layout");
  const layerTrigger = page.getByRole("button", { name: "展开图层管理" });
  const pageSettingsTrigger = page.getByRole("button", { name: "打开页面设置" });

  summary.checks.push({
    id: "default-layout",
    projectId,
    rightSideVisible: await page.locator(".editor-side").isVisible(),
    pageSettingsTriggerVisible: await pageSettingsTrigger.isVisible(),
    layerTriggerVisible: await layerTrigger.isVisible(),
    floatingPanelVisible: await page.locator(".floating-layer-manager__panel").isVisible().catch(() => false),
  });

  logStep("seed nodes");
  await seedNodes(page);

  const projectAfterSeed = await readPersistedProject(page, projectId);
  const nodesAfterSeed = readFirstSlideNodes(projectAfterSeed);
  const expectedLayerLabels = nodesAfterSeed.map(resolveLayerDisplayLabel);

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-seed.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "seed-nodes",
    nodeCount: nodesAfterSeed.length,
    nodeOrder: nodesAfterSeed.map((node) => node.name),
    expectedLayerLabels,
  });

  logStep("open floating layer manager");
  await openFloatingLayerManager(page);

  const floatingLabels = await readFloatingLayerLabels(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "floating-panel-open.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "floating-panel-list",
    triggerLabelAfterOpen: await page.getByRole("button", { name: "收起图层管理" }).getAttribute("aria-label"),
    layerCount: floatingLabels.length,
    actualLabels: floatingLabels,
    matchesStorageOrder: JSON.stringify(floatingLabels) === JSON.stringify(expectedLayerLabels),
  });

  logStep("select layer and open inspector side");
  const firstLayerItem = page.locator(".floating-layer-item").first();
  await firstLayerItem.locator(".floating-layer-item__main").click();
  await openEditorSide(page);
  await page.getByRole("heading", { name: "文本属性" }).waitFor();

  const sideTabsText = await readSideTabsText(page);

  summary.checks.push({
    id: "selection-linkage",
    sideTabsText,
    hasNodeTab: sideTabsText.includes("组件属性"),
    hasTimelineTab: sideTabsText.includes("时间轴"),
    hasSlideTab: sideTabsText.includes("页面设置"),
    inspectorHeadingVisible: await page.getByRole("heading", { name: "文本属性" }).isVisible(),
  });

  logStep("toggle visibility and lock from floating panel");
  await firstLayerItem.locator(".floating-layer-item__visibility").click();
  await firstLayerItem.locator(".floating-layer-item__lock").click();
  await waitForSaved(page);

  const projectAfterQuickActions = await readPersistedProject(page, projectId);
  const firstNodeAfterQuickActions = readFirstSlideNodes(projectAfterQuickActions)[0] ?? null;

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-quick-actions.json"),
    projectAfterQuickActions,
  );

  summary.checks.push({
    id: "quick-actions",
    firstNodeId: firstNodeAfterQuickActions?.id ?? null,
    firstNodeVisible: firstNodeAfterQuickActions?.visible ?? null,
    firstNodeLocked: firstNodeAfterQuickActions?.locked ?? null,
    visibilityButtonNextAction: await firstLayerItem.locator(".floating-layer-item__visibility").getAttribute("aria-label"),
    lockButtonNextAction: await firstLayerItem.locator(".floating-layer-item__lock").getAttribute("aria-label"),
  });

  logStep("drag reorder layer items");
  const sourceLayerItem = page.locator(".floating-layer-item").first();
  const targetLayerItem = page.locator(".floating-layer-item").nth(2);
  await dragLayerItemAfter(sourceLayerItem, targetLayerItem);
  await page.waitForTimeout(300);
  await waitForSaved(page);

  const reorderedLabels = await readFloatingLayerLabels(page);
  const projectAfterReorder = await readPersistedProject(page, projectId);
  const reorderedNodes = readFirstSlideNodes(projectAfterReorder);

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-reorder.json"),
    projectAfterReorder,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "floating-panel-after-reorder.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "reorder-from-floating-panel",
    reorderedLabels,
    reorderedNodeOrder: reorderedNodes.map((node) => node.name),
    textMovedToLast: reorderedNodes[reorderedNodes.length - 1]?.name === "Text",
  });

  logStep("open page settings drawer and rename slide");
  await openSlideSettingsDrawer(page);
  await updateSlideNameFromDrawer(page, UPDATED_SLIDE_NAME);

  const projectAfterSlideRename = await readPersistedProject(page, projectId);
  const firstSlideAfterRename = readFirstSlide(projectAfterSlideRename);
  const slideCardName = normalizeInlineText(
    await page.locator(".slide-rail .slide-card-shell").first().locator(".slide-name").textContent(),
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "slide-settings-drawer-open.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "page-settings-drawer",
    drawerVisible: await page.locator(".slide-settings-drawer").isVisible(),
    storedSlideName: firstSlideAfterRename?.name ?? null,
    slideCardName,
    renamePersisted: firstSlideAfterRename?.name === UPDATED_SLIDE_NAME && slideCardName === UPDATED_SLIDE_NAME,
  });

  await closeSlideSettingsDrawer(page);

  logStep("preview smoke");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-smoke.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "preview-smoke",
    previewCanvasVisible: await page.locator(".preview-stage-surface .lower-canvas").isVisible(),
  });

  logStep("reload and verify persistence");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "编辑" }).click();
  await page.waitForURL(/mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const projectAfterReload = await readPersistedProject(page, projectId);
  const firstSlideAfterReload = readFirstSlide(projectAfterReload);
  const nodesAfterReload = readFirstSlideNodes(projectAfterReload);
  const textNodeAfterReload = nodesAfterReload.find((node) => node.name === "Text") ?? null;

  await openFloatingLayerManager(page);
  const labelsAfterReload = await readFloatingLayerLabels(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "editor-after-reload.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "reload-persistence",
    slideNameAfterReload: firstSlideAfterReload?.name ?? null,
    nodeOrderAfterReload: nodesAfterReload.map((node) => node.name),
    textNodeVisibleAfterReload: textNodeAfterReload?.visible ?? null,
    textNodeLockedAfterReload: textNodeAfterReload?.locked ?? null,
    floatingLabelsAfterReload: labelsAfterReload,
    persistedSlideNameMatches: firstSlideAfterReload?.name === UPDATED_SLIDE_NAME,
    textStillLast: nodesAfterReload[nodesAfterReload.length - 1]?.name === "Text",
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
