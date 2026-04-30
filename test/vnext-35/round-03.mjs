import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  launchBrowserSession,
  normalizeInlineText,
  readStoredProjects,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-30-vnext-35-c-round-01");

/** 当前时间轴场景里的标题文本节点。 */
const TITLE_NODE = {
  id: "timeline-title-node",
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
    text: "时间轴摘要需要一眼看懂",
    fontSize: 34,
    color: "#0F172A",
    fontFamily: "Noto Sans SC",
    fontWeight: 600,
    fontStyle: "normal",
    lineHeight: 1.4,
    textAlign: "left",
  },
};

/** 当前时间轴场景里的可点击插图卡片节点。 */
const TRIGGER_RECT_NODE = {
  id: "timeline-trigger-rect",
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

/** 当前时间轴场景里的备注气泡节点。 */
const NOTE_RECT_NODE = {
  id: "timeline-note-rect",
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

/** 当前轮次预置的两个动画资源。 */
const TIMELINE_ANIMATIONS = {
  titleFade: {
    id: "timeline-animation-title-fade",
    targetId: TITLE_NODE.id,
    kind: "fade",
    durationMs: 360,
  },
  noteSlideUp: {
    id: "timeline-animation-note-slide-up",
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
  console.log("[vnext35-c-test]", label);
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
 * 通过调试桥写入当前轮次的时间轴测试场景。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ slideId: string; stepNames: string[]; }>}
 */
async function seedTimelineEfficiencyScenario(page) {
  return page.evaluate(({ titleNode, triggerRectNode, noteRectNode, animations }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法搭建 VNext-35-C 场景");
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
      throw new Error("当前激活页缺失，无法搭建时间轴场景");
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

    const steps = [
      {
        id: "timeline-step-cover-title",
        name: "标题入场",
        trigger: {
          type: "page-click",
        },
        actions: [
          {
            id: "timeline-step-cover-title-action",
            type: "show-node",
            targetId: titleNode.id,
            animationId: animations.titleFade.id,
          },
        ],
      },
      {
        id: "timeline-step-trigger-note",
        name: "点击插图继续",
        trigger: {
          type: "node-click",
          targetId: triggerRectNode.id,
        },
        actions: [
          {
            id: "timeline-step-trigger-note-action",
            type: "show-node",
            targetId: noteRectNode.id,
            animationId: animations.noteSlideUp.id,
          },
        ],
      },
      {
        id: "timeline-step-auto-wrap-up",
        name: "自动收口",
        trigger: {
          type: "auto",
          delayMs: 900,
        },
        actions: [
          {
            id: "timeline-step-auto-hide-action",
            type: "hide-node",
            targetId: triggerRectNode.id,
          },
          {
            id: "timeline-step-auto-animation-action",
            type: "play-animation",
            animationId: animations.titleFade.id,
          },
        ],
      },
    ];

    steps.forEach((step, index) => {
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

    return {
      slideId,
      stepNames: steps.map((step) => step.name),
    };
  }, {
    titleNode: TITLE_NODE,
    triggerRectNode: TRIGGER_RECT_NODE,
    noteRectNode: NOTE_RECT_NODE,
    animations: TIMELINE_ANIMATIONS,
  });
}

/**
 * 读取时间轴卡片总数。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<number>}
 */
async function readTimelineStepCardCount(page) {
  return page.locator(".timeline-panel .step-card").count();
}

/**
 * 读取所有步骤卡片头部的摘要文案，便于验证触发方式与目标对象提示。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string[]>}
 */
async function readTimelineSummaryTexts(page) {
  return page.locator(".timeline-panel .step-card .step-summary-row").evaluateAll((elements) =>
    elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );
}

/**
 * 读取当前项目在本地存储里的完整 timeline 步骤列表。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<any[]>}
 */
async function readPersistedTimelineSteps(page, projectId) {
  const projects = await readStoredProjects(page, STORAGE_KEY);
  const project = findProjectById(projects, projectId);
  const firstSlide = project?.document?.slides?.[0];
  return firstSlide?.timeline?.steps ?? [];
}

/**
 * 判断两个步骤是否保留了同一套触发方式与动作结构，但副本 id 已经重新生成。
 *
 * @param {any} sourceStep
 * @param {any} clonedStep
 * @param {string} label
 * @returns {void}
 */
function assertClonedStepStructure(sourceStep, clonedStep, label) {
  assertOrThrow(Boolean(sourceStep) && Boolean(clonedStep), `${label}: 缺少源步骤或副本步骤`);
  assertOrThrow(sourceStep.id !== clonedStep.id, `${label}: 副本步骤 id 没有重新生成`);
  assertOrThrow(
    sourceStep.trigger.type === clonedStep.trigger.type,
    `${label}: 触发方式未正确继承`,
  );

  if (sourceStep.trigger.type === "node-click") {
    assertOrThrow(
      sourceStep.trigger.targetId === clonedStep.trigger.targetId,
      `${label}: 对象点击触发目标未正确继承`,
    );
  }

  if (sourceStep.trigger.type === "auto") {
    assertOrThrow(
      sourceStep.trigger.delayMs === clonedStep.trigger.delayMs,
      `${label}: 自动触发延迟未正确继承`,
    );
  }

  assertOrThrow(
    sourceStep.actions.length === clonedStep.actions.length,
    `${label}: 动作数量未正确继承`,
  );

  sourceStep.actions.forEach((action, actionIndex) => {
    const clonedAction = clonedStep.actions[actionIndex];
    assertOrThrow(Boolean(clonedAction), `${label}: 缺少第 ${actionIndex + 1} 条动作副本`);
    assertOrThrow(action.id !== clonedAction.id, `${label}: 第 ${actionIndex + 1} 条动作 id 没有重新生成`);
    assertOrThrow(action.type === clonedAction.type, `${label}: 第 ${actionIndex + 1} 条动作类型未正确继承`);

    if ("targetId" in action) {
      assertOrThrow(
        action.targetId === clonedAction.targetId,
        `${label}: 第 ${actionIndex + 1} 条动作目标对象未正确继承`,
      );
    }

    if ("animationId" in action) {
      assertOrThrow(
        action.animationId === clonedAction.animationId,
        `${label}: 第 ${actionIndex + 1} 条动作动画引用未正确继承`,
      );
    }
  });
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
  await waitForEditorDebugBridge(page);
  await waitForSaved(page);

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";

  logStep("open timeline panel and seed scenario");
  await openTimelinePanel(page);
  const scenario = await seedTimelineEfficiencyScenario(page);
  await waitForSaved(page);

  const initialStepCardCount = await readTimelineStepCardCount(page);
  assertOrThrow(initialStepCardCount === 3, `初始化后应有 3 个步骤卡片，实际为 ${initialStepCardCount}`);

  const initialSummaryTexts = await readTimelineSummaryTexts(page);
  assertOrThrow(
    initialSummaryTexts[0]?.includes("页面点击") &&
      initialSummaryTexts[0]?.includes("显示对象 · 标题文案 · 淡入"),
    `步骤 1 摘要异常：${initialSummaryTexts[0] ?? "缺失"}`,
  );
  assertOrThrow(
    initialSummaryTexts[1]?.includes("对象点击") &&
      initialSummaryTexts[1]?.includes("触发 插图卡片") &&
      initialSummaryTexts[1]?.includes("显示对象 · 备注气泡 · 上滑出现"),
    `步骤 2 摘要异常：${initialSummaryTexts[1] ?? "缺失"}`,
  );
  assertOrThrow(
    initialSummaryTexts[2]?.includes("自动触发") &&
      initialSummaryTexts[2]?.includes("延迟 900ms") &&
      initialSummaryTexts[2]?.includes("隐藏对象 · 插图卡片") &&
      initialSummaryTexts[2]?.includes("播放动画 · 标题文案 · 淡入"),
    `步骤 3 摘要异常：${initialSummaryTexts[2] ?? "缺失"}`,
  );

  summary.checks.push({
    id: "summary-chips",
    stepNames: scenario.stepNames,
    summaryTexts: initialSummaryTexts,
  });

  logStep("verify step collapse and expand controls");
  const firstStepCard = page.locator(".timeline-panel .step-card").first();
  await firstStepCard.getByRole("button", { name: "收起" }).click();
  await page.waitForFunction(() => {
    const firstStepCardElement = document.querySelector(".timeline-panel .step-card");
    return (
      firstStepCardElement instanceof HTMLElement &&
      firstStepCardElement.classList.contains("is-collapsed") &&
      !firstStepCardElement.querySelector(".step-card-body")
    );
  });

  const firstCollapsedSummary = normalizeInlineText(
    await firstStepCard.locator(".step-summary-row").textContent(),
  );
  assertOrThrow(
    firstCollapsedSummary.includes("页面点击") &&
      firstCollapsedSummary.includes("显示对象 · 标题文案 · 淡入"),
    `步骤折叠后摘要丢失：${firstCollapsedSummary}`,
  );

  await page.getByRole("button", { name: "全部收起" }).click();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".timeline-panel .step-card")).every(
      (element) => element instanceof HTMLElement && element.classList.contains("is-collapsed"),
    ),
  );

  await page.getByRole("button", { name: "全部展开" }).click();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".timeline-panel .step-card")).every(
      (element) => element instanceof HTMLElement && !element.classList.contains("is-collapsed"),
    ),
  );

  summary.checks.push({
    id: "collapse-expand",
    firstCollapsedSummary,
  });

  logStep("verify quick create after current step");
  const secondStepCard = page.locator(".timeline-panel .step-card").nth(1);
  await secondStepCard.getByRole("button", { name: "后插一步" }).click();
  await waitForSaved(page);

  const stepsAfterQuickCreate = await readPersistedTimelineSteps(page, projectId);
  assertOrThrow(
    stepsAfterQuickCreate.length === 4,
    `后插一步后应有 4 个步骤，实际为 ${stepsAfterQuickCreate.length}`,
  );

  const sourceQuickCreateStep = stepsAfterQuickCreate[1];
  const insertedQuickCreateStep = stepsAfterQuickCreate[2];
  assertOrThrow(
    insertedQuickCreateStep.name === "点击插图继续 后续",
    `后插一步名称异常：${insertedQuickCreateStep.name}`,
  );
  assertClonedStepStructure(sourceQuickCreateStep, insertedQuickCreateStep, "quick-create-after");

  const summaryAfterQuickCreate = await readTimelineSummaryTexts(page);
  assertOrThrow(
    summaryAfterQuickCreate[2]?.includes("对象点击") &&
      summaryAfterQuickCreate[2]?.includes("触发 插图卡片") &&
      summaryAfterQuickCreate[2]?.includes("显示对象 · 备注气泡 · 上滑出现"),
    `后插一步后的摘要异常：${summaryAfterQuickCreate[2] ?? "缺失"}`,
  );

  summary.checks.push({
    id: "quick-create-after",
    insertedStepName: insertedQuickCreateStep.name,
    stepCount: stepsAfterQuickCreate.length,
  });

  logStep("verify duplicate step remains available");
  const duplicateSourceCard = page.locator(".timeline-panel .step-card").first();
  await duplicateSourceCard.getByRole("button", { name: "复制" }).click();
  await waitForSaved(page);

  const stepsAfterDuplicate = await readPersistedTimelineSteps(page, projectId);
  assertOrThrow(
    stepsAfterDuplicate.length === 5,
    `复制步骤后应有 5 个步骤，实际为 ${stepsAfterDuplicate.length}`,
  );

  const sourceDuplicatedStep = stepsAfterDuplicate[0];
  const duplicatedStep = stepsAfterDuplicate[1];
  assertOrThrow(
    duplicatedStep.name === "标题入场 副本",
    `复制步骤名称异常：${duplicatedStep.name}`,
  );
  assertClonedStepStructure(sourceDuplicatedStep, duplicatedStep, "duplicate-step");

  const finalStepCardCount = await readTimelineStepCardCount(page);
  assertOrThrow(finalStepCardCount === 5, `最终应展示 5 个步骤卡片，实际为 ${finalStepCardCount}`);

  await page.screenshot({
    path: path.join(ASSET_DIR, "timeline-efficiency-panel.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "duplicate-step",
    duplicatedStepName: duplicatedStep.name,
    finalStepCardCount,
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("VNext-35-C 时间轴编排效率回归过程中出现控制台或运行时错误");
  }
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
