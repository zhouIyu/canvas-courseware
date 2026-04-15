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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-15-vnext-33-b-round-01");

/** 本轮拖拽在画布本地坐标系中的横向位移。 */
const DRAG_DELTA_X = 180;

/** 本轮拖拽在画布本地坐标系中的纵向位移。 */
const DRAG_DELTA_Y = 110;

/** 自动保存稳定窗口检查点，需覆盖默认 800ms 自动保存延时。 */
const AUTOSAVE_COOLDOWN_CHECK_MS = 900;

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext33-b-test]", label);
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
 * 从项目记录中提取当前首页的全部矩形节点。
 *
 * @param {any} project
 * @returns {any[]}
 */
function readRectNodes(project) {
  return project?.document?.slides?.[0]?.nodes?.filter((node) => node.type === "rect") ?? [];
}

/**
 * 读取顶部保存状态标签文案。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function readSaveStatusLabel(page) {
  const label = await page.locator(".save-inline-meta .arco-tag").innerText();
  return label.trim();
}

/**
 * 读取开发态最近日志桥接中的日志条目。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<any[]>}
 */
async function readDiagnosticEntries(page) {
  return page.evaluate(() => window.__CW_DIAGNOSTICS__.getEntries());
}

/**
 * 根据节点 id 读取编辑器当前快照中的几何信息。
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
 * 把画布本地坐标换算成当前视口中的点击点。
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
 * 拖拽指定矩形节点，触发一次真实的 Fabric 对象平移。
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
    steps: 18,
  });
  await page.mouse.up();
}

/**
 * 在日志列表中查找指定事件。
 *
 * @param {any[]} entries
 * @param {string} eventName
 * @returns {any | null}
 */
