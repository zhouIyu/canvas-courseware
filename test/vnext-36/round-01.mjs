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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-09-vnext-36-a-round-01");

/** 复制 / 粘贴默认偏移量。 */
const EXPECTED_OFFSET = 24;

/** 用于批量排版与批量操作的第一个矩形节点。 */
const PRIMARY_RECT = {
  id: "rect-vnext36-primary",
  type: "rect",
  name: "左侧卡片",
  x: 120,
  y: 120,
  width: 180,
  height: 120,
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

/** 用于批量排版与批量操作的第二个矩形节点。 */
const SECONDARY_RECT = {
  id: "rect-vnext36-secondary",
  type: "rect",
  name: "中间卡片",
  x: 420,
  y: 320,
  width: 160,
  height: 96,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    fill: "#BFDBFE",
    stroke: "#2563EB",
    strokeWidth: 2,
    radius: 14,
  },
};

/** 用于批量排版与批量操作的第三个矩形节点。 */
const TERTIARY_RECT = {
  id: "rect-vnext36-tertiary",
  type: "rect",
  name: "右侧卡片",
  x: 860,
  y: 220,
  width: 200,
  height: 140,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    fill: "#FCD34D",
    stroke: "#D97706",
    strokeWidth: 2,
    radius: 18,
  },
};

/**
 * 打印当前测试阶段，便于定位失败步骤。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext36-a-test]", label);
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
 * 读取当前编辑器标准快照。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<any>}
 */
async function readEditorSnapshot(page) {
  return page.evaluate(() => window.__CW_EDITOR_DEBUG__?.getSnapshot?.() ?? null);
}

/**
 * 读取当前撤销 / 重做历史状态。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ canUndo: boolean; canRedo: boolean; undoDepth: number; redoDepth: number; } | null>}
 */
async function readHistoryState(page) {
  return page.evaluate(() => window.__CW_EDITOR_DEBUG__?.getController?.()?.getHistoryState?.() ?? null);
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
 * 通过调试桥在空白项目中写入三张矩形卡片，作为本轮批量场景。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ slideId: string; nodeIds: string[]; nodeNames: string[]; }>}
 */
async function seedBatchScenario(page) {
  return page.evaluate(({ primaryRect, secondaryRect, tertiaryRect }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法搭建 VNext-36-A 场景");
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
      nodeNames: [primaryRect.name, secondaryRect.name, tertiaryRect.name],
    };
  }, {
    primaryRect: PRIMARY_RECT,
    secondaryRect: SECONDARY_RECT,
    tertiaryRect: TERTIARY_RECT,
  });
}

/**
 * 展开浮层图层面板。
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
 * 通过浮层图层列表完成一次 Shift 多选。
 *
 * @param {import("playwright").Page} page
 * @param {string[]} nodeNames
 * @returns {Promise<void>}
 */
async function shiftSelectFromLayerManager(page, nodeNames) {
  const layerItems = page.locator(".floating-layer-item__main");
  await layerItems.filter({ hasText: nodeNames[0] }).click();

  for (const nodeName of nodeNames.slice(1)) {
    await layerItems.filter({ hasText: nodeName }).click({
      modifiers: ["Shift"],
    });
  }
}

/**
 * 在画布空白区执行一次粘贴，复用全局快捷键链路。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function pasteByKeyboard(page) {
  await page.keyboard.press("Meta+V");
}

/**
 * 执行一次撤销。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function undoByKeyboard(page) {
  await page.keyboard.press("Meta+Z");
}

/**
 * 执行一次重做。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function redoByKeyboard(page) {
  await page.keyboard.press("Meta+Shift+Z");
}

/**
 * 读取浮层面板内指定操作按钮。
 *
 * @param {import("playwright").Page} page
 * @param {string} name
 * @returns {import("playwright").Locator}
 */
function resolveFloatingActionButton(page, name) {
  return page.locator(".floating-layer-manager__panel").getByRole("button", { name });
}

/**
 * 断言当前几何结果满足水平分布。
 *
 * @param {Array<{ id: string; x: number; y: number; width: number; height: number; }>} geometries
 * @returns {void}
 */
