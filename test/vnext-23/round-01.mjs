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
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-10-vnext-23-round-01");
/** 用于种子图片节点的最小 PNG 资源。 */
const SAMPLE_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pSkeBYAAAAASUVORK5CYII=";
/** 右键换图时使用的目标图片资源。 */
const REPLACE_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-09-round-01/vnext09-bg-portrait.png",
);

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext23-test]", label);
}

/**
 * 从项目存储中按节点 id 读取首页节点。
 *
 * @param {any} project
 * @param {string} nodeId
 * @returns {any | null}
 */
function readNodeById(project, nodeId) {
  return project?.document?.slides?.[0]?.nodes?.find((node) => node.id === nodeId) ?? null;
}

/**
 * 把画布内部坐标换算成当前视口点击点。
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
 * 根据节点几何信息，返回一个稳定落在节点内部的右键点击点。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} node
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function resolveNodeContextPoint(page, node) {
  const localX = node.x + Math.min(Math.max(node.width * 0.35, 40), node.width - 18);
  const localY = node.y + Math.min(Math.max(node.height * 0.45, 26), node.height - 18);
  return resolveCanvasViewportPoint(page, localX, localY);
}

/**
 * 在编辑区空白区域打开右键菜单。
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
 * 在指定节点上打开右键菜单。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} node
 * @returns {Promise<void>}
 */
async function openNodeContextMenu(page, node) {
  const point = await resolveNodeContextPoint(page, node);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.locator(".stage-context-menu").waitFor();
}

/**
 * 关闭当前右键菜单，避免下一个断言读到旧状态。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function closeContextMenu(page) {
  if (!(await page.locator(".stage-context-menu").isVisible().catch(() => false))) {
    return;
  }

  await page.keyboard.press("Escape");
  await page.locator(".stage-context-menu").waitFor({ state: "hidden" });
}

/**
 * 读取当前右键菜单中的归一化文案。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function readContextMenuText(page) {
  const menuText = await page.locator(".stage-context-menu").textContent();
  return normalizeInlineText(menuText);
}

/**
 * 等待编辑器调试桥暴露完成。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function waitForEditorDebugBridge(page) {
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
}

/**
 * 通过调试桥在当前页面中写入两段文本和一张图片，作为右键菜单回归场景。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{
 *   slideId: string;
 *   nodes: {
 *     textPrimary: { id: string; x: number; y: number; width: number; height: number; };
 *     textSecondary: { id: string; x: number; y: number; width: number; height: number; };
 *     imagePrimary: { id: string; x: number; y: number; width: number; height: number; };
 *   };
 * }>}
 */
async function seedContextMenuScenario(page) {
  return page.evaluate((imageDataUrl) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法搭建 VNext-23 场景");
    }

    const controller = debugBridge.getController();
    const snapshot = debugBridge.getSnapshot();
    const slideId = snapshot.activeSlideId;
    if (!slideId) {
      throw new Error("当前项目没有可编辑的 slide");
    }

    const createId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
    const baseIndex = snapshot.document.slides.find((slide) => slide.id === slideId)?.nodes.length ?? 0;

    const textPrimary = {
      id: createId("node"),
      type: "text",
      name: "主标题",
      x: 420,
      y: 110,
      width: 320,
      height: 88,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      props: {
        text: "单选右键不应该再出现插入类操作。",
        fontSize: 30,
        color: "#172033",
        fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        lineHeight: 1.5,
        textAlign: "left",
      },
    };

    const textSecondary = {
      id: createId("node"),
      type: "text",
      name: "补充文案",
      x: 420,
      y: 260,
      width: 340,
      height: 88,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      props: {
        text: "多选右键需要继续保留批量操作语义。",
        fontSize: 28,
        color: "#24415E",
        fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        lineHeight: 1.5,
        textAlign: "left",
      },
    };

    const imagePrimary = {
      id: createId("node"),
      type: "image",
      name: "seed-image",
      x: 110,
      y: 140,
      width: 250,
      height: 180,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      props: {
        src: imageDataUrl,
        alt: "seed-image.png",
        objectFit: "contain",
      },
    };

    [imagePrimary, textPrimary, textSecondary].forEach((node, offset) => {
      controller.execute({
        type: "node.create",
        slideId,
        node,
        index: baseIndex + offset,
      });
    });

    return {
      slideId,
      nodes: {
        textPrimary: {
          id: textPrimary.id,
          x: textPrimary.x,
          y: textPrimary.y,
          width: textPrimary.width,
          height: textPrimary.height,
        },
        textSecondary: {
          id: textSecondary.id,
          x: textSecondary.x,
          y: textSecondary.y,
          width: textSecondary.width,
          height: textSecondary.height,
        },
        imagePrimary: {
          id: imagePrimary.id,
          x: imagePrimary.x,
          y: imagePrimary.y,
          width: imagePrimary.width,
          height: imagePrimary.height,
        },
      },
    };
  }, SAMPLE_IMAGE_DATA_URL);
}

