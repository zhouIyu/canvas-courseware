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
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";
/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve(
  "docs/test-reports/assets/2026-05-12-bug-timeline-panel-density-round-01",
);
/** 时间轴折叠态允许的最大高度。 */
const MAX_COLLAPSED_HEIGHT = 96;

/** 时间轴 UI 场景里的标题文本节点。 */
const TITLE_NODE = {
  id: "timeline-density-title-node",
  type: "text",
  name: "标题文案",
  x: 160,
  y: 120,
  width: 360,
  height: 88,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    text: "时间轴卡片需要更紧凑",
    fontSize: 34,
    color: "#0F172A",
    fontFamily: "Noto Sans SC",
    fontWeight: 600,
    fontStyle: "normal",
    lineHeight: 1.4,
    textAlign: "left",
  },
};

/** 时间轴 UI 场景里的可点击卡片节点。 */
const TRIGGER_RECT_NODE = {
  id: "timeline-density-trigger-rect",
  type: "rect",
  name: "插图卡片",
  x: 720,
  y: 160,
  width: 220,
  height: 148,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    fill: "#DBEAFE",
    stroke: "#2563EB",
    strokeWidth: 2,
    radius: 20,
  },
};

/** 时间轴 UI 场景里的备注气泡节点。 */
const NOTE_RECT_NODE = {
  id: "timeline-density-note-rect",
  type: "rect",
  name: "备注气泡",
  x: 240,
  y: 360,
  width: 260,
  height: 112,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  props: {
    fill: "#DCFCE7",
    stroke: "#16A34A",
    strokeWidth: 2,
    radius: 18,
  },
};

/** 当前轮次预置的动画资源。 */
const TIMELINE_ANIMATIONS = {
  titleFade: {
    id: "timeline-density-title-fade",
    targetId: TITLE_NODE.id,
    kind: "fade",
    durationMs: 360,
  },
  noteSlideUp: {
    id: "timeline-density-note-slide-up",
    targetId: NOTE_RECT_NODE.id,
    kind: "slide-up",
    durationMs: 420,
  },
};

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[bug-timeline-panel-density]", label);
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
 * 等待编辑器调试桥就绪。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function waitForEditorDebugBridge(page) {
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
}

