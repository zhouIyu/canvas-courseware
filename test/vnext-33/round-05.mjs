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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-15-vnext-33-e-round-01");

/** 吸附断言允许的浮点误差。 */
const SNAP_TOLERANCE = 1.2;

/** 参考线坐标断言允许的误差。 */
const GUIDE_LINE_TOLERANCE = 1;

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext33-e-test]", label);
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
function nearlyEqual(actual, expected, tolerance = SNAP_TOLERANCE) {
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
 * 读取目标项目首页中的矩形节点列表。
 *
 * @param {any | null} project
 * @returns {any[]}
 */
function readRectNodes(project) {
  return project?.document?.slides?.[0]?.nodes?.filter((node) => node.type === "rect") ?? [];
}

/**
 * 读取当前画布中正在显示的对齐参考线。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Array<{ orientation: string; x1: number | null; y1: number | null; x2: number | null; y2: number | null; visible: boolean; }>>}
 */
async function readAlignmentGuides(page) {
  return page.evaluate(() => {
    const canvas = window.__CW_EDITOR_DEBUG__?.getCanvas?.();
    if (!canvas) {
      return [];
    }

    return canvas
      .getObjects()
      .map((object) => {
        const orientation = object.__coursewareAlignmentGuide;
        if (orientation !== "vertical" && orientation !== "horizontal") {
          return null;
        }

        return {
          orientation,
          x1: typeof object.x1 === "number" ? object.x1 : null,
          y1: typeof object.y1 === "number" ? object.y1 : null,
          x2: typeof object.x2 === "number" ? object.x2 : null,
          y2: typeof object.y2 === "number" ? object.y2 : null,
          visible: object.visible !== false,
        };
      })
      .filter((guide) => Boolean(guide));
  });
}

/**
 * 判断指定方向上是否存在命中目标坐标的对齐参考线。
 *
 * @param {Array<{ orientation: string; x1: number | null; y1: number | null; visible: boolean; }>} guides
 * @param {"vertical" | "horizontal"} orientation
 * @param {number} expectedPosition
 * @returns {boolean}
 */
function hasGuideAt(guides, orientation, expectedPosition) {
  return guides.some((guide) => {
    if (!guide.visible || guide.orientation !== orientation) {
      return false;
    }

    const position = orientation === "vertical" ? guide.x1 : guide.y1;
    return typeof position === "number" &&
      Math.abs(position - expectedPosition) <= GUIDE_LINE_TOLERANCE;
  });
}

/**
 * 通过调试桥触发一次合成拖拽，并在落盘前捕获参考线状态。
 *
 * @param {import("playwright").Page} page
 * @param {string} nodeId
 * @param {{ left: number; top: number; }} nextPosition
 * @returns {Promise<Array<{ orientation: string; x1: number | null; y1: number | null; x2: number | null; y2: number | null; visible: boolean; }>>}
 */
async function moveNodeWithSyntheticDrag(page, nodeId, nextPosition) {
  const guides = await page.evaluate((payload) => {
    const canvas = window.__CW_EDITOR_DEBUG__?.getCanvas?.();
    if (!canvas) {
      return null;
    }

    const target = canvas.getObjects().find((object) => {
      return object?.__coursewareNodeMeta?.nodeId === payload.nodeId;
    });
    if (!target) {
      return null;
    }

    target.set({
      left: payload.nextPosition.left,
      top: payload.nextPosition.top,
    });
    target.setCoords?.();

    canvas.fire("object:moving", { target });
    const guidesDuringDrag = canvas
      .getObjects()
      .map((object) => {
        const orientation = object.__coursewareAlignmentGuide;
        if (orientation !== "vertical" && orientation !== "horizontal") {
          return null;
        }

        return {
          orientation,
          x1: typeof object.x1 === "number" ? object.x1 : null,
          y1: typeof object.y1 === "number" ? object.y1 : null,
          x2: typeof object.x2 === "number" ? object.x2 : null,
          y2: typeof object.y2 === "number" ? object.y2 : null,
          visible: object.visible !== false,
        };
      })
      .filter((guide) => Boolean(guide));

    canvas.fire("object:modified", {
      target,
      action: "drag",
    });
    canvas.fire("mouse:up", {});

    return guidesDuringDrag;
  }, {
    nodeId,
    nextPosition,
  });

  assertOrThrow(Boolean(guides), `未找到待拖拽节点 ${nodeId}，无法执行吸附测试。`);
  return guides;
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

  logStep("insert two rectangles for snapping tests");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
  await waitForSaved(page);
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
  await waitForSaved(page);

  const projectAfterInsert = await readPersistedProject(page, projectId);
  const insertedRects = readRectNodes(projectAfterInsert);
  assertOrThrow(insertedRects.length >= 2, "插入矩形后节点数量不足，无法执行吸附测试。");

  let referenceRectNode = insertedRects[0];
  let movingRectNode = insertedRects[1];
  const canvasWidth = projectAfterInsert?.document?.slides?.[0]?.size?.width ?? 1280;
  const canvasHeight = projectAfterInsert?.document?.slides?.[0]?.size?.height ?? 720;

  logStep("position reference rectangle away from canvas center");
  await moveNodeWithSyntheticDrag(page, referenceRectNode.id, {
    left: 80,
    top: 80,
  });
  await waitForSaved(page);

  logStep("prepare baseline position for moving rectangle");
  await moveNodeWithSyntheticDrag(page, movingRectNode.id, {
    left: canvasWidth * 0.72,
    top: canvasHeight * 0.6,
  });
  await waitForSaved(page);

  const projectAfterBaselineMove = await readPersistedProject(page, projectId);
  referenceRectNode = readRectNodes(projectAfterBaselineMove).find(
    (node) => node.id === referenceRectNode.id,
  );
  movingRectNode = readRectNodes(projectAfterBaselineMove).find(
    (node) => node.id === movingRectNode.id,
  );
  assertOrThrow(Boolean(referenceRectNode) && Boolean(movingRectNode), "基线移动后未找到测试矩形。");

  logStep("verify canvas center snapping with guide feedback");
  const centerGuides = await moveNodeWithSyntheticDrag(page, movingRectNode.id, {
    left: canvasWidth / 2 - movingRectNode.width / 2 + 3,
    top: canvasHeight / 2 - movingRectNode.height / 2 + 3,
  });
  await waitForSaved(page);

  const projectAfterCenterSnap = await readPersistedProject(page, projectId);
  movingRectNode = readRectNodes(projectAfterCenterSnap).find((node) => node.id === movingRectNode.id);
  assertOrThrow(Boolean(movingRectNode), "画布中心吸附后未找到目标矩形节点。");

  const centerXAfterSnap = movingRectNode.x + movingRectNode.width / 2;
  const centerYAfterSnap = movingRectNode.y + movingRectNode.height / 2;
  assertOrThrow(
    nearlyEqual(centerXAfterSnap, canvasWidth / 2),
    `画布中心吸附失败：X 中心期望 ${canvasWidth / 2}，实际 ${centerXAfterSnap}`,
  );
  assertOrThrow(
    nearlyEqual(centerYAfterSnap, canvasHeight / 2),
    `画布中心吸附失败：Y 中心期望 ${canvasHeight / 2}，实际 ${centerYAfterSnap}`,
  );
  assertOrThrow(
    hasGuideAt(centerGuides, "vertical", canvasWidth / 2),
    "画布中心吸附时未检测到竖向参考线反馈。",
  );
  assertOrThrow(
    hasGuideAt(centerGuides, "horizontal", canvasHeight / 2),
    "画布中心吸附时未检测到横向参考线反馈。",
  );

  summary.checks.push({
    id: "canvas-center-snap",
    snappedCenterX: centerXAfterSnap,
    snappedCenterY: centerYAfterSnap,
    guideCountDuringDrag: centerGuides.length,
  });

  logStep("verify canvas edge snapping with guide feedback");
  const edgeGuides = await moveNodeWithSyntheticDrag(page, movingRectNode.id, {
    left: 2,
    top: movingRectNode.y,
  });
  await waitForSaved(page);

  const projectAfterEdgeSnap = await readPersistedProject(page, projectId);
  movingRectNode = readRectNodes(projectAfterEdgeSnap).find((node) => node.id === movingRectNode.id);
  assertOrThrow(Boolean(movingRectNode), "画布边缘吸附后未找到目标矩形节点。");
  assertOrThrow(
    nearlyEqual(movingRectNode.x, 0),
    `画布左边缘吸附失败：期望 X=0，实际 ${movingRectNode.x}`,
  );
  assertOrThrow(
    hasGuideAt(edgeGuides, "vertical", 0),
    "画布边缘吸附时未检测到竖向参考线反馈。",
  );

  summary.checks.push({
    id: "canvas-edge-snap",
    snappedLeft: movingRectNode.x,
    guideCountDuringDrag: edgeGuides.length,
  });

  logStep("verify neighboring object snapping with guide feedback");
  const referenceRight = referenceRectNode.x + referenceRectNode.width;
  const neighborGuides = await moveNodeWithSyntheticDrag(page, movingRectNode.id, {
    left: referenceRight + 4,
    top: movingRectNode.y,
  });
  await waitForSaved(page);

  const projectAfterNeighborSnap = await readPersistedProject(page, projectId);
  movingRectNode = readRectNodes(projectAfterNeighborSnap).find(
    (node) => node.id === movingRectNode.id,
  );
  assertOrThrow(Boolean(movingRectNode), "相邻对象吸附后未找到目标矩形节点。");
  assertOrThrow(
    nearlyEqual(movingRectNode.x, referenceRight),
    `相邻对象吸附失败：期望 X=${referenceRight}，实际 ${movingRectNode.x}`,
  );
  assertOrThrow(
    hasGuideAt(neighborGuides, "vertical", referenceRight),
    "相邻对象吸附时未检测到竖向参考线反馈。",
  );

  summary.checks.push({
    id: "neighbor-snap",
    referenceRight,
    snappedLeft: movingRectNode.x,
    guideCountDuringDrag: neighborGuides.length,
  });

  logStep("verify guides are cleaned after drag end");
  const guidesAfterDrag = await readAlignmentGuides(page);
  assertOrThrow(guidesAfterDrag.length === 0, "拖拽结束后仍存在残留对齐参考线。");
  summary.checks.push({
    id: "guide-cleanup",
    guideCountAfterDrag: guidesAfterDrag.length,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-snapping.png"),
    fullPage: true,
  });

  summary.status = "passed";
} catch (error) {
  summary.status = "failed";
  summary.error = error instanceof Error ? error.message : String(error);
  summary.stack = error instanceof Error ? error.stack : undefined;
} finally {
  await page.screenshot({
    path: path.join(ASSET_DIR, "final-state.png"),
    fullPage: true,
  });

  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}

if (summary.status !== "passed") {
  throw new Error(summary.error ?? "VNext-33-E 测试失败");
}
