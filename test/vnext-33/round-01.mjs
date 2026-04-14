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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-14-vnext-33-round-01");

/** 默认新建文本的初始字号。 */
const INITIAL_FONT_SIZE = 32;

/** 文本工具条执行一次放大后的目标字号。 */
const UPDATED_FONT_SIZE = 34;

/** 在自动保存暂缓期间继续输入的文本尾缀。 */
const APPENDED_TEXT = " 自动保存暂缓后继续输入";

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext33-test]", label);
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
 * 读取顶部保存状态标签文案。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function readSaveStatusLabel(page) {
  const label = await page.locator(".save-inline-meta .arco-tag").innerText();
  return label.trim();
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
  });

  logStep("enter inline editing and trigger autosave deferral");
  await enterInlineTextEditing(page, insertedTextNode);
  await page.getByRole("button", { name: "增大字号" }).click();
  await page.waitForTimeout(1300);

  const editingStillFocusedBeforeExit = await isInlineTextareaFocused(page);
  const saveStatusWhileEditing = await readSaveStatusLabel(page);
  const projectWhileEditing = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const storedFontSizeWhileEditing = readTextNodes(projectWhileEditing)[0]?.props?.fontSize ?? null;

  summary.checks.push({
    id: "autosave-deferred-while-editing",
    editingStillFocusedBeforeExit,
    saveStatusWhileEditing,
    storedFontSizeWhileEditing,
  });

  await page.keyboard.type(APPENDED_TEXT);
  await page.screenshot({
    path: path.join(ASSET_DIR, "before-exit.png"),
    fullPage: true,
  });

  logStep("exit inline editing and wait for autosave");
  await page.locator(".stage-scroll").click({
    position: {
      x: 24,
      y: 24,
    },
  });
  await waitForSaved(page);

  const projectAfterExit = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const persistedTextNode = readTextNodes(projectAfterExit)[0] ?? null;

  summary.checks.push({
    id: "autosave-runs-after-exit",
    fontSize: persistedTextNode?.props?.fontSize ?? null,
    text: persistedTextNode?.props?.text ?? null,
  });

  logStep("reload and verify persistence");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const projectAfterReload = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const reloadedTextNode = readTextNodes(projectAfterReload)[0] ?? null;

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "reload-restore",
    fontSize: reloadedTextNode?.props?.fontSize ?? null,
    text: reloadedTextNode?.props?.text ?? null,
  });

  if (!editingStillFocusedBeforeExit) {
    throw new Error("自动保存延后期间，文本编辑态被意外打断。");
  }

  if (saveStatusWhileEditing !== "未保存") {
    throw new Error(`编辑态暂缓自动保存时，顶部状态应保持“未保存”，当前为 ${saveStatusWhileEditing}`);
  }

  if (storedFontSizeWhileEditing !== INITIAL_FONT_SIZE) {
    throw new Error(
      `文本编辑态期间不应提前落盘新字号，当前已保存字号为 ${storedFontSizeWhileEditing ?? "null"}`,
    );
  }

  if (persistedTextNode?.props?.fontSize !== UPDATED_FONT_SIZE) {
    throw new Error(`退出编辑后自动保存未写回字号，当前值为 ${persistedTextNode?.props?.fontSize ?? "null"}`);
  }

  if (!String(persistedTextNode?.props?.text ?? "").includes(APPENDED_TEXT.trim())) {
    throw new Error(`退出编辑后自动保存未保留新增文本：${persistedTextNode?.props?.text ?? "null"}`);
  }

  if (reloadedTextNode?.props?.fontSize !== UPDATED_FONT_SIZE) {
    throw new Error(`刷新后字号恢复异常，当前值为 ${reloadedTextNode?.props?.fontSize ?? "null"}`);
  }

  if (!String(reloadedTextNode?.props?.text ?? "").includes(APPENDED_TEXT.trim())) {
    throw new Error(`刷新后文本恢复异常：${reloadedTextNode?.props?.text ?? "null"}`);
  }

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
} finally {
  await browser.close();
}