/**
 * 确保右侧管理栏已经展开。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function ensureEditorSideExpanded(page) {
  const expandButton = page.getByRole("button", { name: "展开右侧管理栏" });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
  }

  await page.locator(".side-tabs-nav").waitFor();
}

/**
 * 切到时间轴 Tab。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function openTimelinePanel(page) {
  await ensureEditorSideExpanded(page);
  await page.locator(".side-tabs-nav .arco-tabs-tab").filter({ hasText: "时间轴" }).click();
  await page.locator(".timeline-panel").waitFor();
}

/**
 * 通过调试桥写入时间轴密度场景。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function seedTimelineDensityScenario(page) {
  await page.evaluate(({ titleNode, triggerRectNode, noteRectNode, animations }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法搭建时间轴密度场景");
    }

    const controller = debugBridge.getController();
    const commandTypes = debugBridge.getCommandTypes();
    const snapshot = debugBridge.getSnapshot();
    const slideId = snapshot.activeSlideId;
    if (!slideId) {
      throw new Error("当前项目没有可编辑的 slide");
    }

    const activeSlide = snapshot.document.slides.find((slide) => slide.id === slideId);
    if (!activeSlide) {
      throw new Error("当前激活页缺失，无法搭建时间轴密度场景");
    }

    [titleNode, triggerRectNode, noteRectNode].forEach((node, index) => {
      controller.execute({
        type: commandTypes.NODE_CREATE,
        slideId,
        node,
        index: activeSlide.nodes.length + index,
      });
    });

    Object.values(animations).forEach((animation) => {
      controller.execute({
        type: commandTypes.TIMELINE_ANIMATION_UPSERT,
        slideId,
        animation,
      });
    });

    [
      {
        id: "timeline-density-step-cover-title",
        name: "标题入场",
        trigger: {
          type: "page-click",
        },
        actions: [
          {
            id: "timeline-density-step-cover-title-action",
            type: "show-node",
            targetId: titleNode.id,
            animationId: animations.titleFade.id,
          },
        ],
      },
      {
        id: "timeline-density-step-trigger-note",
        name: "点击插图继续",
        trigger: {
          type: "node-click",
          targetId: triggerRectNode.id,
        },
        actions: [
          {
            id: "timeline-density-step-trigger-note-action",
            type: "show-node",
            targetId: noteRectNode.id,
            animationId: animations.noteSlideUp.id,
          },
        ],
      },
      {
        id: "timeline-density-step-auto-wrap-up",
        name: "自动收口",
        trigger: {
          type: "auto",
          delayMs: 900,
        },
        actions: [
          {
            id: "timeline-density-step-auto-hide-action",
            type: "hide-node",
            targetId: triggerRectNode.id,
          },
          {
            id: "timeline-density-step-auto-animation-action",
            type: "play-animation",
            animationId: animations.titleFade.id,
          },
        ],
      },
    ].forEach((step, index) => {
      controller.execute({
        type: commandTypes.TIMELINE_STEP_UPSERT,
        slideId,
        step,
        index,
      });
    });

    controller.execute({
      type: commandTypes.SELECTION_CLEAR,
      slideId,
    });
  }, {
    titleNode: TITLE_NODE,
    triggerRectNode: TRIGGER_RECT_NODE,
    noteRectNode: NOTE_RECT_NODE,
    animations: TIMELINE_ANIMATIONS,
  });
}

/**
 * 读取右侧栏和步骤卡片的布局指标。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, unknown>>}
 */
async function readTimelinePanelMetrics(page) {
  return page.evaluate(() => {
    const side = document.querySelector(".editor-side");
    const panel = document.querySelector(".timeline-panel");
    const firstCard = document.querySelector(".timeline-panel .step-card");
    const summary = firstCard?.querySelector(".step-summary-row");
    const detail = firstCard?.querySelector(".step-detail-copy");

    return {
      editorSideWidth:
        side instanceof HTMLElement ? Number(side.getBoundingClientRect().width.toFixed(2)) : null,
      timelinePanelWidth:
        panel instanceof HTMLElement ? Number(panel.getBoundingClientRect().width.toFixed(2)) : null,
      firstCard:
        firstCard instanceof HTMLElement
          ? {
              width: Number(firstCard.getBoundingClientRect().width.toFixed(2)),
              height: Number(firstCard.getBoundingClientRect().height.toFixed(2)),
              actionOverviewCount: firstCard.querySelectorAll(".step-action-overview__item").length,
              settingsEntryCount: firstCard.querySelectorAll(".step-settings-entry").length,
              toolbarButtonCount: firstCard.querySelectorAll(".step-card-actions .arco-btn").length,
              summaryText: summary?.textContent?.replace(/\s+/g, " ").trim() ?? "",
              summaryHeight:
                summary instanceof HTMLElement
                  ? Number(summary.getBoundingClientRect().height.toFixed(2))
                  : null,
              detailText: detail?.textContent?.replace(/\s+/g, " ").trim() ?? "",
              detailHeight:
                detail instanceof HTMLElement
                  ? Number(detail.getBoundingClientRect().height.toFixed(2))
                  : null,
            }
          : null,
    };
  });
}

