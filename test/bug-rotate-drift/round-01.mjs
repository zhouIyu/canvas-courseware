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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-15-bug-rotate-drift-round-01");

/** 合成旋转后期望保留的角度。 */
const TARGET_ROTATION = 33;

/** 合成旋转后 Fabric 同步回来的位移。 */
const TARGET_TRANSLATION = {
  x: 46,
  y: 28,
};

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[bug-rotate-drift-test]", label);
}

/**
 * 从项目记录中提取当前首页的第一个矩形节点。
 *
 * @param {any | null} project
 * @returns {any | null}
 */
function readFirstRectNode(project) {
  return project?.document?.slides?.[0]?.nodes?.find((node) => node.type === "rect") ?? null;
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
 * 从编辑器调试桥读取指定节点当前几何。
 *
 * @param {import("playwright").Page} page
 * @param {string} nodeId
 * @returns {Promise<{ x: number; y: number; width: number; height: number; rotation: number; } | null>}
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
      rotation: targetNode.rotation,
    };
  }, nodeId);
}

/**
 * 通过调试桥模拟一次“Fabric 已经把旋转后的 left/top/angle 算好”的结束态，
 * 用来稳定覆盖旋转结束后只持久化角度、遗漏 x/y 的回归。
 *
 * @param {import("playwright").Page} page
 * @param {{ nodeId: string; x: number; y: number; rotation: number; }} nextGeometry
 * @returns {Promise<{
 *   preservedObjectIdentity: boolean;
 *   preservedSingleSelection: boolean;
 *   activeNodeId: string | null;
 * }>}
 */
