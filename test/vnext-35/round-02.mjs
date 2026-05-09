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

/** 正式项目列表地址，允许在端口占用时临时覆写。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-30-vnext-35-b-round-01");

/** 用于框选的第一个矩形节点。 */
const PRIMARY_RECT = {
  id: "rect-primary",
  type: "rect",
  name: "左侧卡片",
  x: 140,
  y: 140,
  width: 220,
  height: 140,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    fill: "#99F6E4",
    stroke: "#0F766E",
    strokeWidth: 2,
    radius: 16,
  },
};

/** 用于框选的第二个矩形节点。 */
const SECONDARY_RECT = {
  id: "rect-secondary",
  type: "rect",
  name: "右侧卡片",
  x: 460,
  y: 300,
  width: 140,
  height: 92,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    fill: "#BFDBFE",
    stroke: "#2563EB",
    strokeWidth: 2,
    radius: 12,
  },
};

/** 不应被本轮框选命中的第三个矩形节点。 */
const TERTIARY_RECT = {
  id: "rect-tertiary",
  type: "rect",
  name: "底部卡片",
  x: 860,
  y: 500,
  width: 180,
  height: 110,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    fill: "#FCD34D",
    stroke: "#D97706",
    strokeWidth: 2,
    radius: 14,
  },
};

/** 基础批量对齐按钮集合。 */
const ALIGNMENT_CHECKS = [
  {
    action: "左对齐",
    value: "left",
  },
  {
    action: "水平居中",
    value: "h-center",
  },
  {
    action: "顶部对齐",
    value: "top",
  },
  {
    action: "垂直居中",
    value: "v-center",
  },
];

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext35-b-test]", label);
}

/**
 * 条件不满足时抛出清晰错误。
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
 * 判断两个数值是否在容差范围内近似相等。
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} tolerance
 * @returns {boolean}
 */
function nearlyEqual(actual, expected, tolerance = 1) {
  return Math.abs(actual - expected) <= tolerance;
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
 * 等待编辑器调试桥就绪。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function waitForEditorDebugBridge(page) {
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
}

/**
 * 读取当前页面的标准选中节点列表。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string[]>}
 */
async function readSelectionNodeIds(page) {
  return page.evaluate(() => window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.selection?.nodeIds ?? []);
}

/**
 * 读取当前激活页里指定节点的几何信息。
 *
 * @param {import("playwright").Page} page
 * @param {string[]} nodeIds
 * @returns {Promise<Array<{ id: string; x: number; y: number; width: number; height: number; }>>}
 */
async function readNodeGeometries(page, nodeIds) {
  return page.evaluate((targetNodeIds) => {
    const snapshot = window.__CW_EDITOR_DEBUG__?.getSnapshot?.();
    const activeSlide = snapshot?.document?.slides?.find(
      (slide) => slide.id === snapshot?.activeSlideId,
    );
    if (!activeSlide) {
      return [];
    }

    return targetNodeIds
      .map((nodeId) => activeSlide.nodes.find((node) => node.id === nodeId))
      .filter((node) => Boolean(node))
      .map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
      }));
  }, nodeIds);
}

/**
 * 把画布本地坐标换算成当前视口中的鼠标位置。
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
 * 通过调试桥在空白项目中写入三张矩形卡片，作为本轮选择与对齐场景。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ slideId: string; nodeIds: string[]; marqueeNodeIds: string[]; }>}
 */
