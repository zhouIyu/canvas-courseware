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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-15-bug-editor-visible-after-drag-round-01");

/** 合成拖拽位移。 */
const DRAG_DELTA = {
  x: 84,
  y: 52,
};

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[bug-editor-visible-after-drag-test]", label);
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
 * 读取当前项目首页中的首个矩形节点。
 *
 * @param {any | null} project
 * @returns {any | null}
 */
function readFirstRectNode(project) {
  return project?.document?.slides?.[0]?.nodes?.find((node) => node.type === "rect") ?? null;
}

/**
 * 通过调试桥把当前矩形节点改成 `visible=false`，模拟“预览态默认隐藏，但编辑态应全显”的真实文档状态。
 *
 * @param {import("playwright").Page} page
 * @param {string} slideId
 * @param {string} nodeId
 * @returns {Promise<void>}
 */
async function setNodeInitiallyHidden(page, slideId, nodeId) {
  await page.evaluate(({ currentSlideId, currentNodeId }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法写入隐藏节点状态。");
    }

    const controller = debugBridge.getController();
    const commandTypes = debugBridge.getCommandTypes();
    controller.execute({
      type: commandTypes.NODE_UPDATE,
      slideId: currentSlideId,
      nodeId: currentNodeId,
      patch: {
        visible: false,
      },
    });
  }, {
    currentSlideId: slideId,
    currentNodeId: nodeId,
  });
}

/**
 * 读取当前编辑画布中指定节点的运行时状态。
 *
 * @param {import("playwright").Page} page
 * @param {string} nodeId
 * @returns {Promise<{ visible: boolean | null; left: number | null; top: number | null; activeNodeId: string | null; } | null>}
 */
async function readCanvasNodeState(page, nodeId) {
  return page.evaluate((targetNodeId) => {
    const canvas = window.__CW_EDITOR_DEBUG__?.getCanvas?.();
    if (!canvas) {
      return null;
    }

    const target = canvas.getObjects().find((object) => {
      return object?.__coursewareNodeMeta?.nodeId === targetNodeId;
    });
    const activeObject = canvas.getActiveObject?.();

    return target
      ? {
          visible: target.visible ?? null,
          left: typeof target.left === "number" ? target.left : null,
          top: typeof target.top === "number" ? target.top : null,
          activeNodeId: activeObject?.__coursewareNodeMeta?.nodeId ?? null,
        }
      : null;
  }, nodeId);
}

/**
 * 通过调试桥触发一次合成拖拽，验证原地同步后编辑画布里的隐藏节点不会被重新隐藏。
 *
 * @param {import("playwright").Page} page
 * @param {{ nodeId: string; left: number; top: number; }} nextPosition
 * @returns {Promise<{ visible: boolean | null; left: number | null; top: number | null; activeNodeId: string | null; } | null>}
 */
async function moveNodeWithSyntheticDrag(page, nextPosition) {
  return page.evaluate((payload) => {
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

    canvas.setActiveObject(target);
    target.set({
      left: payload.left,
      top: payload.top,
    });
    target.setCoords?.();

    canvas.fire("object:moving", { target });
    canvas.fire("object:modified", {
      target,
      action: "drag",
    });
    canvas.fire("mouse:up", {});

    const currentTarget = canvas.getObjects().find((object) => {
      return object?.__coursewareNodeMeta?.nodeId === payload.nodeId;
    });
    const activeObject = canvas.getActiveObject?.();

    return currentTarget
      ? {
          visible: currentTarget.visible ?? null,
          left: typeof currentTarget.left === "number" ? currentTarget.left : null,
          top: typeof currentTarget.top === "number" ? currentTarget.top : null,
          activeNodeId: activeObject?.__coursewareNodeMeta?.nodeId ?? null,
        }
      : null;
  }, nextPosition);
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
  const activeSlideId = await page.evaluate(
    () => window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.activeSlideId ?? null,
  );

  logStep("insert rect node");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
  await waitForSaved(page);

  const projectAfterInsert = await readPersistedProject(page, projectId);
  const insertedRectNode = readFirstRectNode(projectAfterInsert);
  if (!insertedRectNode || !activeSlideId) {
    throw new Error("插入矩形后未读取到目标节点或当前页面，无法继续验证。");
  }

  logStep("set rect node visible=false in document");
  await setNodeInitiallyHidden(page, activeSlideId, insertedRectNode.id);
  await waitForSaved(page);

  const canvasStateAfterHide = await readCanvasNodeState(page, insertedRectNode.id);
  const projectAfterHide = await readPersistedProject(page, projectId);
  const hiddenRectNode = readFirstRectNode(projectAfterHide);

  summary.checks.push({
    id: "after-hide-patch",
    canvasState: canvasStateAfterHide,
    persistedVisible: hiddenRectNode?.visible ?? null,
  });

  if (!hiddenRectNode || hiddenRectNode.visible !== false) {
    throw new Error("文档中的目标节点未成功写成 `visible=false`。");
  }

  if (!canvasStateAfterHide || canvasStateAfterHide.visible !== true) {
    throw new Error(
      `编辑态默认全显策略失效：写入 hidden 后画布对象可见性为 ${JSON.stringify(canvasStateAfterHide)}`,
    );
  }

  logStep("drag hidden rect in editor");
  const draggedRuntimeState = await moveNodeWithSyntheticDrag(page, {
    nodeId: insertedRectNode.id,
    left: insertedRectNode.x + DRAG_DELTA.x,
    top: insertedRectNode.y + DRAG_DELTA.y,
  });
  await waitForSaved(page);

  const canvasStateAfterDrag = await readCanvasNodeState(page, insertedRectNode.id);
  const projectAfterDrag = await readPersistedProject(page, projectId);
  const draggedRectNode = readFirstRectNode(projectAfterDrag);

  summary.checks.push({
    id: "after-drag",
    draggedRuntimeState,
    canvasState: canvasStateAfterDrag,
    persistedNode: draggedRectNode
      ? {
          x: draggedRectNode.x,
          y: draggedRectNode.y,
          visible: draggedRectNode.visible,
        }
      : null,
  });

  if (!draggedRectNode) {
    throw new Error("拖拽后未能从持久化项目中读取到目标矩形节点。");
  }

  if (draggedRectNode.visible !== false) {
    throw new Error(`拖拽后文档中的 visible 被意外改写：${draggedRectNode.visible}`);
  }

  if (
    draggedRectNode.x !== insertedRectNode.x + DRAG_DELTA.x ||
    draggedRectNode.y !== insertedRectNode.y + DRAG_DELTA.y
  ) {
    throw new Error(
      `拖拽后持久化位置异常：${JSON.stringify({
        x: draggedRectNode.x,
        y: draggedRectNode.y,
      })}`,
    );
  }

  if (!canvasStateAfterDrag || canvasStateAfterDrag.visible !== true) {
    throw new Error(
      `拖拽后编辑画布把 hidden 节点重新隐藏了：${JSON.stringify(canvasStateAfterDrag)}`,
    );
  }

  if (canvasStateAfterDrag.activeNodeId !== insertedRectNode.id) {
    throw new Error(
      `拖拽后当前单选态异常：${JSON.stringify(canvasStateAfterDrag)}`,
    );
  }

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-drag.png"),
    fullPage: true,
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(
      `自动化执行期间捕获到错误；console=${consoleErrors.length}, page=${pageErrors.length}`,
    );
  }

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
} finally {
  await browser.close();
}
