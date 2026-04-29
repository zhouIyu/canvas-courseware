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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-29-vnext-34-a-round-01");

/** 本轮拖拽在画布本地坐标系中的横向位移。 */
const DRAG_DELTA_X = 220;

/** 本轮拖拽在画布本地坐标系中的纵向位移。 */
const DRAG_DELTA_Y = 160;

/** 真实拖拽采样的步数，保证能跨过吸附阈值区间。 */
const DRAG_STEPS = 48;

/** 允许的最大回跳距离，超过说明拖拽出现明显抖动。 */
const MAX_BACKWARD_JITTER_PX = 1;

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext34-a-test]", label);
}

/**
 * 在条件失败时抛出更清晰的错误信息。
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
 * 从项目记录中提取首页的首个矩形节点。
 *
 * @param {any | null} project
 * @returns {any | null}
 */
function readFirstRectNode(project) {
  return project?.document?.slides?.[0]?.nodes?.find((node) => node.type === "rect") ?? null;
}

/**
 * 读取当前编辑器快照中的目标节点几何信息。
 *
 * @param {import("playwright").Page} page
 * @param {string} nodeId
 * @returns {Promise<{ x: number; y: number; width: number; height: number; } | null>}
 */
async function readCurrentNodeGeometry(page, nodeId) {
  return page.evaluate((targetNodeId) => {
    const snapshot = window.__CW_EDITOR_DEBUG__?.getSnapshot?.();
    const activeSlide = snapshot?.document?.slides?.find(
      (slide) => slide.id === snapshot?.activeSlideId,
    );
    const targetNode = activeSlide?.nodes?.find((node) => node.id === targetNodeId);
    if (!targetNode) {
      return null;
    }

    return {
      x: targetNode.x,
      y: targetNode.y,
      width: targetNode.width,
      height: targetNode.height,
    };
  }, nodeId);
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
 * 在页面内挂载拖拽采样器，记录每一帧 `object:moving` 的最新坐标。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function attachDragFrameCollector(page) {
  await page.evaluate(() => {
    const canvas = window.__CW_EDITOR_DEBUG__?.getCanvas?.();
    window.__dragFrames = [];
    window.__dragCleanup?.();

    const listener = (event) => {
      const target = event.target;
      if (!target) {
        return;
      }

      window.__dragFrames.push({
        left: target.left ?? null,
        top: target.top ?? null,
      });
    };

    canvas.on("object:moving", listener);
    window.__dragCleanup = () => canvas.off("object:moving", listener);
  });
}

/**
 * 读取页面内采集到的拖拽帧列表。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Array<{ left: number; top: number; }>>}
 */
async function readDragFrames(page) {
  return page.evaluate(() => window.__dragFrames ?? []);
}

/**
 * 触发一次真实鼠标拖拽，让矩形跨过吸附阈值区间。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} geometry
 * @returns {Promise<void>}
 */
async function dragRectNode(page, geometry) {
  const startLocalX = geometry.x + geometry.width / 2;
  const startLocalY = geometry.y + geometry.height / 2;
  const startPoint = await resolveCanvasViewportPoint(page, startLocalX, startLocalY);
  const endPoint = await resolveCanvasViewportPoint(
    page,
    startLocalX + DRAG_DELTA_X,
    startLocalY + DRAG_DELTA_Y,
  );

  await page.mouse.move(startPoint.x, startPoint.y);
  await page.mouse.down();
  await page.mouse.move(endPoint.x, endPoint.y, {
    steps: DRAG_STEPS,
  });
  await page.mouse.up();
}

/**
 * 统计本轮拖拽中的最大回跳距离。
 *
 * @param {Array<{ left: number; top: number; }>} frames
 * @returns {{ maxBackwardX: number; maxBackwardY: number; }}
 */
function resolveMaxBackwardJitter(frames) {
  let maxBackwardX = 0;
  let maxBackwardY = 0;

  for (let index = 1; index < frames.length; index += 1) {
    maxBackwardX = Math.max(maxBackwardX, frames[index - 1].left - frames[index].left);
    maxBackwardY = Math.max(maxBackwardY, frames[index - 1].top - frames[index].top);
  }

  return {
    maxBackwardX,
    maxBackwardY,
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
  dragDelta: {
    x: DRAG_DELTA_X,
    y: DRAG_DELTA_Y,
  },
  dragSteps: DRAG_STEPS,
  maxBackwardTolerance: MAX_BACKWARD_JITTER_PX,
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

  logStep("insert rect node from toolbar");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
  await waitForSaved(page);

  const projectAfterInsert = await readPersistedProject(page, projectId);
  const insertedRectNode = readFirstRectNode(projectAfterInsert);
  assertOrThrow(insertedRectNode, "未能读取到刚插入的矩形节点，无法继续执行拖拽验证。");

  summary.checks.push({
    id: "insert-rect",
    nodeId: insertedRectNode.id,
    geometry: {
      x: insertedRectNode.x,
      y: insertedRectNode.y,
      width: insertedRectNode.width,
      height: insertedRectNode.height,
    },
  });

  logStep("collect drag frames");
  await attachDragFrameCollector(page);

  logStep("drag rect node through snap zone");
  await dragRectNode(page, insertedRectNode);

  const dragFrames = await readDragFrames(page);
  assertOrThrow(dragFrames.length >= 12, `拖拽采样帧数不足：${dragFrames.length}`);

  const jitterSummary = resolveMaxBackwardJitter(dragFrames);
  assertOrThrow(
    jitterSummary.maxBackwardX <= MAX_BACKWARD_JITTER_PX,
    `横向拖拽仍存在明显回跳：最大回退 ${jitterSummary.maxBackwardX}px`,
  );
  assertOrThrow(
    jitterSummary.maxBackwardY <= MAX_BACKWARD_JITTER_PX,
    `纵向拖拽仍存在明显回跳：最大回退 ${jitterSummary.maxBackwardY}px`,
  );

  summary.checks.push({
    id: "drag-stability",
    frameCount: dragFrames.length,
    maxBackwardX: Number(jitterSummary.maxBackwardX.toFixed(3)),
    maxBackwardY: Number(jitterSummary.maxBackwardY.toFixed(3)),
    firstFrames: dragFrames.slice(0, 8),
    lastFrames: dragFrames.slice(-8),
  });

  const currentGeometry = await readCurrentNodeGeometry(page, insertedRectNode.id);
  assertOrThrow(currentGeometry, "拖拽后未能读取到编辑器快照中的矩形几何信息。");

  await page.screenshot({
    path: path.join(ASSET_DIR, "drag-stability-after-drop.png"),
    fullPage: true,
  });

  logStep("wait for autosave");
  await waitForSaved(page);

  const persistedProject = await readPersistedProject(page, projectId);
  const persistedRectNode = readFirstRectNode(persistedProject);
  assertOrThrow(persistedRectNode, "自动保存后未能读取到已持久化的矩形节点。");

  assertOrThrow(
    currentGeometry.x === persistedRectNode.x && currentGeometry.y === persistedRectNode.y,
    `拖拽后的持久化坐标与当前画布不一致：current=(${currentGeometry.x}, ${currentGeometry.y}), persisted=(${persistedRectNode.x}, ${persistedRectNode.y})`,
  );

  summary.checks.push({
    id: "autosave-persistence",
    currentGeometry,
    persistedGeometry: {
      x: persistedRectNode.x,
      y: persistedRectNode.y,
      width: persistedRectNode.width,
      height: persistedRectNode.height,
    },
  });

  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
} catch (error) {
  summary.failure = error instanceof Error ? error.message : String(error);
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  throw error;
} finally {
  await browser.close();
}