function findEvent(entries, eventName) {
  return entries.find((entry) => entry.event === eventName) ?? null;
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
  cooldownCheckMs: AUTOSAVE_COOLDOWN_CHECK_MS,
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
  await page.waitForFunction(() =>
    Boolean(window.__CW_EDITOR_DEBUG__) && Boolean(window.__CW_DIAGNOSTICS__),
  );
  await waitForSaved(page);

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";

  logStep("insert rect node from toolbar");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
  await waitForSaved(page);

  const projectAfterInsert = await readPersistedProject(page, projectId);
  const insertedRectNode = readRectNodes(projectAfterInsert)[0] ?? null;

  if (!insertedRectNode) {
    throw new Error("未能读取到刚插入的矩形节点，无法继续执行拖拽验证。");
  }

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

  logStep("clear diagnostics before drag");
  await page.evaluate(() => {
    window.__CW_DIAGNOSTICS__.clear();
  });

  logStep("drag rect node");
  await dragRectNode(page, insertedRectNode);

  const geometryAfterDrag = await readCurrentNodeGeometry(page, insertedRectNode.id);
  if (!geometryAfterDrag) {
    throw new Error("拖拽后未能从编辑器快照中读取到矩形节点几何信息。");
  }

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-drag-before-autosave.png"),
    fullPage: true,
  });

  logStep("inspect autosave state during cooldown");
  await page.waitForTimeout(AUTOSAVE_COOLDOWN_CHECK_MS);
  const saveStatusDuringCooldown = await readSaveStatusLabel(page);
  const projectDuringCooldown = await readPersistedProject(page, projectId);
  const persistedRectDuringCooldown = readRectNodes(projectDuringCooldown)[0] ?? null;
  const diagnosticEntriesDuringCooldown = await readDiagnosticEntries(page);
  const autosaveDeferredEntry = findEvent(diagnosticEntriesDuringCooldown, "project.autosave.deferred");
  const autosaveStartedEntryDuringCooldown = findEvent(
    diagnosticEntriesDuringCooldown,
    "project.save.started",
  );

  summary.checks.push({
    id: "autosave-cooldown",
    saveStatusDuringCooldown,
    geometryAfterDrag,
    persistedGeometryDuringCooldown: persistedRectDuringCooldown
      ? {
          x: persistedRectDuringCooldown.x,
          y: persistedRectDuringCooldown.y,
          width: persistedRectDuringCooldown.width,
          height: persistedRectDuringCooldown.height,
        }
      : null,
    eventsDuringCooldown: diagnosticEntriesDuringCooldown.map((entry) => ({
      event: entry.event,
      reason: entry.context?.reason ?? null,
      trigger: entry.context?.trigger ?? null,
    })),
  });

  logStep("wait for deferred autosave completion");
  await waitForSaved(page);
  const projectAfterAutoSave = await readPersistedProject(page, projectId);
  const persistedRectAfterAutoSave = readRectNodes(projectAfterAutoSave)[0] ?? null;
  const diagnosticEntriesAfterAutoSave = await readDiagnosticEntries(page);
  const autosaveCompletedEntry = findEvent(diagnosticEntriesAfterAutoSave, "project.save.completed");

  summary.checks.push({
    id: "autosave-completed",
    persistedGeometryAfterAutoSave: persistedRectAfterAutoSave
      ? {
          x: persistedRectAfterAutoSave.x,
          y: persistedRectAfterAutoSave.y,
          width: persistedRectAfterAutoSave.width,
          height: persistedRectAfterAutoSave.height,
        }
      : null,
    autosaveCompletedEntry,
  });

  logStep("reload and verify persistence");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);
  const projectAfterReload = await readPersistedProject(page, projectId);
  const reloadedRectNode = readRectNodes(projectAfterReload)[0] ?? null;

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "reload-restore",
    reloadedGeometry: reloadedRectNode
      ? {
          x: reloadedRectNode.x,
          y: reloadedRectNode.y,
          width: reloadedRectNode.width,
          height: reloadedRectNode.height,
        }
      : null,
  });

  if (geometryAfterDrag.x === insertedRectNode.x && geometryAfterDrag.y === insertedRectNode.y) {
    throw new Error("矩形节点拖拽后位置未变化，未能触发有效的拖拽链路。");
  }

  if (saveStatusDuringCooldown !== "未保存") {
    throw new Error(
      `拖拽后的稳定窗口内应保持“未保存”，当前顶部状态为 ${saveStatusDuringCooldown}`,
    );
  }

  if (
    !persistedRectDuringCooldown ||
    persistedRectDuringCooldown.x !== insertedRectNode.x ||
    persistedRectDuringCooldown.y !== insertedRectNode.y
  ) {
    throw new Error("拖拽后的稳定窗口内不应提前把新位置写入本地持久化。");
  }

  if (!autosaveDeferredEntry) {
    throw new Error("拖拽后的自动保存未记录 deferred 日志。");
  }

  if (autosaveDeferredEntry.context?.reason !== "canvas-transform") {
    throw new Error(
      `拖拽后的 deferred 日志应记录 canvas-transform，当前为 ${autosaveDeferredEntry.context?.reason ?? "null"}`,
    );
  }

  if (autosaveStartedEntryDuringCooldown) {
    throw new Error("拖拽稳定窗口尚未结束前，不应已经开始执行自动保存。");
  }

  if (!persistedRectAfterAutoSave) {
    throw new Error("自动保存完成后未能读取到矩形节点的持久化结果。");
  }

  if (
    persistedRectAfterAutoSave.x !== geometryAfterDrag.x ||
    persistedRectAfterAutoSave.y !== geometryAfterDrag.y
  ) {
    throw new Error("拖拽后的最终持久化位置与编辑器当前几何不一致。");
  }

  if (autosaveCompletedEntry?.context?.trigger !== "auto") {
    throw new Error("拖拽后的自动保存完成日志未记录 trigger=auto。");
  }

  if (
    !reloadedRectNode ||
    reloadedRectNode.x !== geometryAfterDrag.x ||
    reloadedRectNode.y !== geometryAfterDrag.y
  ) {
    throw new Error("刷新后矩形节点位置恢复异常，拖拽结果未被正确保留。");
  }

  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error("页面存在控制台错误或运行时错误，详见测试结果摘要。");
  }

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
} catch (error) {
  summary.failure = String(error);
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  throw error;
} finally {
  await page.close();
  await browser.close();
}
