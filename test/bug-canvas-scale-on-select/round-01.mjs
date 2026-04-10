import path from "node:path";
import {
  attachPageErrorCollectors,
  ensureDirectory,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";
import { loadChromium } from "../shared/playwright-runtime.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";
/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-10-bug-canvas-scale-on-select-round-01");
/** 高分屏回归使用的桌面视口。 */
const HIGH_DPI_VIEWPORT = {
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
};
/** 允许的画布宽度浮动阈值，单位像素。 */
const ALLOWED_STAGE_DELTA_PX = 0.5;

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[bug-canvas-scale-on-select]", label);
}

/**
 * 启动一套高分屏浏览器上下文。
 *
 * @returns {Promise<{ browser: import("playwright").Browser; page: import("playwright").Page; }>}
 */
async function launchHighDpiBrowserSession() {
  const chromium = await loadChromium(process.cwd());
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: {
      width: HIGH_DPI_VIEWPORT.width,
      height: HIGH_DPI_VIEWPORT.height,
    },
    deviceScaleFactor: HIGH_DPI_VIEWPORT.deviceScaleFactor,
  });
  const page = await context.newPage();

  return {
    browser,
    page,
  };
}

/**
 * 打开默认示例项目，进入编辑工作台。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openDemoProject(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
  await page.getByRole("button", { name: "打开" }).first().click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.waitForTimeout(1200);
}

/**
 * 展开右侧管理栏，模拟真实编辑时常见的“边看属性边选中对象”场景。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openEditorSide(page) {
  const toggleButton = page.getByRole("button", { name: "展开右侧管理栏" });
  if (await toggleButton.isVisible()) {
    await toggleButton.click();
  }

  await page.locator(".editor-side").waitFor();
  await page.waitForTimeout(300);
}

/**
 * 读取当前画布缩放与主编辑区宽度快照。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {Promise<{
 *   label: string;
 *   frameWidth: number | null;
 *   frameHeight: number | null;
 *   workspaceWidth: number | null;
 *   stageWidth: number | null;
 *   sideWidth: number | null;
 *   transform: string | null;
 *   gridColumns: string | null;
 *   selectionNodeIds: string[];
 * }>}
 */
async function readCanvasScaleSnapshot(page, label) {
  return page.evaluate((currentLabel) => {
    const frame = document.querySelector(".stage-scale-frame");
    const workspaceShell = document.querySelector(".workspace-shell");
    const stageScroll = document.querySelector(".stage-scroll");
    const editorSide = document.querySelector(".editor-side");
    const editorLayout = document.querySelector(".editor-layout");
    const stageSurface = document.querySelector(".stage-surface");

    return {
      label: currentLabel,
      frameWidth: frame?.getBoundingClientRect().width ?? null,
      frameHeight: frame?.getBoundingClientRect().height ?? null,
      workspaceWidth: workspaceShell?.getBoundingClientRect().width ?? null,
      stageWidth: stageScroll?.getBoundingClientRect().width ?? null,
      sideWidth: editorSide?.getBoundingClientRect().width ?? null,
      transform: stageSurface ? getComputedStyle(stageSurface).transform : null,
      gridColumns: editorLayout ? getComputedStyle(editorLayout).gridTemplateColumns : null,
      selectionNodeIds: window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.selection?.nodeIds ?? [],
    };
  }, label);
}

/**
 * 解析示例项目首页指定节点的可点击视口坐标。
 *
 * @param {import("playwright").Page} page
 * @param {string} nodeName
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function resolveDemoNodeViewportPoint(page, nodeName) {
  return page.locator(".stage-surface").evaluate((element, currentNodeName) => {
    const node = window.__CW_EDITOR_DEBUG__
      ?.getSnapshot()
      ?.document?.slides?.[0]?.nodes?.find((candidate) => candidate.name === currentNodeName);
    if (!node) {
      throw new Error(`未找到示例节点：${currentNodeName}`);
    }

    const rect = element.getBoundingClientRect();
    const localX = node.x + node.width * 0.4;
    const localY = node.y + node.height * 0.5;

    return {
      x: rect.left + (localX / 1280) * rect.width,
      y: rect.top + (localY / 720) * rect.height,
    };
  }, nodeName);
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, page } = await launchHighDpiBrowserSession();
/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  viewport: HIGH_DPI_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open demo project");
  await openDemoProject(page);

  logStep("open editor side panel");
  await openEditorSide(page);

  logStep("read before-select snapshot");
  const beforeSelectSnapshot = await readCanvasScaleSnapshot(page, "before-select");

  logStep("select demo title node");
  const titlePoint = await resolveDemoNodeViewportPoint(page, "Course Title");
  await page.mouse.click(titlePoint.x, titlePoint.y);
  await page.waitForTimeout(600);

  logStep("read after-select snapshot");
  const afterSelectSnapshot = await readCanvasScaleSnapshot(page, "after-select");

  summary.checks.push({
    id: "canvas-scale-stability",
    before: beforeSelectSnapshot,
    after: afterSelectSnapshot,
    frameWidthDelta:
      beforeSelectSnapshot.frameWidth !== null && afterSelectSnapshot.frameWidth !== null
        ? Number((afterSelectSnapshot.frameWidth - beforeSelectSnapshot.frameWidth).toFixed(4))
        : null,
    transformStable: beforeSelectSnapshot.transform === afterSelectSnapshot.transform,
  });

  if (
    beforeSelectSnapshot.frameWidth === null ||
    afterSelectSnapshot.frameWidth === null
  ) {
    throw new Error("未读取到点击前后的画布宽度快照");
  }

  if (
    Math.abs(afterSelectSnapshot.frameWidth - beforeSelectSnapshot.frameWidth) > ALLOWED_STAGE_DELTA_PX
  ) {
    throw new Error(
      `点击元素后画布宽度发生异常变化：before=${beforeSelectSnapshot.frameWidth}, after=${afterSelectSnapshot.frameWidth}`,
    );
  }

  if (beforeSelectSnapshot.transform !== afterSelectSnapshot.transform) {
    throw new Error(
      `点击元素后画布缩放矩阵发生变化：before=${beforeSelectSnapshot.transform}, after=${afterSelectSnapshot.transform}`,
    );
  }

  if (afterSelectSnapshot.selectionNodeIds.length !== 1) {
    throw new Error(`点击示例标题后未形成稳定单选态：${afterSelectSnapshot.selectionNodeIds.join(",")}`);
  }

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-select-demo-title.png"),
    fullPage: true,
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(
      `自动化执行期间捕获到错误；console=${consoleErrors.length}, page=${pageErrors.length}`,
    );
  }

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  logStep("canvas scale stability checks passed");
} finally {
  await browser.close();
}