function assertHorizontalDistribution(geometries) {
  assertOrThrow(geometries.length === 3, `水平分布校验节点数量异常：${geometries.length}`);
  const sortedGeometries = [...geometries].sort(
    (leftNode, rightNode) =>
      leftNode.x + leftNode.width / 2 - (rightNode.x + rightNode.width / 2),
  );
  const firstCenter = sortedGeometries[0].x + sortedGeometries[0].width / 2;
  const middleCenter = sortedGeometries[1].x + sortedGeometries[1].width / 2;
  const lastCenter = sortedGeometries[2].x + sortedGeometries[2].width / 2;
  assertOrThrow(
    nearlyEqual(middleCenter - firstCenter, lastCenter - middleCenter),
    "水平分布失败：三个对象的水平中心间距不一致",
  );
}

/**
 * 断言当前几何结果满足垂直分布。
 *
 * @param {Array<{ id: string; x: number; y: number; width: number; height: number; }>} geometries
 * @returns {void}
 */
function assertVerticalDistribution(geometries) {
  assertOrThrow(geometries.length === 3, `垂直分布校验节点数量异常：${geometries.length}`);
  const sortedGeometries = [...geometries].sort(
    (topNode, bottomNode) =>
      topNode.y + topNode.height / 2 - (bottomNode.y + bottomNode.height / 2),
  );
  const firstCenter = sortedGeometries[0].y + sortedGeometries[0].height / 2;
  const middleCenter = sortedGeometries[1].y + sortedGeometries[1].height / 2;
  const lastCenter = sortedGeometries[2].y + sortedGeometries[2].height / 2;
  assertOrThrow(
    nearlyEqual(middleCenter - firstCenter, lastCenter - middleCenter),
    "垂直分布失败：三个对象的垂直中心间距不一致",
  );
}

/**
 * 断言某一次批量操作仅新增 1 条撤销历史。
 *
 * @param {{ undoDepth: number; redoDepth: number; } | null} beforeState
 * @param {{ undoDepth: number; redoDepth: number; } | null} afterState
 * @param {string} label
 * @returns {{ label: string; undoDepthBefore: number | null; undoDepthAfter: number | null; redoDepthAfter: number | null; }}
 */
function assertSingleHistoryStep(beforeState, afterState, label) {
  assertOrThrow(Boolean(beforeState && afterState), `${label} 缺少历史状态，无法校验。`);
  assertOrThrow(
    afterState.undoDepth === beforeState.undoDepth + 1,
    `${label} 未保持单次历史记录，撤销深度从 ${beforeState.undoDepth} 变成了 ${afterState.undoDepth}`,
  );
  assertOrThrow(
    afterState.redoDepth === 0,
    `${label} 执行后 redoDepth 异常，当前为 ${afterState.redoDepth}`,
  );

  return {
    label,
    undoDepthBefore: beforeState.undoDepth,
    undoDepthAfter: afterState.undoDepth,
    redoDepthAfter: afterState.redoDepth,
  };
}

/**
 * 读取目标项目首页中的全部节点。
 *
 * @param {any | null} project
 * @returns {any[]}
 */
function readProjectNodes(project) {
  return project?.document?.slides?.[0]?.nodes ?? [];
}

/**
 * 提取所有新增副本中与源节点一一对应的偏移摘要。
 *
 * @param {any[]} sourceNodes
 * @param {any[]} createdNodes
 * @param {number} offset
 * @returns {Array<{ sourceId: string; createdId: string; offsetX: number; offsetY: number; }>}
 */
