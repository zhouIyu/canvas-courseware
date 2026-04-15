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

/** 图片复制测试资源。 */
const IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-08-round-01/vnext08-sample.png",
);

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-15-vnext-33-c-round-01");

/** 复制粘贴与重复生成节点的默认位移。 */
const EXPECTED_OFFSET = 24;

/**
 * 打印当前测试阶段，便于定位失败步骤。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext33-c-test]", label);
}

/**
 * 在条件失败时抛出可读性更好的错误信息。
 *
 * @param {unknown} condition
 * @param {string} message
 * @returns {void}
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
 * 读取顶部保存状态标签文案。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function readSaveStatusLabel(page) {
  return page.locator(".save-inline-meta .arco-tag").innerText();
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
 * 通过节点几何信息点击并选中目标节点。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} node
 * @returns {Promise<void>}
 */
async function clickNode(page, node) {
  const point = await resolveNodeViewportPoint(page, node);
  await page.mouse.click(point.x, point.y);
}

/**
 * 对目标节点触发右键菜单。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} node
 * @returns {Promise<void>}
 */
async function openNodeContextMenu(page, node) {
  const point = await resolveNodeViewportPoint(page, node);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.locator(".stage-context-menu").waitFor();
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
      x: 36,
      y: 36,
    },
  });
  await page.locator(".stage-context-menu").waitFor();
}

/**
 * 对比节点复制结果，断言位移、尺寸与基础属性均保留。
 *
 * @param {string} label
 * @param {any} sourceNode
 * @param {any} createdNode
 * @returns {{ label: string; sourceId: string | null; createdId: string | null; offsetX: number | null; offsetY: number | null; widthEqual: boolean; heightEqual: boolean; propsEqual: boolean; }}
 */
