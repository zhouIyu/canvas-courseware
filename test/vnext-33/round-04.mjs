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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-15-vnext-33-d-round-01");

/** 方向键常规微调步长。 */
const EXPECTED_NUDGE_DISTANCE = 1;

/** `Shift + 方向键` 大步微调步长。 */
const EXPECTED_LARGE_NUDGE_DISTANCE = 10;

/** Escape 退出编辑态前输入的文本后缀。 */
const ESCAPE_APPEND_TEXT = " Esc退出后保留";

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext33-d-test]", label);
}

/**
 * 在条件失败时抛出可读性更好的错误信息。
 *
 * @param {unknown} condition
 * @param {string} message
 */
function assertOrThrow(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 读取当前已持久化的目标项目。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<any | null>}
 */
async function readPersistedProject(page, projectId) {
  return findProjectById(await readStoredProjects(page, STORAGE_KEY), projectId);
}

/**
 * 读取目标项目首页中指定类型的节点。
 *
 * @param {any | null} project
 * @param {"text" | "rect" | "image"} type
 * @returns {any[]}
 */
function readNodesByType(project, type) {
  return project?.document?.slides?.[0]?.nodes?.filter((node) => node.type === type) ?? [];
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
    const canvas = element.querySelector("canvas.lower-canvas");
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
 * 根据节点几何信息，返回稳定落在节点可点击区域的视口坐标。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} node
 * @returns {Promise<{ x: number; y: number; }>} 
 */
async function resolveNodeViewportPoint(page, node) {
  const localX = node.x + Math.min(Math.max(node.width / 2, 20), 120);
  const localY = node.y + Math.min(Math.max(node.height / 2, 20), 80);
  return resolveCanvasViewportPoint(page, localX, localY);
}

/**
 * 点击并选中目标节点。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} node
 */
async function clickNode(page, node) {
  const point = await resolveNodeViewportPoint(page, node);
  await page.mouse.click(point.x, point.y);
}

/**
 * 双击目标节点，触发 Fabric 内联文本编辑态。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} node
 */
async function doubleClickNode(page, node) {
  const point = await resolveNodeViewportPoint(page, node);
  await page.mouse.dblclick(point.x, point.y);
}

/**
 * 读取当前编辑器快照中的选中节点 id 列表。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string[]>}
 */
