import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  normalizeInlineText,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址，允许在端口占用时临时覆写。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-11-vnext-37-d-round-01");

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
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext37-d-test]", label);
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
 * 切到时间轴 Tab，确保本轮操作始终发生在真实时间轴面板上。
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
 * 通过调试桥写入当前轮次的时间轴 UI 密度场景。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function seedTimelineDensityScenario(page) {
  await page.evaluate(({ titleNode, triggerRectNode, noteRectNode, animations }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法搭建 VNext-37-D 场景");
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
      throw new Error("当前激活页缺失，无法搭建 VNext-37-D 场景");
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
 * 读取某个步骤卡片当前的关键展示指标。
 *
 * @param {import("playwright").Locator} stepCard
 * @returns {Promise<Record<string, unknown>>}
 */
async function readStepCardMetrics(stepCard) {
  return stepCard.evaluate((element) => {
    const card = element;
    if (!(card instanceof HTMLElement)) {
      return null;
    }

    const summaryText = card.querySelector(".step-summary-row")?.textContent ?? "";
    const rect = card.getBoundingClientRect();
    return {
      summaryText: summaryText.replace(/\s+/g, " ").trim(),
      toolbarButtonCount: card.querySelectorAll(".step-card-actions .arco-btn").length,
      hasExpandedBody: Boolean(card.querySelector(".step-card-body")),
      height: Number(rect.height.toFixed(2)),
    };
  });
}

/**
 * 打开某个步骤卡片的“更多操作”菜单。
 *
 * @param {import("playwright").Locator} stepCard
 * @returns {Promise<void>}
 */
async function openStepMenu(stepCard) {
  await stepCard.getByRole("button", { name: "更多步骤操作" }).click();
}

/**
 * 读取当前打开的步骤菜单选项和删除项颜色。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ labels: string[]; dangerColor: string; }>}
 */
async function readStepMenuMetrics(page) {
  return page.evaluate(() => {
    const options = Array.from(document.querySelectorAll(".arco-dropdown-option"));
    const deleteOption = document.querySelector(".timeline-step-card__menu-danger-copy");
    const deleteOptionFallback = options.find((option) =>
      option.textContent?.replace(/\s+/g, " ").trim() === "删除",
    );

    return {
      labels: options.map((option) => option.textContent?.replace(/\s+/g, " ").trim() ?? ""),
      dangerColor:
        deleteOption instanceof HTMLElement
          ? window.getComputedStyle(deleteOption).color
          : deleteOptionFallback instanceof HTMLElement
            ? window.getComputedStyle(deleteOptionFallback).color
          : "",
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

  const firstStepCard = page.locator(".timeline-panel .step-card").first();
  const secondStepCard = page.locator(".timeline-panel .step-card").nth(1);
  const thirdStepCard = page.locator(".timeline-panel .step-card").nth(2);

  logStep("read summary and toolbar density metrics");
  const firstCardMetrics = await readStepCardMetrics(firstStepCard);
  const secondCardMetrics = await readStepCardMetrics(secondStepCard);
  const thirdCardMetrics = await readStepCardMetrics(thirdStepCard);

  assertOrThrow(firstCardMetrics, "首个步骤卡片未渲染。");
  assertOrThrow(secondCardMetrics, "第二个步骤卡片未渲染。");
  assertOrThrow(thirdCardMetrics, "第三个步骤卡片未渲染。");

  assertOrThrow(
    firstCardMetrics.summaryText.includes("页面点击") &&
      firstCardMetrics.summaryText.includes("1 个动作"),
    `步骤 1 摘要异常：${firstCardMetrics.summaryText}`,
  );
  assertOrThrow(
    secondCardMetrics.summaryText.includes("点击 插图卡片") &&
      secondCardMetrics.summaryText.includes("1 个动作"),
    `步骤 2 摘要异常：${secondCardMetrics.summaryText}`,
  );
  assertOrThrow(
    thirdCardMetrics.summaryText.includes("自动触发") &&
      thirdCardMetrics.summaryText.includes("900ms 后") &&
      thirdCardMetrics.summaryText.includes("2 个动作"),
    `步骤 3 摘要异常：${thirdCardMetrics.summaryText}`,
  );
  assertOrThrow(
    firstCardMetrics.toolbarButtonCount === 3,
    `步骤卡片头部常驻按钮数量异常：${firstCardMetrics.toolbarButtonCount}`,
  );
  assertOrThrow(
    (await firstStepCard.getByRole("button", { name: "上移" }).count()) === 0,
    "旧的平铺“上移”按钮仍然直接暴露在步骤卡片头部。",
  );

  summary.checks.push({
    id: "headline-density",
    firstCardMetrics,
    secondCardMetrics,
    thirdCardMetrics,
  });

  logStep("verify menu options and danger style");
  await openStepMenu(firstStepCard);
  const stepMenuMetrics = await readStepMenuMetrics(page);
  const normalizedMenuLabels = stepMenuMetrics.labels.map((label) => normalizeInlineText(label));

  ["上移", "下移", "后插一步", "复制", "删除"].forEach((label) => {
    assertOrThrow(
      normalizedMenuLabels.includes(label),
      `步骤菜单缺少选项：${label}；当前为 ${normalizedMenuLabels.join(" / ")}`,
    );
  });
  assertOrThrow(
    stepMenuMetrics.dangerColor.includes("245") && stepMenuMetrics.dangerColor.includes("63"),
    `删除菜单项未呈现危险色：${stepMenuMetrics.dangerColor}`,
  );
  await page.keyboard.press("Escape");

  summary.checks.push({
    id: "menu-density",
    stepMenuMetrics,
  });

  logStep("verify collapsed height is compact");
  const expandedHeight = firstCardMetrics.height;
  await firstStepCard.getByRole("button", { name: "收起" }).click();
  await page.waitForFunction(() => {
    const stepCard = document.querySelector(".timeline-panel .step-card");
    return stepCard instanceof HTMLElement && !stepCard.querySelector(".step-card-body");
  });

  const collapsedMetrics = await readStepCardMetrics(firstStepCard);
  assertOrThrow(collapsedMetrics, "折叠后的步骤卡片未渲染。");
  assertOrThrow(
    collapsedMetrics.height < expandedHeight,
    `步骤卡片折叠后高度未降低：展开 ${expandedHeight}px，折叠 ${collapsedMetrics.height}px`,
  );
  assertOrThrow(
    collapsedMetrics.height <= 96,
    `步骤卡片折叠态高度仍然过高：${collapsedMetrics.height}px`,
  );
  assertOrThrow(
    collapsedMetrics.summaryText.includes("页面点击") &&
      collapsedMetrics.summaryText.includes("1 个动作"),
    `折叠态摘要异常：${collapsedMetrics.summaryText}`,
  );

  summary.checks.push({
    id: "collapsed-height",
    expandedHeight,
    collapsedHeight: collapsedMetrics.height,
    collapsedSummary: collapsedMetrics.summaryText,
  });

  await page.locator(".timeline-panel").screenshot({
    path: path.join(ASSET_DIR, "timeline-density-panel.png"),
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("VNext-37-D 时间轴密度回归过程中出现控制台或运行时错误");
  }
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
