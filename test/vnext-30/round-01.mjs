import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  launchBrowserSession,
  readStoredProjects,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-10-vnext-30-round-01");

/** 本轮文本工具条选择的新文字颜色。 */
const TARGET_TEXT_COLOR = "#165DFF";

/** 使用文本工具条后继续输入的文本尾缀。 */
const APPENDED_TEXT = " TextTool 已保持编辑态";

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext30-test]", label);
}

/**
 * 读取项目首页中的全部文本节点。
 *
 * @param {any} project
 * @returns {any[]}
 */
function readTextNodes(project) {
  return project?.document?.slides?.[0]?.nodes?.filter((node) => node.type === "text") ?? [];
}

/**
 * 读取属性面板里指定标签对应的输入框。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {import("playwright").Locator}
 */
function inspectorInput(page, label) {
  return page
    .locator(".field")
    .filter({
      has: page.locator(".field-label", { hasText: label }),
    })
    .locator("input")
    .first();
}

/**
 * 确保右侧属性管理栏处于展开状态。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function ensureRightSidebarExpanded(page) {
  const sideBody = page.locator(".editor-side-body");
  if (await sideBody.isVisible().catch(() => false)) {
    return;
  }

  await page.getByRole("button", { name: "展开右侧管理栏" }).click();
  await sideBody.waitFor();
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
 * 根据文本节点几何信息，返回一个稳定落在文本区域内的点击点。
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
 * 双击文本节点并等待文本工具条与隐藏 textarea 一起进入工作态。
 *
 * @param {import("playwright").Page} page
 * @param {any} textNode
 * @returns {Promise<void>}
 */
async function enterInlineTextEditing(page, textNode) {
  const point = await resolveTextNodePoint(page, textNode);
  await page.mouse.dblclick(point.x, point.y);
  await page.locator(".text-tool").waitFor();
  await page.waitForFunction(() => document.activeElement instanceof HTMLTextAreaElement);
}

/**
 * 判断当前隐藏 textarea 是否仍保持焦点。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<boolean>}
 */
