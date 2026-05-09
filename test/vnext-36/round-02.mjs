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

/** 正式项目列表地址，允许在端口占用时临时覆写。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-09-vnext-36-b-round-01");

/** 第一页的时间轴测试场景。 */
const FIRST_SLIDE_SCENARIO = {
  nodes: [
    {
      id: "timeline-slide-a-title",
      type: "text",
      name: "封面标题",
      x: 140,
      y: 120,
      width: 360,
      height: 80,
      rotation: 0,
      opacity: 1,
      visible: false,
      locked: false,
      props: {
        text: "第一页标题",
        fontSize: 34,
        color: "#0F172A",
        fontFamily: "Noto Sans SC",
        fontWeight: 600,
        fontStyle: "normal",
        lineHeight: 1.4,
        textAlign: "left",
      },
    },
    {
      id: "timeline-slide-a-card",
      type: "rect",
      name: "封面卡片",
      x: 580,
      y: 180,
      width: 220,
      height: 140,
      rotation: 0,
      opacity: 1,
      visible: false,
      locked: false,
      props: {
        fill: "#DBEAFE",
        stroke: "#2563EB",
        strokeWidth: 2,
        radius: 18,
      },
    },
    {
      id: "timeline-slide-a-note",
      type: "rect",
      name: "封面备注",
      x: 220,
      y: 340,
      width: 280,
      height: 120,
      rotation: 0,
      opacity: 1,
      visible: false,
      locked: false,
      props: {
        fill: "#DCFCE7",
        stroke: "#16A34A",
        strokeWidth: 2,
        radius: 18,
      },
    },
  ],
  steps: [
    {
      id: "timeline-slide-a-step-title",
      name: "展示标题",
      trigger: {
        type: "page-click",
      },
      actions: [
        {
          id: "timeline-slide-a-action-title",
          type: "show-node",
          targetId: "timeline-slide-a-title",
        },
      ],
    },
    {
      id: "timeline-slide-a-step-card",
      name: "展示卡片",
      trigger: {
        type: "page-click",
      },
      actions: [
        {
          id: "timeline-slide-a-action-card",
          type: "show-node",
          targetId: "timeline-slide-a-card",
        },
      ],
    },
    {
      id: "timeline-slide-a-step-note",
      name: "展示备注",
      trigger: {
        type: "auto",
        delayMs: 600,
      },
      actions: [
        {
          id: "timeline-slide-a-action-note",
          type: "show-node",
          targetId: "timeline-slide-a-note",
        },
      ],
    },
  ],
};

/** 第二页的时间轴测试场景。 */
const SECOND_SLIDE_SCENARIO = {
  nodes: [
    {
      id: "timeline-slide-b-panel",
      type: "rect",
      name: "总结面板",
      x: 180,
      y: 160,
      width: 360,
      height: 180,
      rotation: 0,
      opacity: 1,
      visible: false,
      locked: false,
      props: {
        fill: "#FEF3C7",
        stroke: "#D97706",
        strokeWidth: 2,
        radius: 20,
      },
    },
    {
      id: "timeline-slide-b-badge",
      type: "text",
      name: "总结标签",
      x: 240,
      y: 390,
      width: 280,
      height: 72,
      rotation: 0,
      opacity: 1,
      visible: false,
      locked: false,
      props: {
        text: "第二页标签",
        fontSize: 30,
        color: "#78350F",
        fontFamily: "Noto Sans SC",
        fontWeight: 600,
        fontStyle: "normal",
        lineHeight: 1.4,
        textAlign: "left",
      },
    },
  ],
  steps: [
    {
      id: "timeline-slide-b-step-panel",
      name: "展示面板",
      trigger: {
        type: "page-click",
      },
      actions: [
        {
          id: "timeline-slide-b-action-panel",
          type: "show-node",
          targetId: "timeline-slide-b-panel",
        },
      ],
    },
    {
      id: "timeline-slide-b-step-badge",
      name: "展示标签",
      trigger: {
        type: "page-click",
      },
      actions: [
        {
          id: "timeline-slide-b-action-badge",
          type: "show-node",
          targetId: "timeline-slide-b-badge",
        },
      ],
    },
  ],
};

