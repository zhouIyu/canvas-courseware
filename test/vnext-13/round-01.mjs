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
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-07-vnext-13-round-01");

/** 画布内双击编辑后写入的新文本。 */
const EDITED_TEXT = "画布内双击编辑成功";

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext13-test]", label);
}

/**
 * 读取当前项目首页中的全部文本节点。
 *
 * @param {any} project
 * @returns {any[]}
 */
function readTextNodes(project) {
  return project?.document?.slides?.[0]?.nodes?.filter((node) => node.type === "text") ?? [];
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
 * 根据文本节点几何信息，返回一个稳定落在文字区域内的点击点。
 *
 * @param {import("playwright").Page} page
 * @param {any} textNode
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function resolveTextNodePoint(page, textNode) {
  const localX = textNode.x + Math.min(Math.max(textNode.width / 5, 40), 100);
  const localY = textNode.y + Math.min(Math.max(textNode.height / 2, 18), 30);
  return resolveCanvasViewportPoint(page, localX, localY);
}

/**
 * 在编辑区空白区域触发右键菜单。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openBlankContextMenu(page) {
  await page.locator(".stage-scroll").click({
    button: "right",
    position: {
      x: 24,
      y: 24,
    },
  });
  await page.locator(".stage-context-menu").waitFor();
}

/**
 * 对指定文本节点位置触发右键菜单。
 *
 * @param {import("playwright").Page} page
 * @param {any} textNode
 * @returns {Promise<void>}
 */
async function openTextNodeContextMenu(page, textNode) {
  const point = await resolveTextNodePoint(page, textNode);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.locator(".stage-context-menu").waitFor();
}

/**
 * 双击文本节点并等待 Fabric 隐藏 textarea 进入焦点。
 *
 * @param {import("playwright").Page} page
 * @param {any} textNode
 * @returns {Promise<void>}
 */
async function enterInlineTextEditing(page, textNode) {
  const point = await resolveTextNodePoint(page, textNode);
  await page.mouse.dblclick(point.x, point.y);
  await page.waitForFunction(() => {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLTextAreaElement;
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
  editedText: EDITED_TEXT,
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

  logStep("open blank context menu");
  await openBlankContextMenu(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "blank-context-menu.png"),
    fullPage: true,
  });

  const blankMenuText = normalizeInlineText(await page.locator(".stage-context-menu").textContent());

  summary.checks.push({
    id: "blank-context-menu",
    menuText: blankMenuText,
    hasInsertText: blankMenuText.includes("插入文本"),
    hasInsertRect: blankMenuText.includes("插入矩形"),
    hasInsertImage: blankMenuText.includes("插入图片"),
    hasInsertImageFrame: blankMenuText.includes("插入图片框"),
    hasPaste: blankMenuText.includes("粘贴"),
    hasSelectionActions: blankMenuText.includes("复制所选") || blankMenuText.includes("删除所选"),
    metrics: await readViewportMetrics(page),
  });

  logStep("insert text from context menu");
  await page.getByRole("button", { name: "插入文本" }).click();
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-context-insert-text.png"),
    fullPage: true,
  });

  const projectsAfterInsert = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterInsert = findProjectById(projectsAfterInsert, projectId);
  const textNodesAfterInsert = readTextNodes(projectAfterInsert);
  const insertedTextNode = textNodesAfterInsert[0] ?? null;

  summary.checks.push({
    id: "insert-text",
    textNodeCount: textNodesAfterInsert.length,
    nodeId: insertedTextNode?.id ?? null,
    text: insertedTextNode?.props?.text ?? null,
    x: insertedTextNode?.x ?? null,
    y: insertedTextNode?.y ?? null,
  });

  logStep("double click text to edit");
  await enterInlineTextEditing(page, insertedTextNode);
  await page.keyboard.press("Meta+A");
  await page.keyboard.type(EDITED_TEXT);
  await page.locator(".stage-scroll").click({
    position: {
      x: 24,
      y: 24,
    },
  });
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-double-click-edit.png"),
    fullPage: true,
  });

  const projectsAfterEdit = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterEdit = findProjectById(projectsAfterEdit, projectId);
  const editedTextNode = readTextNodes(projectAfterEdit).find((node) => node.id === insertedTextNode?.id) ?? null;
  const inspectorTextValue = await page.locator(".field-textarea textarea").inputValue();

  summary.checks.push({
    id: "double-click-edit",
    nodeId: editedTextNode?.id ?? null,
    text: editedTextNode?.props?.text ?? null,
    inspectorTextValue,
    textUpdated: editedTextNode?.props?.text === EDITED_TEXT,
  });

  logStep("open selected node context menu");
  await openTextNodeContextMenu(page, editedTextNode);

  await page.screenshot({
    path: path.join(ASSET_DIR, "selected-context-menu.png"),
    fullPage: true,
  });

  const selectedMenuText = normalizeInlineText(await page.locator(".stage-context-menu").textContent());

  summary.checks.push({
    id: "selected-context-menu",
    menuText: selectedMenuText,
    hasCopy: selectedMenuText.includes("复制所选"),
    hasDuplicate: selectedMenuText.includes("重复所选"),
    hasDelete: selectedMenuText.includes("删除所选"),
  });

  logStep("duplicate selected text from context menu");
  await page.getByRole("button", { name: "重复所选" }).click();
  await waitForSaved(page);

  const projectsAfterDuplicate = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterDuplicate = findProjectById(projectsAfterDuplicate, projectId);
  const textNodesAfterDuplicate = readTextNodes(projectAfterDuplicate);
  const duplicatedTextNode =
    textNodesAfterDuplicate.find((node) => node.id !== editedTextNode?.id) ?? null;

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-context-duplicate.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "duplicate-selected",
    textNodeCount: textNodesAfterDuplicate.length,
    duplicatedNodeId: duplicatedTextNode?.id ?? null,
    duplicatedText: duplicatedTextNode?.props?.text ?? null,
    duplicatedOffsetX: duplicatedTextNode && editedTextNode ? duplicatedTextNode.x - editedTextNode.x : null,
    duplicatedOffsetY: duplicatedTextNode && editedTextNode ? duplicatedTextNode.y - editedTextNode.y : null,
  });

  logStep("delete duplicated text from context menu");
  await openTextNodeContextMenu(page, duplicatedTextNode);
  await page.getByRole("button", { name: "删除所选" }).click();
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-context-delete.png"),
    fullPage: true,
  });

  const projectsAfterDelete = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterDelete = findProjectById(projectsAfterDelete, projectId);
  const textNodesAfterDelete = readTextNodes(projectAfterDelete);

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-context-actions.json"),
    projectAfterDelete,
  );

  summary.checks.push({
    id: "delete-selected",
    textNodeCount: textNodesAfterDelete.length,
    remainingNodeId: textNodesAfterDelete[0]?.id ?? null,
    remainingText: textNodesAfterDelete[0]?.props?.text ?? null,
    deletedDuplicate: !textNodesAfterDelete.some((node) => node.id === duplicatedTextNode?.id),
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
  const textNodesAfterReload = readTextNodes(projectAfterReload);

  summary.checks.push({
    id: "reload-persistence",
    textNodeCount: textNodesAfterReload.length,
    persistedText: textNodesAfterReload[0]?.props?.text ?? null,
    textStillUpdated: textNodesAfterReload[0]?.props?.text === EDITED_TEXT,
  });

  logStep("open preview mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-after-edit.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "preview-smoke",
    resetButtonVisible: await page
      .locator(".embedded-preview-actions")
      .getByRole("button", { name: "重置播放" })
      .isVisible(),
    metrics: await readViewportMetrics(page),
  });

  if (editedTextNode?.props?.text !== EDITED_TEXT) {
    throw new Error("VNext-13 double-click text edit did not persist to document state");
  }
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