function summarizeOffsetMatches(sourceNodes, createdNodes, offset) {
  return sourceNodes.map((sourceNode) => {
    const matchedNode = createdNodes.find(
      (createdNode) =>
        createdNode.type === sourceNode.type &&
        createdNode.x === sourceNode.x + offset &&
        createdNode.y === sourceNode.y + offset &&
        createdNode.width === sourceNode.width &&
        createdNode.height === sourceNode.height,
    );

    assertOrThrow(Boolean(matchedNode), `未找到 ${sourceNode.name} 的偏移副本。`);

    return {
      sourceId: sourceNode.id,
      createdId: matchedNode.id,
      offsetX: matchedNode.x - sourceNode.x,
      offsetY: matchedNode.y - sourceNode.y,
    };
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
  executedAt: new Date().toISOString(),
  desktopViewport: DEFAULT_VIEWPORT,
  expectedOffset: EXPECTED_OFFSET,
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
  const scenario = await seedBatchScenario(page);
  await waitForSaved(page);
  await openFloatingLayerManager(page);
  await shiftSelectFromLayerManager(page, scenario.nodeNames);
  await page.waitForFunction(
    (expectedNodeIds) => {
      const selectedNodeIds = window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.selection?.nodeIds ?? [];
      return (
        selectedNodeIds.length === expectedNodeIds.length &&
        expectedNodeIds.every((nodeId) => selectedNodeIds.includes(nodeId))
      );
    },
    scenario.nodeIds,
  );

  logStep("verify horizontal distribute");
  const historyBeforeHorizontalDistribute = await readHistoryState(page);
  await resolveFloatingActionButton(page, "水平分布").click();
  await waitForSaved(page);
  const horizontalDistributedGeometries = await readNodeGeometries(page, scenario.nodeIds);
  const historyAfterHorizontalDistribute = await readHistoryState(page);
  assertHorizontalDistribution(horizontalDistributedGeometries);
  summary.checks.push({
    id: "horizontal-distribute",
    ...assertSingleHistoryStep(
      historyBeforeHorizontalDistribute,
      historyAfterHorizontalDistribute,
      "水平分布",
    ),
    geometries: horizontalDistributedGeometries,
  });

  logStep("undo and redo horizontal distribute");
  await undoByKeyboard(page);
  await waitForSaved(page);
  const geometriesAfterHorizontalUndo = await readNodeGeometries(page, scenario.nodeIds);
  assertOrThrow(
    geometriesAfterHorizontalUndo.some(
      (geometry, index) => geometry.x !== horizontalDistributedGeometries[index]?.x,
    ),
    "撤销水平分布失败：节点几何未回退",
  );
  await redoByKeyboard(page);
  await waitForSaved(page);
  const geometriesAfterHorizontalRedo = await readNodeGeometries(page, scenario.nodeIds);
  assertHorizontalDistribution(geometriesAfterHorizontalRedo);

  logStep("verify vertical distribute");
  const historyBeforeVerticalDistribute = await readHistoryState(page);
  await resolveFloatingActionButton(page, "垂直分布").click();
  await waitForSaved(page);
  const verticalDistributedGeometries = await readNodeGeometries(page, scenario.nodeIds);
  const historyAfterVerticalDistribute = await readHistoryState(page);
  assertVerticalDistribution(verticalDistributedGeometries);
  summary.checks.push({
    id: "vertical-distribute",
    ...assertSingleHistoryStep(
      historyBeforeVerticalDistribute,
      historyAfterVerticalDistribute,
      "垂直分布",
    ),
    geometries: verticalDistributedGeometries,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-distribute.png"),
    fullPage: true,
  });

  logStep("copy multi selection and paste once");
  const originalSnapshot = await readEditorSnapshot(page);
  const originalNodes = originalSnapshot?.document?.slides?.[0]?.nodes?.filter((node) =>
    scenario.nodeIds.includes(node.id),
  ) ?? [];
  const historyBeforePaste = await readHistoryState(page);
  await resolveFloatingActionButton(page, "复制").click();
  await pasteByKeyboard(page);
  await waitForSaved(page);

  const snapshotAfterPaste = await readEditorSnapshot(page);
  const historyAfterPaste = await readHistoryState(page);
  const nodesAfterPaste = snapshotAfterPaste?.document?.slides?.[0]?.nodes ?? [];
  const pastedNodes = nodesAfterPaste.filter((node) => !scenario.nodeIds.includes(node.id));
  assertOrThrow(pastedNodes.length === 3, `批量粘贴后副本数量异常：${pastedNodes.length}`);
  assertOrThrow(
    (await readSelectionNodeIds(page)).length === 3,
    "批量粘贴后应自动选中新创建的 3 个副本",
  );
  summary.checks.push({
    id: "batch-paste",
    ...assertSingleHistoryStep(historyBeforePaste, historyAfterPaste, "批量粘贴"),
    offsets: summarizeOffsetMatches(originalNodes, pastedNodes, EXPECTED_OFFSET),
  });

  logStep("undo and redo batch paste");
  await undoByKeyboard(page);
  await waitForSaved(page);
  const snapshotAfterPasteUndo = await readEditorSnapshot(page);
  assertOrThrow(
    snapshotAfterPasteUndo?.document?.slides?.[0]?.nodes?.length === 3,
    "撤销批量粘贴失败：副本未整体移除",
  );
  await redoByKeyboard(page);
  await waitForSaved(page);
  const snapshotAfterPasteRedo = await readEditorSnapshot(page);
  assertOrThrow(
    snapshotAfterPasteRedo?.document?.slides?.[0]?.nodes?.length === 6,
    "重做批量粘贴失败：副本未整体恢复",
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-paste.png"),
    fullPage: true,
  });

  logStep("duplicate current pasted selection");
  const pastedSelectionNodeIds = await readSelectionNodeIds(page);
  const snapshotBeforeDuplicate = await readEditorSnapshot(page);
  const pastedSelectionNodes = snapshotBeforeDuplicate?.document?.slides?.[0]?.nodes?.filter((node) =>
    pastedSelectionNodeIds.includes(node.id),
  ) ?? [];
  const historyBeforeDuplicate = await readHistoryState(page);
  await resolveFloatingActionButton(page, "重复").click();
  await waitForSaved(page);

  const snapshotAfterDuplicate = await readEditorSnapshot(page);
  const historyAfterDuplicate = await readHistoryState(page);
  const duplicateSelectionNodeIds = await readSelectionNodeIds(page);
  const duplicateSelectionNodes = snapshotAfterDuplicate?.document?.slides?.[0]?.nodes?.filter((node) =>
    duplicateSelectionNodeIds.includes(node.id),
  ) ?? [];
  assertOrThrow(duplicateSelectionNodes.length === 3, `批量重复后选中副本数量异常：${duplicateSelectionNodes.length}`);
  summary.checks.push({
    id: "batch-duplicate",
    ...assertSingleHistoryStep(historyBeforeDuplicate, historyAfterDuplicate, "批量重复"),
    offsets: summarizeOffsetMatches(pastedSelectionNodes, duplicateSelectionNodes, EXPECTED_OFFSET),
  });

  logStep("undo and redo batch duplicate");
  await undoByKeyboard(page);
  await waitForSaved(page);
  const snapshotAfterDuplicateUndo = await readEditorSnapshot(page);
  assertOrThrow(
    snapshotAfterDuplicateUndo?.document?.slides?.[0]?.nodes?.length === 6,
    "撤销批量重复失败：重复副本未整体移除",
  );
  await redoByKeyboard(page);
  await waitForSaved(page);
  const snapshotAfterDuplicateRedo = await readEditorSnapshot(page);
  assertOrThrow(
    snapshotAfterDuplicateRedo?.document?.slides?.[0]?.nodes?.length === 9,
    "重做批量重复失败：重复副本未整体恢复",
  );

  logStep("delete current duplicated selection");
  const historyBeforeDelete = await readHistoryState(page);
  await resolveFloatingActionButton(page, "删除").click();
  await waitForSaved(page);
  const snapshotAfterDelete = await readEditorSnapshot(page);
  const historyAfterDelete = await readHistoryState(page);
  assertOrThrow(
    snapshotAfterDelete?.document?.slides?.[0]?.nodes?.length === 6,
    `批量删除后节点数量异常：${snapshotAfterDelete?.document?.slides?.[0]?.nodes?.length ?? "unknown"}`,
  );
  summary.checks.push({
    id: "batch-delete",
    ...assertSingleHistoryStep(historyBeforeDelete, historyAfterDelete, "批量删除"),
    remainingNodeCount: snapshotAfterDelete?.document?.slides?.[0]?.nodes?.length ?? null,
  });

  logStep("undo and redo batch delete");
  await undoByKeyboard(page);
  await waitForSaved(page);
  const snapshotAfterDeleteUndo = await readEditorSnapshot(page);
  assertOrThrow(
    snapshotAfterDeleteUndo?.document?.slides?.[0]?.nodes?.length === 9,
    "撤销批量删除失败：节点未整体恢复",
  );
  await redoByKeyboard(page);
  await waitForSaved(page);
  const snapshotAfterDeleteRedo = await readEditorSnapshot(page);
  assertOrThrow(
    snapshotAfterDeleteRedo?.document?.slides?.[0]?.nodes?.length === 6,
    "重做批量删除失败：节点未整体移除",
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-delete.png"),
    fullPage: true,
  });

  logStep("reload and verify persistence");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForEditorDebugBridge(page);
  await waitForSaved(page);

  const persistedProject = await readPersistedProject(page, projectId);
  const persistedNodes = readProjectNodes(persistedProject);
  assertOrThrow(
    persistedNodes.length === 6,
    `刷新后节点数量异常，期望 6，实际 ${persistedNodes.length}`,
  );
  summary.checks.push({
    id: "reload-persistence",
    nodeCount: persistedNodes.length,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
    fullPage: true,
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
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