async function seedSelectionScenario(page) {
  return page.evaluate(({ primaryRect, secondaryRect, tertiaryRect }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法搭建 VNext-35-B 场景");
    }

    const controller = debugBridge.getController();
    const commandTypes = debugBridge.getCommandTypes();
    const snapshot = debugBridge.getSnapshot();
    const slideId = snapshot.activeSlideId;
    if (!slideId) {
      throw new Error("当前项目没有可编辑的 slide");
    }

    [primaryRect, secondaryRect, tertiaryRect].forEach((node, index) => {
      controller.execute({
        type: commandTypes.NODE_CREATE,
        slideId,
        node,
        index,
      });
    });

    controller.execute({
      type: commandTypes.SELECTION_CLEAR,
      slideId,
    });

    return {
      slideId,
      nodeIds: [primaryRect.id, secondaryRect.id, tertiaryRect.id],
      marqueeNodeIds: [primaryRect.id, secondaryRect.id],
    };
  }, {
    primaryRect: PRIMARY_RECT,
    secondaryRect: SECONDARY_RECT,
    tertiaryRect: TERTIARY_RECT,
  });
}

/**
 * 在左上角空白区域拖拽一个框选矩形，覆盖前两张卡片。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function dragMarqueeSelection(page) {
  const startPoint = await resolveCanvasViewportPoint(page, 80, 90);
  const endPoint = await resolveCanvasViewportPoint(page, 660, 430);

  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(endPoint.x, endPoint.y, {
    steps: 24,
  });
  await page.mouse.up();
}

/**
 * 展开浮层图层面板，便于执行 Shift 多选与批量对齐。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openFloatingLayerManager(page) {
  const expandButton = page.getByRole("button", { name: "展开图层管理" });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
  }

  await page.locator(".floating-layer-manager__panel").waitFor();
}

/**
 * 清空当前选区，确保下一步选择断言只反映本轮交互结果。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function clearCurrentSelection(page) {
  await page.evaluate(() => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      return;
    }

    const controller = debugBridge.getController();
    const commandTypes = debugBridge.getCommandTypes();
    const snapshot = debugBridge.getSnapshot();
    const slideId = snapshot.activeSlideId;
    if (!slideId) {
      return;
    }

    controller.execute({
      type: commandTypes.SELECTION_CLEAR,
      slideId,
    });
  });
}

/**
 * 通过浮层图层列表完成一次 Shift 多选。
 *
 * @param {import("playwright").Page} page
 * @param {string[]} nodeNames
 * @returns {Promise<void>}
 */
async function shiftSelectFromLayerManager(page, nodeNames) {
  const layerItems = page.locator(".floating-layer-item__main");
  await layerItems.filter({ hasText: nodeNames[0] }).click();
  await layerItems.filter({ hasText: nodeNames[1] }).click({
    modifiers: ["Shift"],
  });
}

/**
 * 断言当前两张卡片是否满足指定的对齐结果。
 *
 * @param {Array<{ id: string; x: number; y: number; width: number; height: number; }>} geometries
 * @param {"left" | "h-center" | "top" | "v-center"} mode
 * @returns {void}
 */
