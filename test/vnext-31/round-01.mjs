import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-10-vnext-31-round-01");

/** 测试写入的背景色。 */
const TARGET_BACKGROUND_FILL = "#FFF1F2";

/** 当前测试创建的时间轴步骤 id。 */
const TARGET_STEP_ID = "diagnostic-step-01";

/**
 * 打印当前测试阶段，方便定位失败步骤。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext31-test]", label);
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
 * 断言最近日志中存在指定事件。
 *
 * @param {any[]} entries
 * @param {string} eventName
 * @returns {any}
 */
function requireEvent(entries, eventName) {
  const targetEntry = entries.find((entry) => entry.event === eventName);
  if (!targetEntry) {
    throw new Error(`未找到诊断事件 ${eventName}`);
  }

  return targetEntry;
}

/**
 * 通过开发态编辑器桥执行一次标准命令。
 *
 * @param {import("playwright").Page} page
 * @param {any} command
 * @returns {Promise<void>}
 */
async function executeEditorCommand(page, command) {
  await page.evaluate((nextCommand) => {
    window.__CW_EDITOR_DEBUG__.getController().execute(nextCommand);
  }, command);
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
  targetBackgroundFill: TARGET_BACKGROUND_FILL,
  targetStepId: TARGET_STEP_ID,
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

  logStep("insert text node for timeline target");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);

  logStep("read current editor snapshot");
  const snapshot = await page.evaluate(() => window.__CW_EDITOR_DEBUG__.getSnapshot());
  const activeSlideId = snapshot?.activeSlideId ?? null;
  const firstNodeId = snapshot?.document?.slides?.[0]?.nodes?.[0]?.id ?? null;

  if (!activeSlideId || !firstNodeId) {
    throw new Error("未能在测试项目中读取到可用于日志验证的页面或文本节点");
  }

  summary.checks.push({
    id: "debug-bridges",
    hasEditorBridge: true,
    hasDiagnosticsBridge: true,
    activeSlideId,
    firstNodeId,
  });

  logStep("clear previous diagnostics");
  await page.evaluate(() => {
    window.__CW_DIAGNOSTICS__.clear();
  });

  logStep("execute background update command");
  await executeEditorCommand(page, {
    type: "slide.update",
    slideId: activeSlideId,
    patch: {
      background: {
        fill: TARGET_BACKGROUND_FILL,
        image: null,
      },
    },
  });

  logStep("execute timeline step upsert command");
  await executeEditorCommand(page, {
    type: "timeline.step.upsert",
    slideId: activeSlideId,
    step: {
      id: TARGET_STEP_ID,
      name: "诊断日志步骤",
      trigger: {
        type: "page-click",
      },
      actions: [
        {
          id: "diagnostic-action-01",
          type: "show-node",
          targetId: firstNodeId,
        },
      ],
    },
  });

  logStep("trigger autosave via title update");
  await page.getByLabel("项目标题").fill("诊断日志测试课件");
  await waitForSaved(page);

  logStep("read diagnostic entries");
  const diagnosticEntries = await readDiagnosticEntries(page);
  const backgroundEntry = requireEvent(diagnosticEntries, "background.write");
  const timelineEntry = requireEvent(diagnosticEntries, "timeline.changed");
  const autosaveScheduledEntry = requireEvent(diagnosticEntries, "project.autosave.scheduled");
  const saveCompletedEntry = requireEvent(diagnosticEntries, "project.save.completed");

  summary.checks.push({
    id: "diagnostic-events",
    entryCount: diagnosticEntries.length,
    events: diagnosticEntries.map((entry) => entry.event),
    backgroundEntry,
    timelineEntry,
    autosaveScheduledEntry,
    saveCompletedEntry,
  });

  if (backgroundEntry.context?.slideId !== activeSlideId) {
    throw new Error("背景写入日志缺少正确的 slideId 上下文");
  }

  if (timelineEntry.context?.stepId !== TARGET_STEP_ID) {
    throw new Error("时间轴日志缺少正确的 stepId 上下文");
  }

  if (saveCompletedEntry.context?.trigger !== "auto") {
    throw new Error("自动保存完成日志未记录正确的 trigger=auto");
  }

  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error("页面存在控制台错误或运行时错误，详见测试结果摘要");
  }

  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
} catch (error) {
  summary.failure = String(error);
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  throw error;
} finally {
  await page.close();
  await browser.close();
}