/**
 * 通过调试桥把当前选中态设置为指定节点集合，并等待 Fabric 画布同步完成。
 *
 * @param {import("playwright").Page} page
 * @param {string} slideId
 * @param {string[]} nodeIds
 * @returns {Promise<void>}
 */
async function setCanvasSelection(page, slideId, nodeIds) {
  await page.evaluate(({ currentSlideId, currentNodeIds }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法设置选中态");
    }

    debugBridge.getController().execute({
      type: "selection.set",
      slideId: currentSlideId,
      nodeIds: currentNodeIds,
    });
  }, {
    currentSlideId: slideId,
    currentNodeIds: nodeIds,
  });

  await page.waitForFunction((expectedCount) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      return false;
    }

    const canvas = debugBridge.getCanvas();
    const snapshot = debugBridge.getSnapshot();
    return (
      snapshot.selection.nodeIds.length === expectedCount &&
      canvas?.getActiveObjects().length === expectedCount
    );
  }, nodeIds.length);
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchBrowserSession(DEFAULT_VIEWPORT);
/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
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
  await waitForEditorDebugBridge(page);

  logStep("seed context menu scenario");
  const seededScenario = await seedContextMenuScenario(page);
  await waitForSaved(page);

  logStep("verify blank context menu");
  await openBlankContextMenu(page);
  const blankMenuText = await readContextMenuText(page);
  summary.checks.push({
    id: "blank-context-menu",
    menuText: blankMenuText,
    hasInsertText: blankMenuText.includes("插入文本"),
    hasInsertRect: blankMenuText.includes("插入矩形"),
    hasInsertImage: blankMenuText.includes("插入图片"),
    hasPaste: blankMenuText.includes("粘贴"),
    hasSelectionAction:
      blankMenuText.includes("复制所选") ||
      blankMenuText.includes("重复所选") ||
      blankMenuText.includes("删除所选"),
  });
  if (!blankMenuText.includes("插入文本") || !blankMenuText.includes("插入矩形")) {
    throw new Error(`空白区菜单缺少插入项：${blankMenuText}`);
  }
  if (blankMenuText.includes("复制所选") || blankMenuText.includes("更换图片")) {
    throw new Error(`空白区菜单混入了对象级操作：${blankMenuText}`);
  }
  await closeContextMenu(page);

  logStep("verify single text context menu");
  await openNodeContextMenu(page, seededScenario.nodes.textPrimary);
  const singleTextMenuText = await readContextMenuText(page);
  summary.checks.push({
    id: "single-text-context-menu",
    menuText: singleTextMenuText,
    hasCopy: singleTextMenuText.includes("复制所选"),
    hasDuplicate: singleTextMenuText.includes("重复所选"),
    hasDelete: singleTextMenuText.includes("删除所选"),
    hasInsertText: singleTextMenuText.includes("插入文本"),
    hasReplaceImage: singleTextMenuText.includes("更换图片"),
  });
  if (
    !singleTextMenuText.includes("复制所选") ||
    !singleTextMenuText.includes("重复所选") ||
    !singleTextMenuText.includes("删除所选")
  ) {
    throw new Error(`单选对象菜单缺少基础操作：${singleTextMenuText}`);
  }
  if (singleTextMenuText.includes("插入文本") || singleTextMenuText.includes("更换图片")) {
    throw new Error(`单选对象菜单仍混入了错误上下文操作：${singleTextMenuText}`);
  }
  await closeContextMenu(page);

  logStep("verify multi selection context menu");
  await setCanvasSelection(page, seededScenario.slideId, [
    seededScenario.nodes.textPrimary.id,
    seededScenario.nodes.textSecondary.id,
  ]);
  await openNodeContextMenu(page, seededScenario.nodes.textPrimary);
  const multiMenuText = await readContextMenuText(page);
  const multiSelectionCount = await page.evaluate(() => window.__CW_EDITOR_DEBUG__?.getSnapshot().selection.nodeIds.length ?? 0);
  summary.checks.push({
    id: "multi-selection-context-menu",
    menuText: multiMenuText,
    selectionCount: multiSelectionCount,
    hasCopy: multiMenuText.includes("复制所选"),
    hasDuplicate: multiMenuText.includes("重复所选"),
    hasDelete: multiMenuText.includes("删除所选"),
    hasInsertText: multiMenuText.includes("插入文本"),
    hasReplaceImage: multiMenuText.includes("更换图片"),
  });
  if (multiSelectionCount !== 2) {
    throw new Error(`多选右键后选中态丢失，当前数量为 ${multiSelectionCount}`);
  }
  if (multiMenuText.includes("插入文本") || multiMenuText.includes("更换图片")) {
    throw new Error(`多选菜单仍混入了空白区或图片专属操作：${multiMenuText}`);
  }
  await closeContextMenu(page);

  logStep("verify image context menu");
  await openNodeContextMenu(page, seededScenario.nodes.imagePrimary);
  const imageMenuText = await readContextMenuText(page);
  summary.checks.push({
    id: "image-context-menu",
    menuText: imageMenuText,
    hasReplaceImage: imageMenuText.includes("更换图片"),
    hasSetBackground: imageMenuText.includes("设为背景"),
    hasInsertText: imageMenuText.includes("插入文本"),
  });
  if (!imageMenuText.includes("更换图片") || !imageMenuText.includes("设为背景")) {
    throw new Error(`图片右键菜单缺少图片专属操作：${imageMenuText}`);
  }
  if (imageMenuText.includes("插入文本")) {
    throw new Error(`图片右键菜单仍混入插入类操作：${imageMenuText}`);
  }

  logStep("replace image from context menu");
  await page.locator(".stage-context-menu input[type='file']").setInputFiles(REPLACE_IMAGE_PATH);
  await waitForSaved(page);

  const storedProjectsAfterReplace = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterReplace = findProjectById(storedProjectsAfterReplace, projectId);
  const replacedImageNode = readNodeById(projectAfterReplace, seededScenario.nodes.imagePrimary.id);
  const selectionAfterReplace = await page.evaluate(() => window.__CW_EDITOR_DEBUG__?.getSnapshot().selection.nodeIds ?? []);

  summary.checks.push({
    id: "replace-image-from-context-menu",
    nodeId: replacedImageNode?.id ?? null,
    name: replacedImageNode?.name ?? null,
    alt: replacedImageNode?.props?.alt ?? null,
    selectedNodeIds: selectionAfterReplace,
  });

  if (!replacedImageNode) {
    throw new Error("右键更换图片后，未在项目存储中找到目标图片节点");
  }
  if (replacedImageNode.id !== seededScenario.nodes.imagePrimary.id) {
    throw new Error("右键更换图片后图片节点被重建，未保留原节点 id");
  }
  if (replacedImageNode.name !== "vnext09-bg-portrait") {
    throw new Error(`右键更换图片后默认名称未同步：${replacedImageNode.name ?? "null"}`);
  }
  if (replacedImageNode.props?.alt !== "vnext09-bg-portrait.png") {
    throw new Error(`右键更换图片后资源标识未同步：${replacedImageNode.props?.alt ?? "null"}`);
  }
  if (selectionAfterReplace[0] !== seededScenario.nodes.imagePrimary.id) {
    throw new Error("右键更换图片后当前选中态未保留在原图片节点上");
  }

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-context-replace-image.png"),
    fullPage: true,
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(
      `自动化执行期间捕获到错误；console=${consoleErrors.length}, page=${pageErrors.length}`,
    );
  }

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await writeJsonFile(path.join(ASSET_DIR, "storage-after-vnext-23.json"), storedProjectsAfterReplace);
  logStep("vnext-23 checks passed");
} finally {
  await browser.close();
}