async function rotateNodeWithSyntheticModification(page, nextGeometry) {
  return page.evaluate((payload) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    const canvas = debugBridge?.getCanvas?.();
    if (!canvas) {
      throw new Error("编辑器调试桥尚未就绪，无法执行合成旋转。");
    }

    const target = canvas.getObjects().find((object) => {
      return object?.__coursewareNodeMeta?.nodeId === payload.nodeId;
    });
    if (!target) {
      throw new Error(`未找到待旋转节点 ${payload.nodeId}`);
    }

    canvas.setActiveObject(target);
    target.set({
      left: payload.x,
      top: payload.y,
      angle: payload.rotation,
    });
    target.setCoords?.();

    canvas.fire("object:rotating", { target });
    canvas.fire("object:modified", {
      target,
      action: "rotate",
    });
    canvas.fire("mouse:up", {});

    const currentTarget = canvas.getObjects().find((object) => {
      return object?.__coursewareNodeMeta?.nodeId === payload.nodeId;
    });
    const activeObject = canvas.getActiveObject?.();
    const activeNodeId = activeObject?.__coursewareNodeMeta?.nodeId ?? null;

    return {
      preservedObjectIdentity: currentTarget === target,
      preservedSingleSelection: canvas.getActiveObjects().length === 1 && activeObject === target,
      activeNodeId,
    };
  }, nextGeometry);
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
  targetTranslation: TARGET_TRANSLATION,
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

  logStep("insert rect node");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
  await waitForSaved(page);

  const projectAfterInsert = await readPersistedProject(page, projectId);
  const insertedRectNode = readFirstRectNode(projectAfterInsert);
  if (!insertedRectNode) {
    throw new Error("插入矩形后未读取到目标节点，无法继续验证旋转回写。");
  }

  const expectedGeometry = {
    nodeId: insertedRectNode.id,
    x: insertedRectNode.x + TARGET_TRANSLATION.x,
    y: insertedRectNode.y + TARGET_TRANSLATION.y,
    rotation: TARGET_ROTATION,
  };

  summary.checks.push({
    id: "before-rotate",
    geometry: {
      x: insertedRectNode.x,
      y: insertedRectNode.y,
      width: insertedRectNode.width,
      height: insertedRectNode.height,
      rotation: insertedRectNode.rotation,
    },
  });

  logStep("apply synthetic rotate modification");
  const rotateRuntimeState = await rotateNodeWithSyntheticModification(page, expectedGeometry);
  await page.waitForFunction(({ nodeId, x, y, rotation }) => {
    const snapshot = window.__CW_EDITOR_DEBUG__?.getSnapshot?.();
    const activeSlide = snapshot?.document?.slides?.find(
      (slide) => slide.id === snapshot?.activeSlideId,
    );
    const targetNode = activeSlide?.nodes?.find((node) => node.id === nodeId);
    return (
      targetNode?.x === x &&
      targetNode?.y === y &&
      targetNode?.rotation === rotation
    );
  }, expectedGeometry);
  await waitForSaved(page);

  const geometryAfterRotate = await readCurrentNodeGeometry(page, insertedRectNode.id);
  const projectAfterRotate = await readPersistedProject(page, projectId);
  const persistedRectAfterRotate = readFirstRectNode(projectAfterRotate);

  summary.checks.push({
    id: "after-rotate",
    expectedGeometry,
    rotateRuntimeState,
    snapshotGeometry: geometryAfterRotate,
    persistedGeometry: persistedRectAfterRotate
      ? {
          x: persistedRectAfterRotate.x,
          y: persistedRectAfterRotate.y,
          width: persistedRectAfterRotate.width,
          height: persistedRectAfterRotate.height,
          rotation: persistedRectAfterRotate.rotation,
        }
      : null,
  });

  if (!geometryAfterRotate) {
    throw new Error("旋转后未能从编辑器快照中读取到目标节点几何信息。");
  }

  if (
    geometryAfterRotate.x !== expectedGeometry.x ||
    geometryAfterRotate.y !== expectedGeometry.y ||
    geometryAfterRotate.rotation !== expectedGeometry.rotation
  ) {
    throw new Error(
      `旋转后编辑器快照几何异常：${JSON.stringify(geometryAfterRotate)}`,
    );
  }

  if (!rotateRuntimeState.preservedObjectIdentity) {
    throw new Error("旋转结束后 Fabric 对象被重建，当前回归未保住原地同步链路。");
  }

  if (
    !rotateRuntimeState.preservedSingleSelection ||
    rotateRuntimeState.activeNodeId !== insertedRectNode.id
  ) {
    throw new Error(
      `旋转结束后当前单选态未稳定保留：${JSON.stringify(rotateRuntimeState)}`,
    );
  }

  if (!persistedRectAfterRotate) {
    throw new Error("旋转后未能从本地持久化记录中读取到矩形节点。");
  }

  if (
    persistedRectAfterRotate.x !== expectedGeometry.x ||
    persistedRectAfterRotate.y !== expectedGeometry.y ||
    persistedRectAfterRotate.rotation !== expectedGeometry.rotation
  ) {
    throw new Error(
      `旋转后持久化几何异常：${JSON.stringify({
        x: persistedRectAfterRotate.x,
        y: persistedRectAfterRotate.y,
        rotation: persistedRectAfterRotate.rotation,
      })}`,
    );
  }

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-rotate-before-reload.png"),
    fullPage: true,
  });

  logStep("reload workspace");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
  await waitForSaved(page);

  const geometryAfterReload = await readCurrentNodeGeometry(page, insertedRectNode.id);
  const projectAfterReload = await readPersistedProject(page, projectId);
  const reloadedRectNode = readFirstRectNode(projectAfterReload);

  summary.checks.push({
    id: "after-reload",
    expectedGeometry,
    snapshotGeometry: geometryAfterReload,
    persistedGeometry: reloadedRectNode
      ? {
          x: reloadedRectNode.x,
          y: reloadedRectNode.y,
          width: reloadedRectNode.width,
          height: reloadedRectNode.height,
          rotation: reloadedRectNode.rotation,
        }
      : null,
  });

  if (!geometryAfterReload) {
    throw new Error("刷新后未能从编辑器快照中读取到目标节点几何信息。");
  }

  if (
    geometryAfterReload.x !== expectedGeometry.x ||
    geometryAfterReload.y !== expectedGeometry.y ||
    geometryAfterReload.rotation !== expectedGeometry.rotation
  ) {
    throw new Error(
      `刷新后编辑器快照几何异常：${JSON.stringify(geometryAfterReload)}`,
    );
  }

  if (!reloadedRectNode) {
    throw new Error("刷新后未能从本地持久化记录中读取到矩形节点。");
  }

  if (
    reloadedRectNode.x !== expectedGeometry.x ||
    reloadedRectNode.y !== expectedGeometry.y ||
    reloadedRectNode.rotation !== expectedGeometry.rotation
  ) {
    throw new Error(
      `刷新后持久化几何异常：${JSON.stringify({
        x: reloadedRectNode.x,
        y: reloadedRectNode.y,
        rotation: reloadedRectNode.rotation,
      })}`,
    );
  }

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
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