/**
 * 读取首张步骤卡片折叠后的高度指标。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function readCollapsedFirstCardMetrics(page) {
  return page.evaluate(() => {
    const firstCard = document.querySelector(".timeline-panel .step-card");
    const summary = firstCard?.querySelector(".step-summary-row");
    if (!(firstCard instanceof HTMLElement)) {
      return null;
    }

    return {
      height: Number(firstCard.getBoundingClientRect().height.toFixed(2)),
      hasExpandedBody: Boolean(firstCard.querySelector(".step-card-body")),
      summaryText: summary?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      summaryHeight:
        summary instanceof HTMLElement ? Number(summary.getBoundingClientRect().height.toFixed(2)) : null,
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
  assetDir: ASSET_DIR,
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open project list and reset localStorage");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  logStep("create blank project and wait for edit workspace");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await waitForEditorDebugBridge(page);
  await waitForSaved(page);

  logStep("open timeline panel and seed density scenario");
  await openTimelinePanel(page);
  await seedTimelineDensityScenario(page);
  await waitForSaved(page);

  logStep("capture expanded panel metrics");
  const expandedMetrics = await readTimelinePanelMetrics(page);
  await page.locator(".editor-side").screenshot({
    path: path.join(ASSET_DIR, "timeline-side-panel.png"),
  });

  assertOrThrow(expandedMetrics.firstCard, "首张步骤卡片未渲染。");
  assertOrThrow(
    expandedMetrics.firstCard.actionOverviewCount === 0,
    `步骤卡片仍然内联渲染动作概览：${expandedMetrics.firstCard.actionOverviewCount}`,
  );
  assertOrThrow(
    expandedMetrics.firstCard.settingsEntryCount === 0,
    `步骤卡片仍然保留“打开完整设置”按钮：${expandedMetrics.firstCard.settingsEntryCount}`,
  );
  assertOrThrow(
    expandedMetrics.firstCard.summaryText.includes("页面点击") &&
      expandedMetrics.firstCard.summaryText.includes("1 个动作"),
    `首张步骤卡片摘要异常：${expandedMetrics.firstCard.summaryText}`,
  );

  summary.checks.push({
    id: "expanded-card-density",
    expandedMetrics,
  });

  logStep("verify collapsed height is compact");
  await page.locator(".timeline-panel .step-card").first().getByRole("button", { name: "收起" }).click();
  await page.waitForFunction(() => {
    const card = document.querySelector(".timeline-panel .step-card");
    return card instanceof HTMLElement && !card.querySelector(".step-card-body");
  });

  const collapsedMetrics = await readCollapsedFirstCardMetrics(page);
  await page.locator(".timeline-panel").screenshot({
    path: path.join(ASSET_DIR, "timeline-panel-collapsed-first.png"),
  });
  assertOrThrow(collapsedMetrics, "折叠后的首张步骤卡片未渲染。");
  assertOrThrow(
    collapsedMetrics.height <= MAX_COLLAPSED_HEIGHT,
    `步骤卡片折叠态高度仍然过高：${collapsedMetrics.height}px`,
  );
  assertOrThrow(
    collapsedMetrics.hasExpandedBody === false,
    "步骤卡片折叠后仍残留展开态内容。",
  );

  summary.checks.push({
    id: "collapsed-card-density",
    collapsedMetrics,
  });

  logStep("verify drawer entry still works");
  await page.locator(".timeline-panel .step-card").nth(1).getByRole("button", { name: "打开步骤设置" }).click();
  await page.locator(".step-settings-drawer").waitFor();
  await page.locator(".step-settings-drawer").screenshot({
    path: path.join(ASSET_DIR, "timeline-step-settings-drawer.png"),
  });
  const drawerMetrics = await page.evaluate(() => {
    const drawer = document.querySelector(".step-settings-drawer");
    const title = drawer?.querySelector(".step-settings-form__headline h3");
    return {
      isVisible: drawer instanceof HTMLElement,
      title: title?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    };
  });
  assertOrThrow(drawerMetrics.isVisible, "步骤设置抽屉未成功打开。");
  assertOrThrow(drawerMetrics.title === "点击插图继续", `步骤设置抽屉标题异常：${drawerMetrics.title}`);

  summary.checks.push({
    id: "step-settings-drawer",
    drawerMetrics,
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("时间轴步骤卡片密度回归过程中出现控制台或运行时错误");
  }
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
