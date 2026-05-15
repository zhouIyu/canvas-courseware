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
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-15-vnext-38-a-round-01");

/** 目标字体标签。 */
const TARGET_FONT_LABEL = "Times New Roman";

/** 目标字体值。 */
const TARGET_FONT_VALUE = '"Times New Roman", "Times", serif';

/** 目标文本对齐方式。 */
const TARGET_TEXT_ALIGN = "justify";

/** 目标行高。 */
const TARGET_LINE_HEIGHT = 2.3;

/** 目标透明度百分比。 */
const TARGET_OPACITY_PERCENT = 64;

/** 目标旋转角度。 */
const TARGET_ROTATION = 27;

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext38-a-test]", label);
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
 * 通过调试桥把当前选中态切回指定文本节点，避免刷新后因默认空选中而无法读取属性面板回显。
 *
 * @param {import("playwright").Page} page
 * @param {string} slideId
 * @param {string} nodeId
 * @returns {Promise<void>}
 */
async function setCanvasSelection(page, slideId, nodeId) {
  await page.evaluate(({ currentSlideId, currentNodeId }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法恢复文本节点选中态");
    }

    const commandTypes = debugBridge.getCommandTypes();
    debugBridge.getController().execute({
      type: commandTypes.SELECTION_SET,
      slideId: currentSlideId,
      nodeIds: [currentNodeId],
    });
  }, {
    currentSlideId: slideId,
    currentNodeId: nodeId,
  });

  await page.waitForFunction((expectedNodeId) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      return false;
    }

    const snapshot = debugBridge.getSnapshot?.();
    const canvas = debugBridge.getCanvas?.();
    return (
      snapshot?.selection?.nodeIds?.[0] === expectedNodeId &&
      snapshot?.selection?.nodeIds?.length === 1 &&
      canvas?.getActiveObjects?.()?.length === 1
    );
  }, nodeId);
}

/**
 * 读取属性面板里指定标签对应的字段容器。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {import("playwright").Locator}
 */
function inspectorField(page, label) {
  return page.locator(".field").filter({
    has: page.locator(".field-label", { hasText: label }),
  }).first();
}

/**
 * 读取属性面板里指定标签对应的输入框。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {import("playwright").Locator}
 */
