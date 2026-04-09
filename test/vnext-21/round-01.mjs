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
/** 首次插图测试资源。 */
const INSERT_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-08-round-01/vnext08-sample.png",
);
/** 第一次换图测试资源。 */
const REPLACE_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-09-round-01/vnext09-bg-portrait.png",
);
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-09-vnext-21-round-01");
/** 手动改名后的验证名称。 */
const CUSTOM_NODE_NAME = "课程封面";

/**
 * 打印阶段日志，便于失败时快速定位。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext21-test]", label);
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
 * 定位“基础属性”卡片里的文本输入框。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {import("playwright").Locator}
 */
function inspectorTextInput(page, label) {
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
 * 把属性面板中的文本字段改成指定值，并通过 blur 触发写回。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {string} value
 * @returns {Promise<void>}
 */
async function setInspectorText(page, label, value) {
  const input = inspectorTextInput(page, label);
  await input.click();
  await input.fill(value);
  await input.blur();
}

/**
 * 打开右侧管理栏，确保属性面板已显示。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openEditorSide(page) {
  await page.getByRole("button", { name: "展开右侧管理栏" }).click();
  await page.locator(".editor-side").waitFor();
}

/**
 * 展开右上角图层浮层，读取当前首个图层标签文案。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function readFirstLayerLabel(page) {
  const trigger = page.getByRole("button", { name: "展开图层管理" });
  if (await trigger.isVisible()) {
    await trigger.click();
  }

  await page.locator(".floating-layer-manager__panel").waitFor();
  const labelText = await page.locator(".floating-layer-item__name").first().textContent();
  return normalizeInlineText(labelText);
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

  logStep("insert local image from toolbar");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "图片" })
    .first()
    .locator("input[type='file']")
    .setInputFiles(INSERT_IMAGE_PATH);
  await openEditorSide(page);
  await page.getByRole("heading", { name: "图片属性" }).waitFor();
  await waitForSaved(page);

  const projectsAfterInsert = await readStoredProjects(page, STORAGE_KEY);
  const imageAfterInsert = readFirstImageNode(findProjectById(projectsAfterInsert, projectId));
  const layerLabelAfterInsert = await readFirstLayerLabel(page);
  if (!imageAfterInsert) {
    throw new Error("首次导入图片后，未在项目存储中找到图片节点");
  }
  if (imageAfterInsert.name !== "vnext08-sample") {
    throw new Error(`首次导入后节点名称异常：${imageAfterInsert.name ?? "null"}`);
  }
  if (imageAfterInsert.props?.alt !== "vnext08-sample.png") {
    throw new Error(`首次导入后资源标识异常：${imageAfterInsert.props?.alt ?? "null"}`);
  }
  if (!layerLabelAfterInsert.includes("图片-vnext08-sample")) {
    throw new Error(`首次导入后图层标签异常：${layerLabelAfterInsert}`);
  }

  summary.checks.push({
    id: "insert-image",
    imageNodeId: imageAfterInsert?.id ?? null,
    name: imageAfterInsert?.name ?? null,
    alt: imageAfterInsert?.props?.alt ?? null,
    layerLabel: layerLabelAfterInsert,
  });

  logStep("replace image and sync default name");
  const imageCard = page.locator(".group-card").filter({
    has: page.getByRole("heading", { name: "图片属性" }),
  });
  await imageCard.locator(".image-source-row input[type='file']").setInputFiles(REPLACE_IMAGE_PATH);
  await waitForSaved(page);

  const projectsAfterReplace = await readStoredProjects(page, STORAGE_KEY);
  const imageAfterReplace = readFirstImageNode(findProjectById(projectsAfterReplace, projectId));
  const layerLabelAfterReplace = await readFirstLayerLabel(page);
  if (!imageAfterReplace) {
    throw new Error("换图后，未在项目存储中找到图片节点");
  }
  if (imageAfterReplace.id !== imageAfterInsert.id) {
    throw new Error("换图后图片节点被重建，未保留原节点 id");
  }
  if (imageAfterReplace.name !== "vnext09-bg-portrait") {
    throw new Error(`默认节点名称未同步到最新图片：${imageAfterReplace.name ?? "null"}`);
  }
  if (imageAfterReplace.props?.alt !== "vnext09-bg-portrait.png") {
    throw new Error(`换图后资源标识未同步：${imageAfterReplace.props?.alt ?? "null"}`);
  }
  if (!layerLabelAfterReplace.includes("图片-vnext09-bg-portrait")) {
    throw new Error(`换图后图层标签未同步：${layerLabelAfterReplace}`);
  }

  summary.checks.push({
    id: "replace-image-default-name-sync",
    imageNodeId: imageAfterReplace?.id ?? null,
    sameNodeId: imageAfterReplace?.id === imageAfterInsert?.id,
    name: imageAfterReplace?.name ?? null,
    alt: imageAfterReplace?.props?.alt ?? null,
    layerLabel: layerLabelAfterReplace,
  });

  logStep("rename node manually");
  await setInspectorText(page, "节点名称", CUSTOM_NODE_NAME);
  await waitForSaved(page);

  const projectsAfterRename = await readStoredProjects(page, STORAGE_KEY);
  const imageAfterRename = readFirstImageNode(findProjectById(projectsAfterRename, projectId));
  const layerLabelAfterRename = await readFirstLayerLabel(page);
  if (!imageAfterRename) {
    throw new Error("手动改名后，未在项目存储中找到图片节点");
  }
  if (imageAfterRename.name !== CUSTOM_NODE_NAME) {
    throw new Error(`手动改名未成功写回：${imageAfterRename.name ?? "null"}`);
  }
  if (!layerLabelAfterRename.includes(`图片-${CUSTOM_NODE_NAME}`)) {
    throw new Error(`手动改名后图层标签异常：${layerLabelAfterRename}`);
  }

  summary.checks.push({
    id: "manual-rename",
    imageNodeId: imageAfterRename?.id ?? null,
    name: imageAfterRename?.name ?? null,
    alt: imageAfterRename?.props?.alt ?? null,
    layerLabel: layerLabelAfterRename,
  });

  logStep("replace image again and preserve custom name");
  await imageCard.locator(".image-source-row input[type='file']").setInputFiles(INSERT_IMAGE_PATH);
  await waitForSaved(page);

  const projectsAfterSecondReplace = await readStoredProjects(page, STORAGE_KEY);
  const imageAfterSecondReplace = readFirstImageNode(
    findProjectById(projectsAfterSecondReplace, projectId),
  );
  const layerLabelAfterSecondReplace = await readFirstLayerLabel(page);
  if (!imageAfterSecondReplace) {
    throw new Error("二次换图后，未在项目存储中找到图片节点");
  }
  if (imageAfterSecondReplace.id !== imageAfterReplace.id) {
    throw new Error("二次换图后图片节点被重建，未保留原节点 id");
  }
  if (imageAfterSecondReplace.name !== CUSTOM_NODE_NAME) {
    throw new Error(`二次换图错误覆盖了手动名称：${imageAfterSecondReplace.name ?? "null"}`);
  }
  if (imageAfterSecondReplace.props?.alt !== "vnext08-sample.png") {
    throw new Error(`二次换图后资源标识未更新回最新文件：${imageAfterSecondReplace.props?.alt ?? "null"}`);
  }
  if (!layerLabelAfterSecondReplace.includes(`图片-${CUSTOM_NODE_NAME}`)) {
    throw new Error(`二次换图后图层标签错误覆盖：${layerLabelAfterSecondReplace}`);
  }

  summary.checks.push({
    id: "replace-image-custom-name-preserved",
    imageNodeId: imageAfterSecondReplace?.id ?? null,
    sameNodeId: imageAfterSecondReplace?.id === imageAfterReplace?.id,
    name: imageAfterSecondReplace?.name ?? null,
    alt: imageAfterSecondReplace?.props?.alt ?? null,
    layerLabel: layerLabelAfterSecondReplace,
  });

  logStep("reload workspace");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const projectsAfterReload = await readStoredProjects(page, STORAGE_KEY);
  const imageAfterReload = readFirstImageNode(findProjectById(projectsAfterReload, projectId));
  const layerLabelAfterReload = await readFirstLayerLabel(page);
  if (!imageAfterReload) {
    throw new Error("刷新后，未在项目存储中找到图片节点");
  }
  if (imageAfterReload.id !== imageAfterSecondReplace.id) {
    throw new Error("刷新后图片节点 id 发生变化");
  }
  if (imageAfterReload.name !== CUSTOM_NODE_NAME) {
    throw new Error(`刷新后手动名称未保留：${imageAfterReload.name ?? "null"}`);
  }
  if (imageAfterReload.props?.alt !== "vnext08-sample.png") {
    throw new Error(`刷新后资源标识未保留：${imageAfterReload.props?.alt ?? "null"}`);
  }
  if (!layerLabelAfterReload.includes(`图片-${CUSTOM_NODE_NAME}`)) {
    throw new Error(`刷新后图层标签异常：${layerLabelAfterReload}`);
  }

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-vnext-21.json"),
    findProjectById(projectsAfterReload, projectId),
  );

  summary.checks.push({
    id: "reload-persistence",
    imageNodeId: imageAfterReload?.id ?? null,
    sameNodeAfterReload: imageAfterReload?.id === imageAfterSecondReplace?.id,
    name: imageAfterReload?.name ?? null,
    alt: imageAfterReload?.props?.alt ?? null,
    layerLabel: layerLabelAfterReload,
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