/**
 * 打印当前测试阶段，便于定位执行失败点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext36-b-test]", label);
}

/**
 * 条件不满足时抛出可读性更好的错误信息。
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
 * 通过调试桥在当前激活页写入一套时间轴测试场景。
 *
 * @param {import("playwright").Page} page
 * @param {{ nodes: any[]; steps: any[]; }} scenario
 * @returns {Promise<{ slideId: string; stepIds: string[]; stepNames: string[]; }>}
 */
async function seedTimelineScenario(page, scenario) {
  return page.evaluate((payload) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法搭建 VNext-36-B 场景");
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
      throw new Error("当前激活页缺失，无法写入时间轴场景");
    }

    payload.nodes.forEach((node, index) => {
      controller.execute({
        type: commandTypes.NODE_CREATE,
        slideId,
        node,
        index: activeSlide.nodes.length + index,
      });
    });

    payload.steps.forEach((step, index) => {
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
      stepIds: payload.steps.map((step) => step.id),
      stepNames: payload.steps.map((step) => step.name),
    };
  }, scenario);
}

/**
 * 选择左侧页面栏中的指定序号页面。
 *
 * @param {import("playwright").Page} page
 * @param {number} index
 * @returns {Promise<void>}
 */
async function selectSlideByIndex(page, index) {
  const slideShell = page.locator(".slide-list .slide-card-shell").nth(index);
  await slideShell.locator(".slide-card").click();
  await page.waitForFunction((targetIndex) => {
    const shells = Array.from(document.querySelectorAll(".slide-list .slide-card-shell"));
    return shells[targetIndex]?.classList.contains("is-active") ?? false;
  }, index);
}

/**
 * 拖拽时间轴步骤到目标步骤之前或之后。
 *
 * @param {import("playwright").Page} page
 * @param {number} sourceIndex
 * @param {number} targetIndex
 * @param {"before" | "after"} placement
 * @returns {Promise<void>}
 */
async function dragTimelineStepToIndex(page, sourceIndex, targetIndex, placement = "before") {
  const didDispatch = await page.evaluate(({ fromIndex, toIndex, targetPlacement }) => {
    const stepCards = Array.from(document.querySelectorAll(".timeline-panel .step-card"));
    const sourceCard = stepCards[fromIndex];
    const targetCard = stepCards[toIndex];
    const sourceHead = sourceCard?.querySelector(".card-head");

    if (
      !(sourceCard instanceof HTMLElement) ||
      !(targetCard instanceof HTMLElement) ||
      !(sourceHead instanceof HTMLElement)
    ) {
      return false;
    }

    const targetBounds = targetCard.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    const clientX = targetBounds.left + targetBounds.width / 2;
    const clientY =
      targetPlacement === "before"
        ? targetBounds.top + 6
        : targetBounds.bottom - 6;

    sourceHead.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }),
    );
    targetCard.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX,
        clientY,
      }),
    );
    targetCard.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX,
        clientY,
      }),
    );
    sourceHead.dispatchEvent(
      new DragEvent("dragend", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }),
    );

    return true;
  }, {
    fromIndex: sourceIndex,
    toIndex: targetIndex,
    targetPlacement: placement,
  });

  assertOrThrow(didDispatch, "未找到可拖拽的时间轴步骤卡片，无法执行排序。");
}

/**
 * 读取当前时间轴面板中的步骤标题顺序。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string[]>}
 */
async function readTimelineStepTitles(page) {
  return page.locator(".timeline-panel .step-card .step-title").evaluateAll((elements) =>
    elements.map((element) => element.textContent?.trim() ?? ""),
  );
}

/**
 * 读取当前时间轴面板里所有折叠步骤的下标。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<number[]>}
 */
async function readCollapsedStepIndexes(page) {
  return page.locator(".timeline-panel .step-card").evaluateAll((elements) =>
    elements.flatMap((element, index) =>
      element.classList.contains("is-collapsed") ? [index] : [],
    ),
  );
}