async function isInlineTextareaFocused(page) {
  return page.evaluate(() => document.activeElement instanceof HTMLTextAreaElement);
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(DEFAULT_VIEWPORT);

/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  targetTextColor: TARGET_TEXT_COLOR,
  appendedText: APPENDED_TEXT,
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

  logStep("insert text node from toolbar");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);

  const projectAfterInsert = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const insertedTextNode = readTextNodes(projectAfterInsert)[0] ?? null;

  summary.checks.push({
    id: "insert-text",
    nodeId: insertedTextNode?.id ?? null,
    fontSize: insertedTextNode?.props?.fontSize ?? null,
    color: insertedTextNode?.props?.color ?? null,
  });

  await ensureRightSidebarExpanded(page);

  logStep("enter inline editing and verify text tool");
  await enterInlineTextEditing(page, insertedTextNode);
  const nodePoint = await resolveTextNodePoint(page, insertedTextNode);
  const textToolBox = await page.locator(".text-tool").boundingBox();
  const textToolVisibleAboveNode =
    Boolean(textToolBox) && textToolBox.y + textToolBox.height < nodePoint.y;

  summary.checks.push({
    id: "text-tool-visible",
    textToolBox,
    textToolVisibleAboveNode,
  });

  await page.getByRole("button", { name: "加粗", exact: true }).click();
  const inspectorKeepsEditing = await isInlineTextareaFocused(page);

  summary.checks.push({
    id: "inspector-keeps-editing",
    inspectorKeepsEditing,
  });

  logStep("apply style changes without breaking editing");
  await page.getByRole("button", { name: "增大字号" }).click();
  await page.getByRole("button", { name: "切换斜体" }).click();
  await page.getByRole("button", { name: "设置文字颜色为亮蓝" }).click();

  const focusStillInTextarea = await isInlineTextareaFocused(page);
  await page.keyboard.type(APPENDED_TEXT);

  summary.checks.push({
    id: "text-tool-keeps-editing",
    focusStillInTextarea,
  });

  logStep("finish editing and persist");
  await page.locator(".stage-scroll").click({
    position: {
      x: 24,
      y: 24,
    },
  });
  await waitForSaved(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-text-tool-edit.png"),
    fullPage: true,
  });

  await ensureRightSidebarExpanded(page);

  const projectAfterEdit = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const editedTextNode = readTextNodes(projectAfterEdit)[0] ?? null;
  const inspectorFontSizeValue = await inspectorInput(page, "字号").inputValue();
  const inspectorBoldActive = await page
    .getByRole("button", { name: "加粗", exact: true })
    .evaluate((element) => element.classList.contains("is-active"));
  const inspectorItalicActive = await page
    .getByRole("button", { name: "斜体", exact: true })
    .evaluate((element) => element.classList.contains("is-active"));

  summary.checks.push({
    id: "style-persisted",
    fontSize: editedTextNode?.props?.fontSize ?? null,
    fontWeight: editedTextNode?.props?.fontWeight ?? null,
    fontStyle: editedTextNode?.props?.fontStyle ?? null,
    color: editedTextNode?.props?.color ?? null,
    text: editedTextNode?.props?.text ?? null,
    inspectorFontSizeValue,
    inspectorBoldActive,
    inspectorItalicActive,
  });

  logStep("reload and verify restore");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const projectAfterReload = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const reloadedTextNode = readTextNodes(projectAfterReload)[0] ?? null;
  const reloadedPoint = await resolveTextNodePoint(page, reloadedTextNode);
  await page.mouse.click(reloadedPoint.x, reloadedPoint.y);
  await ensureRightSidebarExpanded(page);

  const reloadedInspectorFontSize = await inspectorInput(page, "字号").inputValue();
  const reloadedInspectorBoldActive = await page
    .getByRole("button", { name: "加粗", exact: true })
    .evaluate((element) => element.classList.contains("is-active"));
  const reloadedInspectorItalicActive = await page
    .getByRole("button", { name: "斜体", exact: true })
    .evaluate((element) => element.classList.contains("is-active"));

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "reload-restore",
    fontSize: reloadedTextNode?.props?.fontSize ?? null,
    fontWeight: reloadedTextNode?.props?.fontWeight ?? null,
    fontStyle: reloadedTextNode?.props?.fontStyle ?? null,
    color: reloadedTextNode?.props?.color ?? null,
    text: reloadedTextNode?.props?.text ?? null,
    reloadedInspectorFontSize,
    reloadedInspectorBoldActive,
    reloadedInspectorItalicActive,
  });

  if (!textToolVisibleAboveNode) {
    throw new Error("TextTool 没有出现在文本对象上方。");
  }

  if (!focusStillInTextarea) {
    throw new Error("点击 TextTool 后，Fabric 隐藏 textarea 没有继续保持焦点。");
  }

  if (!inspectorKeepsEditing) {
    throw new Error("点击右侧属性面板后，文本编辑态被意外退出。");
  }

  if (editedTextNode?.props?.fontSize !== 34) {
    throw new Error(`字号写回异常，当前值为 ${editedTextNode?.props?.fontSize ?? "null"}`);
  }

  if (String(editedTextNode?.props?.fontWeight ?? "") !== "700") {
    throw new Error(`加粗写回异常，当前值为 ${editedTextNode?.props?.fontWeight ?? "null"}`);
  }

  if (editedTextNode?.props?.fontStyle !== "italic") {
    throw new Error(`斜体写回异常，当前值为 ${editedTextNode?.props?.fontStyle ?? "null"}`);
  }

  if (String(editedTextNode?.props?.color ?? "").toUpperCase() !== TARGET_TEXT_COLOR) {
    throw new Error(`颜色写回异常，当前值为 ${editedTextNode?.props?.color ?? "null"}`);
  }

  if (!String(editedTextNode?.props?.text ?? "").includes(APPENDED_TEXT.trim())) {
    throw new Error(`TextTool 操作后未继续保留输入内容：${editedTextNode?.props?.text ?? "null"}`);
  }

  if (!inspectorBoldActive || !inspectorItalicActive) {
    throw new Error("右侧属性面板没有正确回显加粗 / 斜体状态。");
  }

  if (
    reloadedTextNode?.props?.fontSize !== 34 ||
    String(reloadedTextNode?.props?.fontWeight ?? "") !== "700" ||
    reloadedTextNode?.props?.fontStyle !== "italic" ||
    String(reloadedTextNode?.props?.color ?? "").toUpperCase() !== TARGET_TEXT_COLOR
  ) {
    throw new Error("刷新后文本样式没有完整恢复。");
  }

  if (!reloadedInspectorBoldActive || !reloadedInspectorItalicActive) {
    throw new Error("刷新后属性面板没有正确恢复加粗 / 斜体状态。");
  }

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
} finally {
  await browser.close();
}