async function readSelectionNodeIds(page) {
  return page.evaluate(() => window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.selection?.nodeIds ?? []);
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
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
  await waitForSaved(page);

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";

  logStep("insert text and verify nudge shortcuts");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);

  const projectAfterTextInsert = await readPersistedProject(page, projectId);
  const firstTextNode = readNodesByType(projectAfterTextInsert, "text")[0] ?? null;
  assertOrThrow(Boolean(firstTextNode), "插入文本后未找到文本节点，无法验证快捷键。");

  await clickNode(page, firstTextNode);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await waitForSaved(page);

  const projectAfterNudge = await readPersistedProject(page, projectId);
  const nudgedTextNode = readNodesByType(projectAfterNudge, "text").find(
    (node) => node.id === firstTextNode.id,
  ) ?? null;
  assertOrThrow(Boolean(nudgedTextNode), "方向键微调后未找到目标文本节点。");

  const nudgeDeltaX = nudgedTextNode.x - firstTextNode.x;
  const nudgeDeltaY = nudgedTextNode.y - firstTextNode.y;
  assertOrThrow(
    nudgeDeltaX === EXPECTED_NUDGE_DISTANCE,
    `方向键微调 X 偏移异常，期望 ${EXPECTED_NUDGE_DISTANCE}，实际 ${nudgeDeltaX}`,
  );
  assertOrThrow(
    nudgeDeltaY === EXPECTED_LARGE_NUDGE_DISTANCE,
    `Shift + 方向键微调 Y 偏移异常，期望 ${EXPECTED_LARGE_NUDGE_DISTANCE}，实际 ${nudgeDeltaY}`,
  );

  summary.checks.push({
    id: "keyboard-nudge",
    nodeId: nudgedTextNode.id,
    nudgeDeltaX,
    nudgeDeltaY,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-keyboard-nudge.png"),
    fullPage: true,
  });

  logStep("verify input isolation for delete and arrow shortcuts");
  const titleInput = page.getByLabel("项目标题");
  await titleInput.evaluate((input) => {
    (input instanceof HTMLInputElement ? input : input.querySelector("input"))?.focus();
  });

  const selectionNodeIdsBeforeInputShortcut = await readSelectionNodeIds(page);
  assertOrThrow(
    selectionNodeIdsBeforeInputShortcut.includes(nudgedTextNode.id),
    "聚焦项目标题后丢失画布选中态，无法验证输入态隔离。",
  );

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(220);

  const projectAfterInputShortcut = await readPersistedProject(page, projectId);
  const textNodeAfterInputShortcut = readNodesByType(projectAfterInputShortcut, "text").find(
    (node) => node.id === nudgedTextNode.id,
  ) ?? null;
  assertOrThrow(
    Boolean(textNodeAfterInputShortcut),
    "输入态触发 Delete 后对象被误删，快捷键隔离失效。",
  );
  assertOrThrow(
    textNodeAfterInputShortcut.x === nudgedTextNode.x &&
      textNodeAfterInputShortcut.y === nudgedTextNode.y,
    "输入态触发方向键后对象位置被误改，快捷键隔离失效。",
  );

  summary.checks.push({
    id: "input-isolation",
    selectionNodeIdsBeforeInputShortcut,
    textNodeStillExists: true,
    geometryStable: true,
  });

  logStep("verify Backspace deletes selected node");
  await clickNode(page, textNodeAfterInputShortcut);
  await page.keyboard.press("Backspace");
  await waitForSaved(page);

  const projectAfterBackspaceDelete = await readPersistedProject(page, projectId);
  const textNodesAfterBackspaceDelete = readNodesByType(projectAfterBackspaceDelete, "text");
  assertOrThrow(
    !textNodesAfterBackspaceDelete.some((node) => node.id === textNodeAfterInputShortcut.id),
    "Backspace 未删除当前选中文本对象。",
  );

  summary.checks.push({
    id: "backspace-delete",
    removedNodeId: textNodeAfterInputShortcut.id,
    remainingTextCount: textNodesAfterBackspaceDelete.length,
  });

  logStep("verify Delete deletes selected node");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
  await waitForSaved(page);

  const projectAfterRectInsert = await readPersistedProject(page, projectId);
  const insertedRectNode = readNodesByType(projectAfterRectInsert, "rect")[0] ?? null;
  assertOrThrow(Boolean(insertedRectNode), "插入矩形后未找到矩形节点。");

  await clickNode(page, insertedRectNode);
  await page.keyboard.press("Delete");
  await waitForSaved(page);

  const projectAfterDeleteShortcut = await readPersistedProject(page, projectId);
  const rectNodesAfterDeleteShortcut = readNodesByType(projectAfterDeleteShortcut, "rect");
  assertOrThrow(
    !rectNodesAfterDeleteShortcut.some((node) => node.id === insertedRectNode.id),
    "Delete 未删除当前选中矩形对象。",
  );

  summary.checks.push({
    id: "delete-shortcut",
    removedNodeId: insertedRectNode.id,
    remainingRectCount: rectNodesAfterDeleteShortcut.length,
  });

  logStep("verify Escape exits inline text editing");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);

  const projectBeforeEscape = await readPersistedProject(page, projectId);
  const escapeTextNode = readNodesByType(projectBeforeEscape, "text")[0] ?? null;
  assertOrThrow(Boolean(escapeTextNode), "准备 Escape 场景时未找到文本节点。");

  await doubleClickNode(page, escapeTextNode);
  await page.locator(".text-tool").waitFor();
  await page.waitForFunction(() => document.activeElement instanceof HTMLTextAreaElement);

  await page.keyboard.type(ESCAPE_APPEND_TEXT);
  const textareaFocusedBeforeEscape = await isInlineTextareaFocused(page);
  await page.keyboard.press("Escape");

  await page.waitForFunction(() => !document.querySelector(".text-tool"));
  const textareaFocusedAfterEscape = await isInlineTextareaFocused(page);
  await waitForSaved(page);

  const projectAfterEscape = await readPersistedProject(page, projectId);
  const textAfterEscape = readNodesByType(projectAfterEscape, "text").find(
    (node) => node.id === escapeTextNode.id,
  ) ?? null;
  const persistedEscapeText = String(textAfterEscape?.props?.text ?? "");

  assertOrThrow(textareaFocusedBeforeEscape, "Escape 前文本输入焦点异常，未进入编辑态。");
  assertOrThrow(!textareaFocusedAfterEscape, "Escape 后文本编辑态未退出。");
  assertOrThrow(
    persistedEscapeText.includes(ESCAPE_APPEND_TEXT.trim()),
    `Escape 退出后文本内容未正确持久化：${persistedEscapeText}`,
  );

  summary.checks.push({
    id: "escape-exit-inline-editing",
    nodeId: escapeTextNode.id,
    textareaFocusedBeforeEscape,
    textareaFocusedAfterEscape,
    persistedTextIncludesSuffix: persistedEscapeText.includes(ESCAPE_APPEND_TEXT.trim()),
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-escape-exit-inline-editing.png"),
    fullPage: true,
  });

  logStep("reload and verify persistence");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const projectAfterReload = await readPersistedProject(page, projectId);
  const textAfterReload = readNodesByType(projectAfterReload, "text").find(
    (node) => node.id === escapeTextNode.id,
  ) ?? null;
  const reloadedText = String(textAfterReload?.props?.text ?? "");

  assertOrThrow(
    reloadedText.includes(ESCAPE_APPEND_TEXT.trim()),
    `刷新后 Escape 编辑结果未恢复：${reloadedText}`,
  );

  summary.checks.push({
    id: "reload-persistence",
    nodeId: escapeTextNode.id,
    textIncludesSuffixAfterReload: reloadedText.includes(ESCAPE_APPEND_TEXT.trim()),
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