function assertAlignmentResult(geometries, mode) {
  const [firstNode, secondNode] = geometries;
  assertOrThrow(firstNode && secondNode, `批量对齐后返回的节点数量不足：${geometries.length}`);

  switch (mode) {
    case "left":
      assertOrThrow(
        nearlyEqual(firstNode.x, secondNode.x),
        `左对齐失败：${firstNode.x} !== ${secondNode.x}`,
      );
      return;
    case "h-center":
      assertOrThrow(
        nearlyEqual(
          firstNode.x + firstNode.width / 2,
          secondNode.x + secondNode.width / 2,
        ),
        "水平居中失败：两个对象的中心点未重合",
      );
      return;
    case "top":
      assertOrThrow(
        nearlyEqual(firstNode.y, secondNode.y),
        `顶部对齐失败：${firstNode.y} !== ${secondNode.y}`,
      );
      return;
    case "v-center":
      assertOrThrow(
        nearlyEqual(
          firstNode.y + firstNode.height / 2,
          secondNode.y + secondNode.height / 2,
        ),
        "垂直居中失败：两个对象的中心点未重合",
      );
      return;
    default:
      throw new Error(`未处理的对齐模式：${mode}`);
  }
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
  await waitForEditorDebugBridge(page);
  await waitForSaved(page);

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";

  logStep("seed three rect nodes");
  const scenario = await seedSelectionScenario(page);
  await waitForSaved(page);

  logStep("verify drag marquee selection");
  await dragMarqueeSelection(page);
  await page.waitForFunction(
    (expectedNodeIds) => {
      const selectedNodeIds = window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.selection?.nodeIds ?? [];
      return (
        selectedNodeIds.length === expectedNodeIds.length &&
        expectedNodeIds.every((nodeId) => selectedNodeIds.includes(nodeId))
      );
    },
    scenario.marqueeNodeIds,
  );

  const marqueeSelectionNodeIds = await readSelectionNodeIds(page);
  assertOrThrow(
    marqueeSelectionNodeIds.length === 2 &&
      scenario.marqueeNodeIds.every((nodeId) => marqueeSelectionNodeIds.includes(nodeId)),
    `框选结果异常：${JSON.stringify(marqueeSelectionNodeIds)}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-marquee-selection.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "marquee-selection",
    selectionNodeIds: marqueeSelectionNodeIds,
  });

  logStep("verify shift multi-select from floating layer manager");
  await clearCurrentSelection(page);
  await openFloatingLayerManager(page);
  await shiftSelectFromLayerManager(page, [PRIMARY_RECT.name, SECONDARY_RECT.name]);
  await page.waitForFunction(
    (expectedNodeIds) => {
      const selectedNodeIds = window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.selection?.nodeIds ?? [];
      return (
        selectedNodeIds.length === expectedNodeIds.length &&
        expectedNodeIds.every((nodeId) => selectedNodeIds.includes(nodeId))
      );
    },
    scenario.marqueeNodeIds,
  );

  const shiftSelectionNodeIds = await readSelectionNodeIds(page);
  assertOrThrow(
    shiftSelectionNodeIds.length === 2 &&
      scenario.marqueeNodeIds.every((nodeId) => shiftSelectionNodeIds.includes(nodeId)),
    `Shift 多选结果异常：${JSON.stringify(shiftSelectionNodeIds)}`,
  );

  summary.checks.push({
    id: "shift-selection",
    selectionNodeIds: shiftSelectionNodeIds,
  });

  logStep("verify floating layer align actions");
  for (const alignmentCheck of ALIGNMENT_CHECKS) {
    const actionButton = page.getByRole("button", { name: alignmentCheck.action }).first();
    await actionButton.click();
    await waitForSaved(page);

    const alignedGeometries = await readNodeGeometries(page, scenario.marqueeNodeIds);
    assertAlignmentResult(alignedGeometries, alignmentCheck.value);

    summary.checks.push({
      id: `align-${alignmentCheck.value}`,
      action: alignmentCheck.action,
      geometries: alignedGeometries,
    });
  }

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-batch-alignments.png"),
    fullPage: true,
  });

  logStep("reload page and verify persisted geometry");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForEditorDebugBridge(page);
  await page.locator(".stage-surface .lower-canvas").waitFor();
  await waitForSaved(page);

  const persistedProject = await readPersistedProject(page, projectId);
  const persistedNodes = persistedProject?.document?.slides?.[0]?.nodes?.filter((node) =>
    scenario.marqueeNodeIds.includes(node.id),
  ) ?? [];
  assertOrThrow(
    persistedNodes.length === 2,
    `刷新后持久化节点数量异常：${persistedNodes.length}`,
  );

  assertAlignmentResult(
    persistedNodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    })),
    "v-center",
  );

  summary.checks.push({
    id: "persistence-after-align",
    geometries: persistedNodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    })),
  });

  assertOrThrow(
    consoleErrors.length === 0,
    `存在控制台错误：${consoleErrors.join(" | ")}`,
  );
  assertOrThrow(
    pageErrors.length === 0,
    `存在页面运行时错误：${pageErrors.join(" | ")}`,
  );
} finally {
  await browser.close();
}

await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