function inspectorInput(page, label) {
  return inspectorField(page, label).locator("input").first();
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
 * 确保右侧停留在“组件属性”标签。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function ensureInspectorTabActive(page) {
  const tab = page.locator(".side-tabs-nav .arco-tabs-tab").filter({ hasText: "组件属性" });
  if ((await tab.getAttribute("aria-selected")) === "true") {
    return;
  }

  await tab.click();
}

/**
 * 更新属性面板里的数值输入框并触发 blur，让编辑结果进入标准保存链路。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {number} value
 * @returns {Promise<void>}
 */
async function setInspectorNumber(page, label, value) {
  const input = inspectorInput(page, label);
  await input.click();
  await input.fill(String(value));
  await input.blur();
}

/**
 * 在属性面板中选择一个下拉选项。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {string} optionText
 * @returns {Promise<void>}
 */
async function selectInspectorOption(page, label, optionText) {
  const field = inspectorField(page, label);
  await field.locator(".arco-select").click();
  await page.locator(".arco-select-option").filter({ hasText: optionText }).click();
}

/**
 * 读取属性面板中某个下拉框当前显示的文本。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {Promise<string>}
 */
async function readInspectorSelectText(page, label) {
  return (
    (await inspectorField(page, label).locator(".arco-select-view-value").textContent())?.trim() ?? ""
  );
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
  targetFontLabel: TARGET_FONT_LABEL,
  targetFontValue: TARGET_FONT_VALUE,
  targetTextAlign: TARGET_TEXT_ALIGN,
  targetLineHeight: TARGET_LINE_HEIGHT,
  targetOpacityPercent: TARGET_OPACITY_PERCENT,
  targetRotation: TARGET_ROTATION,
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
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";

  logStep("insert text node");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);
  await ensureRightSidebarExpanded(page);
  await ensureInspectorTabActive(page);

  logStep("edit text properties from inspector");
  await selectInspectorOption(page, "字体", TARGET_FONT_LABEL);
  await waitForSaved(page);
  await selectInspectorOption(page, "对齐方式", "两端对齐");
  await waitForSaved(page);
  await setInspectorNumber(page, "行高", TARGET_LINE_HEIGHT);
  await waitForSaved(page);
  await setInspectorNumber(page, "透明度", TARGET_OPACITY_PERCENT);
  await waitForSaved(page);
  await setInspectorNumber(page, "旋转", TARGET_ROTATION);
  await waitForSaved(page);

  const projectAfterEdit = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const editedTextNode = readTextNodes(projectAfterEdit)[0] ?? null;

  summary.checks.push({
    id: "stored-text-node-after-edit",
    fontFamily: editedTextNode?.props?.fontFamily ?? null,
    textAlign: editedTextNode?.props?.textAlign ?? null,
    lineHeight: editedTextNode?.props?.lineHeight ?? null,
    opacity: editedTextNode?.opacity ?? null,
    rotation: editedTextNode?.rotation ?? null,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-text-property-edit.png"),
    fullPage: true,
  });

  logStep("reload and verify persistence");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
  await ensureRightSidebarExpanded(page);
  await ensureInspectorTabActive(page);

  const projectAfterReload = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const reloadedTextNode = readTextNodes(projectAfterReload)[0] ?? null;
  const activeSlideId = await page.evaluate(
    () => window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.activeSlideId ?? null,
  );
  if (!reloadedTextNode?.id || !activeSlideId) {
    throw new Error("刷新后未读取到目标文本节点或当前页面，无法验证属性面板回显");
  }

  await setCanvasSelection(page, activeSlideId, reloadedTextNode.id);
  const reloadedRotationValue = await inspectorInput(page, "旋转").inputValue();
  const reloadedOpacityValue = await inspectorInput(page, "透明度").inputValue();
  const reloadedLineHeightValue = await inspectorInput(page, "行高").inputValue();
  const reloadedFontLabel = await readInspectorSelectText(page, "字体");
  const reloadedAlignLabel = await readInspectorSelectText(page, "对齐方式");

  summary.checks.push({
    id: "reloaded-inspector-values",
    rotation: reloadedRotationValue,
    opacity: reloadedOpacityValue,
    lineHeight: reloadedLineHeightValue,
    fontLabel: reloadedFontLabel,
    alignLabel: reloadedAlignLabel,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload-text-property-edit.png"),
    fullPage: true,
  });

  if (editedTextNode?.props?.fontFamily !== TARGET_FONT_VALUE) {
    throw new Error(`字体写回异常，当前值为 ${editedTextNode?.props?.fontFamily ?? "null"}`);
  }

  if (editedTextNode?.props?.textAlign !== TARGET_TEXT_ALIGN) {
    throw new Error(`文本对齐写回异常，当前值为 ${editedTextNode?.props?.textAlign ?? "null"}`);
  }

  if (editedTextNode?.props?.lineHeight !== TARGET_LINE_HEIGHT) {
    throw new Error(`行高写回异常，当前值为 ${editedTextNode?.props?.lineHeight ?? "null"}`);
  }

  if (editedTextNode?.opacity !== TARGET_OPACITY_PERCENT / 100) {
    throw new Error(`透明度写回异常，当前值为 ${editedTextNode?.opacity ?? "null"}`);
  }

  if (editedTextNode?.rotation !== TARGET_ROTATION) {
    throw new Error(`旋转角度写回异常，当前值为 ${editedTextNode?.rotation ?? "null"}`);
  }

  if (reloadedTextNode?.props?.fontFamily !== TARGET_FONT_VALUE) {
    throw new Error(`刷新后字体恢复异常，当前值为 ${reloadedTextNode?.props?.fontFamily ?? "null"}`);
  }

  if (reloadedTextNode?.props?.textAlign !== TARGET_TEXT_ALIGN) {
    throw new Error(`刷新后对齐恢复异常，当前值为 ${reloadedTextNode?.props?.textAlign ?? "null"}`);
  }

  if (reloadedTextNode?.props?.lineHeight !== TARGET_LINE_HEIGHT) {
    throw new Error(`刷新后行高恢复异常，当前值为 ${reloadedTextNode?.props?.lineHeight ?? "null"}`);
  }

  if (reloadedTextNode?.opacity !== TARGET_OPACITY_PERCENT / 100) {
    throw new Error(`刷新后透明度恢复异常，当前值为 ${reloadedTextNode?.opacity ?? "null"}`);
  }

  if (reloadedTextNode?.rotation !== TARGET_ROTATION) {
    throw new Error(`刷新后旋转恢复异常，当前值为 ${reloadedTextNode?.rotation ?? "null"}`);
  }

  if (reloadedRotationValue !== String(TARGET_ROTATION)) {
    throw new Error(`刷新后属性面板旋转值异常，当前值为 ${reloadedRotationValue}`);
  }

  if (reloadedOpacityValue !== String(TARGET_OPACITY_PERCENT)) {
    throw new Error(`刷新后属性面板透明度值异常，当前值为 ${reloadedOpacityValue}`);
  }

  if (reloadedLineHeightValue !== String(TARGET_LINE_HEIGHT)) {
    throw new Error(`刷新后属性面板行高值异常，当前值为 ${reloadedLineHeightValue}`);
  }

  if (!reloadedFontLabel.includes(TARGET_FONT_LABEL)) {
    throw new Error(`刷新后字体选择器未回显目标字体，当前值为 ${reloadedFontLabel}`);
  }

  if (!reloadedAlignLabel.includes("两端对齐")) {
    throw new Error(`刷新后对齐选择器未回显目标选项，当前值为 ${reloadedAlignLabel}`);
  }

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("VNext-38-A 文本属性回归过程中出现控制台或运行时错误");
  }

  summary.result = "passed";
} catch (error) {
  summary.result = "failed";
  summary.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