function summarizeNodeClone(label, sourceNode, createdNode) {
  const offsetX = createdNode ? createdNode.x - sourceNode.x : null;
  const offsetY = createdNode ? createdNode.y - sourceNode.y : null;
  const widthEqual = createdNode?.width === sourceNode?.width;
  const heightEqual = createdNode?.height === sourceNode?.height;
  const propsEqual =
    JSON.stringify(createdNode?.props ?? null) === JSON.stringify(sourceNode?.props ?? null);

  assertOrThrow(Boolean(createdNode), `${label} 未生成目标副本节点。`);
  assertOrThrow(offsetX === EXPECTED_OFFSET, `${label} 副本 X 偏移异常，当前为 ${offsetX}`);
  assertOrThrow(offsetY === EXPECTED_OFFSET, `${label} 副本 Y 偏移异常，当前为 ${offsetY}`);
  assertOrThrow(widthEqual, `${label} 副本宽度未保留。`);
  assertOrThrow(heightEqual, `${label} 副本高度未保留。`);
  assertOrThrow(propsEqual, `${label} 副本基础属性未保留。`);

  return {
    label,
    sourceId: sourceNode?.id ?? null,
    createdId: createdNode?.id ?? null,
    offsetX,
    offsetY,
    widthEqual,
    heightEqual,
    propsEqual,
  };
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
  expectedOffset: EXPECTED_OFFSET,
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

  logStep("insert text and copy/paste by keyboard");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);

  const projectAfterTextInsert = await readPersistedProject(page, projectId);
  const textSourceNode = readNodesByType(projectAfterTextInsert, "text")[0] ?? null;
  assertOrThrow(Boolean(textSourceNode), "插入文本后未找到文本节点。");

  await clickNode(page, textSourceNode);
  await page.keyboard.press("Meta+C");
  await page.keyboard.press("Meta+V");
  await waitForSaved(page);

  const projectAfterTextPaste = await readPersistedProject(page, projectId);
  const textNodesAfterPaste = readNodesByType(projectAfterTextPaste, "text");
  const textCreatedNode =
    textNodesAfterPaste.find((node) => node.id !== textSourceNode.id) ?? null;

  summary.checks.push(
    summarizeNodeClone("text-copy-paste", textSourceNode, textCreatedNode),
  );

  logStep("insert rect and duplicate by keyboard");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
  await waitForSaved(page);

  const projectAfterRectInsert = await readPersistedProject(page, projectId);
  const rectNodesBeforeDuplicate = readNodesByType(projectAfterRectInsert, "rect");
  const rectSourceNode = rectNodesBeforeDuplicate[0] ?? null;
  assertOrThrow(Boolean(rectSourceNode), "插入矩形后未找到矩形节点。");

  await clickNode(page, rectSourceNode);
  await page.keyboard.press("Meta+D");
  await waitForSaved(page);

  const rectIdsBeforeDuplicate = new Set(rectNodesBeforeDuplicate.map((node) => node.id));
  const projectAfterRectDuplicate = await readPersistedProject(page, projectId);
  const rectNodesAfterDuplicate = readNodesByType(projectAfterRectDuplicate, "rect");
  const rectCreatedNode =
    rectNodesAfterDuplicate.find((node) => !rectIdsBeforeDuplicate.has(node.id)) ?? null;

  summary.checks.push(
    summarizeNodeClone("rect-duplicate", rectSourceNode, rectCreatedNode),
  );

  logStep("insert image and copy/paste by context menu");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "图片" })
    .first()
    .locator("input[type='file']")
    .setInputFiles(IMAGE_PATH);
  await waitForSaved(page);

  const projectAfterImageInsert = await readPersistedProject(page, projectId);
  const imageNodesBeforePaste = readNodesByType(projectAfterImageInsert, "image");
  const imageSourceNode = imageNodesBeforePaste[0] ?? null;
  assertOrThrow(Boolean(imageSourceNode), "插入图片后未找到图片节点。");

  await openNodeContextMenu(page, imageSourceNode);
  await page.locator(".stage-context-menu").getByRole("button", { name: "复制所选" }).click();
  await openBlankContextMenu(page);
  await page.locator(".stage-context-menu").getByRole("button", { name: "粘贴" }).click();
  await waitForSaved(page);

  const imageIdsBeforePaste = new Set(imageNodesBeforePaste.map((node) => node.id));
  const projectAfterImagePaste = await readPersistedProject(page, projectId);
  const imageNodesAfterPaste = readNodesByType(projectAfterImagePaste, "image");
  const imageCreatedNode =
    imageNodesAfterPaste.find((node) => !imageIdsBeforePaste.has(node.id)) ?? null;

  summary.checks.push(
    summarizeNodeClone("image-copy-paste", imageSourceNode, imageCreatedNode),
  );

  const saveStatusAfterActions = (await readSaveStatusLabel(page)).trim();
  summary.checks.push({
    id: "save-status-after-actions",
    saveStatusAfterActions,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-copy-paste-duplicate.png"),
    fullPage: true,
  });

  logStep("reload and verify persistence");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const projectAfterReload = await readPersistedProject(page, projectId);
  const textNodesAfterReload = readNodesByType(projectAfterReload, "text");
  const rectNodesAfterReload = readNodesByType(projectAfterReload, "rect");
  const imageNodesAfterReload = readNodesByType(projectAfterReload, "image");

  summary.checks.push({
    id: "reload-persistence",
    textCount: textNodesAfterReload.length,
    rectCount: rectNodesAfterReload.length,
    imageCount: imageNodesAfterReload.length,
    textCreatedPersisted: textNodesAfterReload.some((node) => node.id === textCreatedNode?.id),
    rectCreatedPersisted: rectNodesAfterReload.some((node) => node.id === rectCreatedNode?.id),
    imageCreatedPersisted: imageNodesAfterReload.some((node) => node.id === imageCreatedNode?.id),
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
    fullPage: true,
  });

  assertOrThrow(saveStatusAfterActions === "已保存", `操作完成后保存状态异常：${saveStatusAfterActions}`);
  assertOrThrow(textNodesAfterReload.length === 2, `刷新后文本节点数量异常：${textNodesAfterReload.length}`);
  assertOrThrow(rectNodesAfterReload.length === 2, `刷新后矩形节点数量异常：${rectNodesAfterReload.length}`);
  assertOrThrow(imageNodesAfterReload.length === 2, `刷新后图片节点数量异常：${imageNodesAfterReload.length}`);
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
