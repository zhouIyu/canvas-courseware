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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-19-bug-vnext38-01-round-01");

/** 本轮多选旋转目标角度。 */
const TARGET_ROTATION = 32;

/** 本轮拖拽位移。 */
const DRAG_DELTA = {
  x: 72,
  y: 44,
};

/** 第一个矩形节点。 */
const PRIMARY_RECT = {
  id: "bug-vnext38-01-primary-rect",
  type: "rect",
  name: "主卡片",
  x: 180,
  y: 180,
  width: 180,
  height: 120,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    fill: "#A7F3D0",
    stroke: "#059669",
    strokeWidth: 2,
    radius: 18,
  },
};

/** 第二个矩形节点。 */
const SECONDARY_RECT = {
  id: "bug-vnext38-01-secondary-rect",
  type: "rect",
  name: "副卡片",
  x: 430,
  y: 240,
  width: 200,
  height: 100,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    fill: "#BFDBFE",
    stroke: "#2563EB",
    strokeWidth: 2,
    radius: 16,
  },
};

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[bug-vnext38-01-test]", label);
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
 * 从项目记录中读取首页指定节点的几何。
 *
 * @param {any | null} project
 * @param {string} nodeId
 * @returns {{ id: string; x: number; y: number; width: number; height: number; rotation: number; } | null}
 */
function readPersistedNodeGeometry(project, nodeId) {
  const targetNode =
    project?.document?.slides?.[0]?.nodes?.find((node) => node.id === nodeId) ?? null;
  if (!targetNode) {
    return null;
  }

  return {
    id: targetNode.id,
    x: targetNode.x,
    y: targetNode.y,
    width: targetNode.width,
    height: targetNode.height,
    rotation: targetNode.rotation,
  };
}

/**
 * 读取当前激活页里指定节点的标准几何。
 *
 * @param {import("playwright").Page} page
 * @param {string[]} nodeIds
 * @returns {Promise<Array<{ id: string; x: number; y: number; width: number; height: number; rotation: number; }>>}
 */
async function readCurrentNodeGeometries(page, nodeIds) {
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
        rotation: node.rotation,
      }));
  }, nodeIds);
}

/**
 * 通过调试桥写入两个矩形节点并清空初始选区。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ slideId: string; nodeIds: string[]; }>}
 */
async function seedRotateScenario(page) {
  return page.evaluate(({ primaryRect, secondaryRect }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法搭建 BUG-VNEXT38-01 场景。");
    }

    const controller = debugBridge.getController();
    const commandTypes = debugBridge.getCommandTypes();
    const snapshot = debugBridge.getSnapshot();
    const slideId = snapshot.activeSlideId;
    if (!slideId) {
      throw new Error("当前项目没有可编辑的 slide。");
    }

    [primaryRect, secondaryRect].forEach((node, index) => {
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
      nodeIds: [primaryRect.id, secondaryRect.id],
    };
  }, {
    primaryRect: PRIMARY_RECT,
    secondaryRect: SECONDARY_RECT,
  });
}

/**
 * 通过调试桥把指定节点列表设置为当前多选态。
 *
 * @param {import("playwright").Page} page
 * @param {string} slideId
 * @param {string[]} nodeIds
 * @returns {Promise<void>}
 */
async function setSelection(page, slideId, nodeIds) {
  await page.evaluate(({ currentSlideId, currentNodeIds }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法设置多选态。");
    }

    debugBridge.getController().execute({
      type: debugBridge.getCommandTypes().SELECTION_SET,
      slideId: currentSlideId,
      nodeIds: currentNodeIds,
    });
  }, {
    currentSlideId: slideId,
    currentNodeIds: nodeIds,
  });
}

/**
 * 通过 ActiveSelection 合成一次批量旋转，并返回旋转后的标准几何快照。
 *
 * @param {import("playwright").Page} page
 * @param {{ slideId: string; nodeIds: string[]; rotation: number; }} payload
 * @returns {Promise<Array<{ id: string; x: number; y: number; width: number; height: number; rotation: number; }>>}
 */