/**
 * 读取当前已持久化的目标项目记录。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<any | null>}
 */
async function readPersistedProject(page, projectId) {
  return findProjectById(await readStoredProjects(page, STORAGE_KEY), projectId);
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
  assertOrThrow(Boolean(projectId), "未能从地址中解析出项目 id。");

  logStep("open timeline panel and seed first slide");
  await openTimelinePanel(page);
  const firstSlideScenario = await seedTimelineScenario(page, FIRST_SLIDE_SCENARIO);
  await waitForSaved(page);

  const initialTitles = await readTimelineStepTitles(page);
  assertOrThrow(
    initialTitles.join("|") === firstSlideScenario.stepNames.join("|"),
    `第一页初始步骤顺序异常：${initialTitles.join(" > ")}`,
  );

  logStep("create second slide and seed second slide");
  await page.getByRole("button", { name: "新建页面" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".slide-list .slide-card-shell").length === 2);
  await waitForSaved(page);
  await selectSlideByIndex(page, 1);
  const secondSlideScenario = await seedTimelineScenario(page, SECOND_SLIDE_SCENARIO);
  await waitForSaved(page);

  const secondSlideTitles = await readTimelineStepTitles(page);
  assertOrThrow(
    secondSlideTitles.join("|") === secondSlideScenario.stepNames.join("|"),
    `第二页初始步骤顺序异常：${secondSlideTitles.join(" > ")}`,
  );

  logStep("reorder first slide timeline steps by drag");
  await selectSlideByIndex(page, 0);
  await dragTimelineStepToIndex(page, 2, 0, "before");
  await waitForSaved(page);

  const reorderedFirstSlideTitles = await readTimelineStepTitles(page);
  const expectedFirstSlideTitles = ["展示备注", "展示标题", "展示卡片"];
  assertOrThrow(
    reorderedFirstSlideTitles.join("|") === expectedFirstSlideTitles.join("|"),
    `拖拽排序后的第一页步骤顺序异常：${reorderedFirstSlideTitles.join(" > ")}`,
  );

  const projectAfterReorder = await readPersistedProject(page, projectId);
  const reorderedPersistedTitles =
    projectAfterReorder?.document?.slides?.find((slide) => slide.id === firstSlideScenario.slideId)
      ?.timeline?.steps?.map((step) => step.name) ?? [];
  assertOrThrow(
    reorderedPersistedTitles.join("|") === expectedFirstSlideTitles.join("|"),
    `本地持久化中的步骤顺序异常：${reorderedPersistedTitles.join(" > ")}`,
  );

  summary.checks.push({
    id: "step-drag-sort",
    expectedTitles: expectedFirstSlideTitles,
    actualTitles: reorderedFirstSlideTitles,
  });

  logStep("persist collapsed state on first slide");
  const firstStepCard = page.locator(".timeline-panel .step-card").nth(0);
  const thirdStepCard = page.locator(".timeline-panel .step-card").nth(2);
  await firstStepCard.getByRole("button", { name: "收起" }).click();
  await thirdStepCard.getByRole("button", { name: "收起" }).click();
  await waitForSaved(page);

  const firstSlideCollapsedIndexes = await readCollapsedStepIndexes(page);
  assertOrThrow(
    firstSlideCollapsedIndexes.join("|") === "0|2",
    `第一页折叠态异常：${firstSlideCollapsedIndexes.join(", ")}`,
  );

  logStep("persist collapsed state on second slide");
  await selectSlideByIndex(page, 1);
  const secondSlideCollapsedIndexesBeforeToggle = await readCollapsedStepIndexes(page);
  assertOrThrow(
    secondSlideCollapsedIndexesBeforeToggle.length === 0,
    `第二页初始不应继承第一页折叠态，实际为 ${secondSlideCollapsedIndexesBeforeToggle.join(", ")}`,
  );

  const secondSlideSecondCard = page.locator(".timeline-panel .step-card").nth(1);
  await secondSlideSecondCard.getByRole("button", { name: "收起" }).click();
  await waitForSaved(page);

  const secondSlideCollapsedIndexes = await readCollapsedStepIndexes(page);
  assertOrThrow(
    secondSlideCollapsedIndexes.join("|") === "1",
    `第二页折叠态异常：${secondSlideCollapsedIndexes.join(", ")}`,
  );

  logStep("verify cross-slide collapsed state restore");
  await selectSlideByIndex(page, 0);
  const restoredFirstSlideCollapsedIndexes = await readCollapsedStepIndexes(page);
  assertOrThrow(
    restoredFirstSlideCollapsedIndexes.join("|") === "0|2",
    `切回第一页后折叠态丢失：${restoredFirstSlideCollapsedIndexes.join(", ")}`,
  );

  await selectSlideByIndex(page, 1);
  const restoredSecondSlideCollapsedIndexes = await readCollapsedStepIndexes(page);
  assertOrThrow(
    restoredSecondSlideCollapsedIndexes.join("|") === "1",
    `切回第二页后折叠态丢失：${restoredSecondSlideCollapsedIndexes.join(", ")}`,
  );

  const projectAfterCollapse = await readPersistedProject(page, projectId);
  const collapsedStateMap =
    projectAfterCollapse?.workspaceState?.timelineCollapsedStepIdsBySlideId ?? {};
  assertOrThrow(
    JSON.stringify(collapsedStateMap[firstSlideScenario.slideId] ?? []) ===
      JSON.stringify([
        FIRST_SLIDE_SCENARIO.steps[2].id,
        FIRST_SLIDE_SCENARIO.steps[1].id,
      ]),
    `第一页持久化折叠态异常：${JSON.stringify(collapsedStateMap[firstSlideScenario.slideId] ?? [])}`,
  );
  assertOrThrow(
    JSON.stringify(collapsedStateMap[secondSlideScenario.slideId] ?? []) ===
      JSON.stringify([SECOND_SLIDE_SCENARIO.steps[1].id]),
    `第二页持久化折叠态异常：${JSON.stringify(collapsedStateMap[secondSlideScenario.slideId] ?? [])}`,
  );

  summary.checks.push({
    id: "collapsed-state-switch",
    firstSlideCollapsedStepIds: collapsedStateMap[firstSlideScenario.slideId] ?? [],
    secondSlideCollapsedStepIds: collapsedStateMap[secondSlideScenario.slideId] ?? [],
  });

  logStep("reload workspace and verify restore");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForEditorDebugBridge(page);
  await waitForSaved(page);
  await openTimelinePanel(page);

  await selectSlideByIndex(page, 0);
  const reloadedFirstSlideTitles = await readTimelineStepTitles(page);
  const reloadedFirstSlideCollapsedIndexes = await readCollapsedStepIndexes(page);
  assertOrThrow(
    reloadedFirstSlideTitles.join("|") === expectedFirstSlideTitles.join("|"),
    `刷新后第一页步骤顺序异常：${reloadedFirstSlideTitles.join(" > ")}`,
  );
  assertOrThrow(
    reloadedFirstSlideCollapsedIndexes.join("|") === "0|2",
    `刷新后第一页折叠态异常：${reloadedFirstSlideCollapsedIndexes.join(", ")}`,
  );

  await selectSlideByIndex(page, 1);
  const reloadedSecondSlideCollapsedIndexes = await readCollapsedStepIndexes(page);
  assertOrThrow(
    reloadedSecondSlideCollapsedIndexes.join("|") === "1",
    `刷新后第二页折叠态异常：${reloadedSecondSlideCollapsedIndexes.join(", ")}`,
  );

  await page.locator(".timeline-panel").screenshot({
    path: path.join(ASSET_DIR, "timeline-second-slide-after-reload.png"),
  });

  summary.checks.push({
    id: "reload-restore",
    reloadedFirstSlideTitles,
    reloadedFirstSlideCollapsedIndexes,
    reloadedSecondSlideCollapsedIndexes,
  });

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
} finally {
  await browser.close();
}