async function rotateActiveSelection(page, payload) {
  return page.evaluate(({ currentSlideId, currentNodeIds, rotation }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    const canvas = debugBridge?.getCanvas?.();
    if (!debugBridge || !canvas) {
      throw new Error("编辑器调试桥尚未就绪，无法执行多选旋转。");
    }

    const objects = currentNodeIds
      .map((nodeId) =>
        canvas.getObjects().find((object) => object?.__coursewareNodeMeta?.nodeId === nodeId),
      )
      .filter((object) => Boolean(object));
    if (objects.length !== currentNodeIds.length) {
      throw new Error("多选旋转前未找到全部目标对象。");
    }

    debugBridge.getController().execute({
      type: debugBridge.getCommandTypes().SELECTION_SET,
      slideId: currentSlideId,
      nodeIds: currentNodeIds,
    });
    const activeSelection = canvas.getActiveObject?.();
    if (!activeSelection || typeof activeSelection.getObjects !== "function") {
      throw new Error("当前画布未形成稳定的 ActiveSelection。");
    }

    activeSelection.set({
      angle: rotation,
    });
    activeSelection.setCoords?.();

    canvas.fire("object:rotating", { target: activeSelection });
    canvas.fire("object:modified", {
      target: activeSelection,
      action: "rotate",
    });
    canvas.fire("mouse:up", {});

    const snapshot = debugBridge.getSnapshot();
    const activeSlide = snapshot.document.slides.find((slide) => slide.id === currentSlideId);
    if (!activeSlide) {
      return [];
    }

    return currentNodeIds
      .map((nodeId) => activeSlide.nodes.find((node) => node.id === nodeId))
      .filter((node) => Boolean(node))
      .map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rotation: node.rotation,
      }));
  }, {
    currentSlideId: payload.slideId,
    currentNodeIds: payload.nodeIds,
    rotation: payload.rotation,
  });
}

/**
 * 通过调试桥合成一次单节点拖拽，验证拖拽后其他节点不会被旧几何覆盖。
 *
 * @param {import("playwright").Page} page
 * @param {{ nodeId: string; left: number; top: number; }} payload
 * @returns {Promise<void>}
 */
async function dragSingleNode(page, payload) {
  await page.evaluate((nextPosition) => {
    const canvas = window.__CW_EDITOR_DEBUG__?.getCanvas?.();
    if (!canvas) {
      throw new Error("编辑器调试桥尚未就绪，无法执行单节点拖拽。");
    }

    const target = canvas.getObjects().find((object) => {
      return object?.__coursewareNodeMeta?.nodeId === nextPosition.nodeId;
    });
    if (!target) {
      throw new Error(`未找到待拖拽节点 ${nextPosition.nodeId}`);
    }

    canvas.setActiveObject(target);
    target.set({
      left: nextPosition.left,
      top: nextPosition.top,
    });
    target.setCoords?.();

    canvas.fire("object:moving", { target });
    canvas.fire("object:modified", {
      target,
      action: "drag",
    });
    canvas.fire("mouse:up", {});
  }, payload);
}

/**
 * 断言两组节点几何在容差范围内一致。
 *
 * @param {Array<{ id: string; x: number; y: number; width: number; height: number; rotation: number; }>} actual
 * @param {Array<{ id: string; x: number; y: number; width: number; height: number; rotation: number; }>} expected
 * @param {string} label
 * @returns {void}
 */
function assertNodeGeometriesEqual(actual, expected, label) {
  assertOrThrow(
    actual.length === expected.length,
    `${label} 节点数量异常：${actual.length} !== ${expected.length}`,
  );

  for (const expectedNode of expected) {
    const actualNode = actual.find((node) => node.id === expectedNode.id);
    assertOrThrow(Boolean(actualNode), `${label} 缺少节点 ${expectedNode.id}`);
    assertOrThrow(
      actualNode.x === expectedNode.x &&
        actualNode.y === expectedNode.y &&
        actualNode.width === expectedNode.width &&
        actualNode.height === expectedNode.height &&
        actualNode.rotation === expectedNode.rotation,
      `${label} 节点 ${expectedNode.id} 几何异常：${JSON.stringify(actualNode)} !== ${JSON.stringify(expectedNode)}`,
    );
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
  targetRotation: TARGET_ROTATION,
  dragDelta: DRAG_DELTA,
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

  logStep("seed two rect nodes");
  const scenario = await seedRotateScenario(page);
  await waitForSaved(page);

  logStep("select both nodes");
  await setSelection(page, scenario.slideId, scenario.nodeIds);
  await page.waitForFunction((expectedNodeIds) => {
    const selectedNodeIds = window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.selection?.nodeIds ?? [];
    return (
      selectedNodeIds.length === expectedNodeIds.length &&
      expectedNodeIds.every((nodeId) => selectedNodeIds.includes(nodeId))
    );
  }, scenario.nodeIds);

  logStep("rotate active selection");
  const rotatedGeometries = await rotateActiveSelection(page, {
    slideId: scenario.slideId,
    nodeIds: scenario.nodeIds,
    rotation: TARGET_ROTATION,
  });
  await waitForSaved(page);

  assertOrThrow(
    rotatedGeometries.length === scenario.nodeIds.length,
    `批量旋转后返回节点数量异常：${rotatedGeometries.length}`,
  );
  assertOrThrow(
    rotatedGeometries.every((node) => node.rotation === TARGET_ROTATION),
    `批量旋转后仍存在未回写目标角度的节点：${JSON.stringify(rotatedGeometries)}`,
  );

  const persistedProjectAfterRotate = await readPersistedProject(page, projectId);
  const persistedRotatedGeometries = scenario.nodeIds
    .map((nodeId) => readPersistedNodeGeometry(persistedProjectAfterRotate, nodeId))
    .filter((node) => Boolean(node));
  assertNodeGeometriesEqual(
    persistedRotatedGeometries,
    rotatedGeometries,
    "批量旋转后的持久化结果",
  );

  summary.checks.push({
    id: "after-rotate",
    rotatedGeometries,
    persistedRotatedGeometries,
  });

  logStep("drag primary node after rotation");
  const primaryGeometryAfterRotate = rotatedGeometries.find((node) => node.id === PRIMARY_RECT.id);
  assertOrThrow(Boolean(primaryGeometryAfterRotate), "批量旋转后未找到主卡片几何。");
  await dragSingleNode(page, {
    nodeId: PRIMARY_RECT.id,
    left: primaryGeometryAfterRotate.x + DRAG_DELTA.x,
    top: primaryGeometryAfterRotate.y + DRAG_DELTA.y,
  });
  await waitForSaved(page);

  const geometriesAfterDrag = await readCurrentNodeGeometries(page, scenario.nodeIds);
  const secondaryGeometryAfterRotate = rotatedGeometries.find(
    (node) => node.id === SECONDARY_RECT.id,
  );
  const expectedGeometriesAfterDrag = rotatedGeometries.map((node) =>
    node.id === PRIMARY_RECT.id
      ? {
          ...node,
          x: node.x + DRAG_DELTA.x,
          y: node.y + DRAG_DELTA.y,
        }
      : node,
  );

  assertNodeGeometriesEqual(
    geometriesAfterDrag,
    expectedGeometriesAfterDrag,
    "旋转后拖拽单节点的标准快照",
  );
  assertOrThrow(
    secondaryGeometryAfterRotate &&
      geometriesAfterDrag.find((node) => node.id === SECONDARY_RECT.id)?.rotation ===
        secondaryGeometryAfterRotate.rotation,
    `拖拽后副卡片旋转角度被意外回退：${JSON.stringify(geometriesAfterDrag)}`,
  );

  const persistedProjectAfterDrag = await readPersistedProject(page, projectId);
  const persistedGeometriesAfterDrag = scenario.nodeIds
    .map((nodeId) => readPersistedNodeGeometry(persistedProjectAfterDrag, nodeId))
    .filter((node) => Boolean(node));
  assertNodeGeometriesEqual(
    persistedGeometriesAfterDrag,
    expectedGeometriesAfterDrag,
    "旋转后拖拽单节点的持久化结果",
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-drag.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "after-drag",
    expectedGeometriesAfterDrag,
    geometriesAfterDrag,
    persistedGeometriesAfterDrag,
  });

  logStep("reload page and verify persisted geometry");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
  await waitForSaved(page);

  const reloadedGeometries = await readCurrentNodeGeometries(page, scenario.nodeIds);
  assertNodeGeometriesEqual(
    reloadedGeometries,
    expectedGeometriesAfterDrag,
    "刷新恢复后的标准快照",
  );

  summary.checks.push({
    id: "after-reload",
    reloadedGeometries,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
    fullPage: true,
  });

  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("BUG-VNEXT38-01 回归过程中出现控制台或运行时错误。");
  }
} finally {
  await browser.close();
}
