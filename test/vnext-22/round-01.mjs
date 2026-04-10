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
/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-10-vnext-22-round-01");
/** 用于在画布中稳定生成图片节点的最小 PNG 资源。 */
const SAMPLE_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pSkeBYAAAAASUVORK5CYII=";

/**
 * 打印当前测试阶段。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext22-test]", label);
}

/**
 * 从项目记录中读取首页 slide。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readFirstSlide(project) {
  return project?.document?.slides?.[0] ?? null;
}

/**
 * 把 slide 中当前时间轴状态规整成便于断言的结构。
 *
 * @param {any | null} slide
 * @returns {{
 *   stepCount: number;
 *   animationCount: number;
 *   animationIds: string[];
 *   animationTargets: string[];
 *   steps: Array<{
 *     id: string;
 *     name: string;
 *     triggerType: string;
 *     triggerTargetId: string | null;
 *     actionCount: number;
 *     actionTargets: string[];
 *     actionAnimationIds: string[];
 *   }>;
 * }}
 */
function summarizeTimeline(slide) {
  const timeline = slide?.timeline ?? {
    steps: [],
    animations: [],
  };

  return {
    stepCount: timeline.steps.length,
    animationCount: timeline.animations.length,
    animationIds: timeline.animations.map((animation) => animation.id),
    animationTargets: timeline.animations.map((animation) => animation.targetId),
    steps: timeline.steps.map((step) => ({
      id: step.id,
      name: step.name,
      triggerType: step.trigger.type,
      triggerTargetId: step.trigger.type === "node-click" ? step.trigger.targetId : null,
      actionCount: step.actions.length,
      actionTargets: step.actions
        .map((action) => ("targetId" in action ? action.targetId : null))
        .filter(Boolean),
      actionAnimationIds: step.actions
        .map((action) => ("animationId" in action ? action.animationId ?? null : null))
        .filter(Boolean),
    })),
  };
}

/**
 * 断言当前时间轴中不再保留某个节点的任何引用。
 *
 * @param {ReturnType<typeof summarizeTimeline>} timelineSummary
 * @param {string} nodeId
 * @param {string} label
 */
function assertNodeReferenceRemoved(timelineSummary, nodeId, label) {
  if (timelineSummary.animationTargets.includes(nodeId)) {
    throw new Error(`${label}: timeline animation target 仍引用已删除节点 ${nodeId}`);
  }

  const hasStepReference = timelineSummary.steps.some(
    (step) =>
      step.triggerTargetId === nodeId || step.actionTargets.some((targetId) => targetId === nodeId),
  );
  if (hasStepReference) {
    throw new Error(`${label}: timeline step 仍引用已删除节点 ${nodeId}`);
  }
}

/**
 * 断言当前时间轴中不再保留某个动画 id 的任何引用。
 *
 * @param {ReturnType<typeof summarizeTimeline>} timelineSummary
 * @param {string} animationId
 * @param {string} label
 */
function assertAnimationReferenceRemoved(timelineSummary, animationId, label) {
  if (timelineSummary.animationIds.includes(animationId)) {
    throw new Error(`${label}: timeline animation 列表仍保留已失效动画 ${animationId}`);
  }

  const hasActionReference = timelineSummary.steps.some((step) =>
    step.actionAnimationIds.some((currentAnimationId) => currentAnimationId === animationId),
  );
  if (hasActionReference) {
    throw new Error(`${label}: timeline action 仍引用已失效动画 ${animationId}`);
  }
}

/**
 * 断言当前时间轴不存在空步骤。
 *
 * @param {ReturnType<typeof summarizeTimeline>} timelineSummary
 * @param {string} label
 */
function assertNoEmptySteps(timelineSummary, label) {
  if (timelineSummary.steps.some((step) => step.actionCount === 0)) {
    throw new Error(`${label}: 仍存在 0 个动作的空步骤`);
  }
}

/**
 * 等待编辑器调试桥暴露完成，便于脚本直接调用标准 controller。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function waitForEditorDebugBridge(page) {
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
}

/**
 * 通过编辑器调试桥批量写入节点、动画与步骤，快速搭建回归场景。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{
 *   slideId: string;
 *   nodeIds: Record<string, string>;
 *   animationIds: Record<string, string>;
 * }>}
 */
async function seedTimelineCleanupScenario(page) {
  return page.evaluate((imageDataUrl) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法搭建 VNext-22 场景");
    }

    const controller = debugBridge.getController();
    const commandTypes = debugBridge.getCommandTypes();
    const snapshot = debugBridge.getSnapshot();
    const slideId = snapshot.activeSlideId;
    if (!slideId) {
      throw new Error("当前项目没有可编辑的 slide");
    }

    const createId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
    const currentSlide = snapshot.document.slides.find((slide) => slide.id === slideId);
    if (!currentSlide) {
      throw new Error("未找到当前激活的 slide");
    }

    const createTextNode = (name, text, x, y) => ({
      id: createId("node"),
      type: "text",
      name,
      x,
      y,
      width: 280,
      height: 72,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      props: {
        text,
        fontSize: 30,
        color: "#172033",
        fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
        lineHeight: 1.5,
        textAlign: "left",
      },
    });

    const createImageNode = (name, x, y) => ({
      id: createId("node"),
      type: "image",
      name,
      x,
      y,
      width: 260,
      height: 180,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      props: {
        src: imageDataUrl,
        alt: `${name}.png`,
        objectFit: "contain",
      },
    });

    const createRectNode = (name, x, y) => ({
      id: createId("node"),
      type: "rect",
      name,
      x,
      y,
      width: 220,
      height: 140,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      props: {
        fill: "#DCE8FF",
        stroke: "#4B7BE5",
        strokeWidth: 1,
        radius: 16,
      },
    });

    const nodes = {
      imagePrimary: createImageNode("主图", 120, 120),
      textPrimary: createTextNode("主文案", "删除主图后，这个步骤应继续保留。", 440, 120),
      batchText: createTextNode("批量文本", "批量删除后，这个步骤应该整体消失。", 420, 320),
      batchRect: createRectNode("批量矩形", 760, 300),
      imageBackground: createImageNode("背景候选", 120, 390),
    };

    Object.values(nodes).forEach((node, index) => {
      controller.execute({
        type: commandTypes.NODE_CREATE,
        slideId,
        node,
        index: currentSlide.nodes.length + index,
      });
    });

    const animations = {
      imagePrimary: {
        id: createId("animation"),
        targetId: nodes.imagePrimary.id,
        kind: "fade",
        durationMs: 420,
      },
      imageBackground: {
        id: createId("animation"),
        targetId: nodes.imageBackground.id,
        kind: "appear",
        durationMs: 300,
      },
    };

    Object.values(animations).forEach((animation) => {
      controller.execute({
        type: commandTypes.TIMELINE_ANIMATION_UPSERT,
        slideId,
        animation,
      });
    });

    const steps = [
      {
        id: createId("step"),
        name: "对象触发步骤",
        trigger: {
          type: "node-click",
          targetId: nodes.imagePrimary.id,
        },
        actions: [
          {
            id: createId("action"),
            type: "show-node",
            targetId: nodes.textPrimary.id,
          },
        ],
      },
      {
        id: createId("step"),
        name: "图片动作步骤",
        trigger: {
          type: "page-click",
        },
        actions: [
          {
            id: createId("action"),
            type: "show-node",
            targetId: nodes.imagePrimary.id,
            animationId: animations.imagePrimary.id,
          },
        ],
      },
      {
        id: createId("step"),
        name: "混合动作步骤",
        trigger: {
          type: "page-click",
        },
        actions: [
          {
            id: createId("action"),
            type: "show-node",
            targetId: nodes.imagePrimary.id,
          },
          {
            id: createId("action"),
            type: "show-node",
            targetId: nodes.textPrimary.id,
          },
        ],
      },
      {
        id: createId("step"),
        name: "批量删除步骤",
        trigger: {
          type: "page-click",
        },
        actions: [
          {
            id: createId("action"),
            type: "show-node",
            targetId: nodes.batchText.id,
          },
          {
            id: createId("action"),
            type: "show-node",
            targetId: nodes.batchRect.id,
          },
        ],
      },
      {
        id: createId("step"),
        name: "背景转换步骤",
        trigger: {
          type: "node-click",
          targetId: nodes.imageBackground.id,
        },
        actions: [
          {
            id: createId("action"),
            type: "show-node",
            targetId: nodes.imageBackground.id,
            animationId: animations.imageBackground.id,
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
      nodeIds: Object.fromEntries(
        Object.entries(nodes).map(([key, node]) => [key, node.id]),
      ),
      animationIds: Object.fromEntries(
        Object.entries(animations).map(([key, animation]) => [key, animation.id]),
      ),
    };
  }, SAMPLE_IMAGE_DATA_URL);
}

/**
 * 通过标准 controller 设置当前编辑器 selection。
 *
 * @param {import("playwright").Page} page
 * @param {string} slideId
 * @param {string[]} nodeIds
 * @returns {Promise<void>}
 */
async function setSelection(page, slideId, nodeIds) {
  await page.evaluate(({ activeSlideId, activeNodeIds }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥缺失，无法设置 selection");
    }

    const commandTypes = debugBridge.getCommandTypes();
    debugBridge.getController().execute({
      type: commandTypes.SELECTION_SET,
      slideId: activeSlideId,
      nodeIds: activeNodeIds,
    });
  }, {
    activeSlideId: slideId,
    activeNodeIds: nodeIds,
  });
}

/**
 * 读取当前时间轴面板中的步骤卡片数量。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<number>}
 */
async function readTimelinePanelStepCount(page) {
  return page.locator(".timeline-panel .step-card").count();
}

/**
 * 读取编辑区画布本地坐标对应的真实点击位置。
 *
 * @param {import("playwright").Page} page
 * @param {number} localX
 * @param {number} localY
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function resolveCanvasViewportPoint(page, localX, localY) {
  return page.locator(".stage-surface").evaluate((element, point) => {
    const rect = element.getBoundingClientRect();
    const canvas = element.querySelector("canvas");
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
 * 根据节点几何信息返回稳定命中节点内部的点击点。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} node
 * @returns {Promise<{ x: number; y: number; }>}
 */
async function resolveNodePoint(page, node) {
  const localX = node.x + Math.max(Math.round(node.width / 2), 24);
  const localY = node.y + Math.max(Math.round(node.height / 2), 24);
  return resolveCanvasViewportPoint(page, localX, localY);
}

/**
 * 在指定节点位置触发右键菜单。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number; }} node
 * @returns {Promise<void>}
 */
async function openNodeContextMenu(page, node) {
  const point = await resolveNodePoint(page, node);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page.locator(".stage-context-menu").waitFor();
}

/**
 * 在“设为背景”确认弹层中选择目标填充方式并完成确认。
 *
 * @param {import("playwright").Page} page
 * @param {string} optionLabel
 * @returns {Promise<string>}
 */
async function confirmBackgroundFit(page, optionLabel) {
  const modal = page.locator(".background-fit-modal");
  await modal.waitFor();
  const modalText = normalizeInlineText(await modal.textContent());

  await modal.getByRole("button", { name: new RegExp(optionLabel) }).click();
  await modal.getByRole("button", { name: "确认设为背景" }).click();

  return modalText;
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
  await waitForSaved(page);
  await waitForEditorDebugBridge(page);

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";
  await page.getByLabel("展开右侧管理栏").click();
  await page.locator(".side-tabs-nav").waitFor();
  await page.locator(".side-tabs-nav .arco-tabs-tab").filter({ hasText: "时间轴" }).click();
  await page.locator(".timeline-panel").waitFor();

  logStep("seed timeline cleanup scenario");
  const scenario = await seedTimelineCleanupScenario(page);
  await waitForSaved(page);

  const projectsAfterSeed = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterSeed = findProjectById(projectsAfterSeed, projectId);
  const slideAfterSeed = readFirstSlide(projectAfterSeed);
  const initialTimelineSummary = summarizeTimeline(slideAfterSeed);
  const initialTimelinePanelStepCount = await readTimelinePanelStepCount(page);

  summary.checks.push({
    id: "seed-scenario",
    projectId,
    nodeIds: scenario.nodeIds,
    animationIds: scenario.animationIds,
    timelinePanelStepCount: initialTimelinePanelStepCount,
    timeline: initialTimelineSummary,
  });

  if (initialTimelineSummary.stepCount !== 5 || initialTimelinePanelStepCount !== 5) {
    throw new Error("VNext-22 场景初始化失败：预期 5 个步骤，但编辑器未正确写入");
  }

  logStep("single delete should clear trigger/action/animation references");
  await setSelection(page, scenario.slideId, [scenario.nodeIds.imagePrimary]);
  await openNodeContextMenu(page, slideAfterSeed.nodes.find((node) => node.id === scenario.nodeIds.imagePrimary));
  await page.getByRole("button", { name: "删除所选" }).click();
  await waitForSaved(page);

  const projectsAfterSingleDelete = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterSingleDelete = findProjectById(projectsAfterSingleDelete, projectId);
  const slideAfterSingleDelete = readFirstSlide(projectAfterSingleDelete);
  const singleDeleteTimelineSummary = summarizeTimeline(slideAfterSingleDelete);
  const singleDeleteTimelinePanelStepCount = await readTimelinePanelStepCount(page);

  assertNodeReferenceRemoved(
    singleDeleteTimelineSummary,
    scenario.nodeIds.imagePrimary,
    "single-delete",
  );
  assertAnimationReferenceRemoved(
    singleDeleteTimelineSummary,
    scenario.animationIds.imagePrimary,
    "single-delete",
  );
  assertNoEmptySteps(singleDeleteTimelineSummary, "single-delete");

  if (singleDeleteTimelineSummary.stepCount !== 3 || singleDeleteTimelinePanelStepCount !== 3) {
    throw new Error("single-delete: 预期删除主图后剩余 3 个步骤");
  }

  summary.checks.push({
    id: "single-delete-cleanup",
    timelinePanelStepCount: singleDeleteTimelinePanelStepCount,
    timeline: singleDeleteTimelineSummary,
  });

  logStep("batch delete should remove empty step");
  await setSelection(page, scenario.slideId, [
    scenario.nodeIds.batchText,
    scenario.nodeIds.batchRect,
  ]);
  await page.keyboard.press("Delete");
  await waitForSaved(page);

  const projectsAfterBatchDelete = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterBatchDelete = findProjectById(projectsAfterBatchDelete, projectId);
  const slideAfterBatchDelete = readFirstSlide(projectAfterBatchDelete);
  const batchDeleteTimelineSummary = summarizeTimeline(slideAfterBatchDelete);
  const batchDeleteTimelinePanelStepCount = await readTimelinePanelStepCount(page);

  assertNodeReferenceRemoved(
    batchDeleteTimelineSummary,
    scenario.nodeIds.batchText,
    "batch-delete",
  );
  assertNodeReferenceRemoved(
    batchDeleteTimelineSummary,
    scenario.nodeIds.batchRect,
    "batch-delete",
  );
  assertNoEmptySteps(batchDeleteTimelineSummary, "batch-delete");

  if (batchDeleteTimelineSummary.stepCount !== 2 || batchDeleteTimelinePanelStepCount !== 2) {
    throw new Error("batch-delete: 预期批量删除后剩余 2 个步骤");
  }

  summary.checks.push({
    id: "batch-delete-cleanup",
    timelinePanelStepCount: batchDeleteTimelinePanelStepCount,
    timeline: batchDeleteTimelineSummary,
  });

  logStep("set as background should clear node references too");
  await setSelection(page, scenario.slideId, [scenario.nodeIds.imageBackground]);
  await openNodeContextMenu(
    page,
    slideAfterBatchDelete.nodes.find((node) => node.id === scenario.nodeIds.imageBackground),
  );
  await page.getByRole("button", { name: "设为背景" }).click();
  const fitModalText = await confirmBackgroundFit(page, "完整显示");
  await page.locator(".slide-settings-drawer .slide-settings-panel").waitFor();
  await waitForSaved(page);

  const projectsAfterBackground = await readStoredProjects(page, STORAGE_KEY);
  const projectAfterBackground = findProjectById(projectsAfterBackground, projectId);
  const slideAfterBackground = readFirstSlide(projectAfterBackground);
  const backgroundTimelineSummary = summarizeTimeline(slideAfterBackground);
  const backgroundTimelinePanelStepCount = await readTimelinePanelStepCount(page);

  assertNodeReferenceRemoved(
    backgroundTimelineSummary,
    scenario.nodeIds.imageBackground,
    "set-background",
  );
  assertAnimationReferenceRemoved(
    backgroundTimelineSummary,
    scenario.animationIds.imageBackground,
    "set-background",
  );
  assertNoEmptySteps(backgroundTimelineSummary, "set-background");

  if (backgroundTimelineSummary.stepCount !== 1 || backgroundTimelinePanelStepCount !== 1) {
    throw new Error("set-background: 预期转换背景后只剩 1 个步骤");
  }

  summary.checks.push({
    id: "set-background-cleanup",
    fitModalText,
    timelinePanelStepCount: backgroundTimelinePanelStepCount,
    timeline: backgroundTimelineSummary,
    backgroundImageFit: slideAfterBackground?.background?.image?.fit ?? null,
    hasBackgroundImage: Boolean(slideAfterBackground?.background?.image?.src),
  });

  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-cleanup.json"),
    projectAfterBackground,
  );

  const slideSettingsDrawerCloseButton = page.locator(
    ".slide-settings-drawer .arco-drawer-close-btn",
  );
  if ((await slideSettingsDrawerCloseButton.count()) > 0) {
    await slideSettingsDrawerCloseButton.click();
    await page.waitForTimeout(200);
  }

  logStep("preview should consume cleaned timeline without stale steps");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();

  const previewStepCardCount = await page.locator(".preview-step-card").count();
  if (previewStepCardCount !== 1) {
    throw new Error(`preview-cleanup: 预期预览侧栏只展示 1 个步骤，实际为 ${previewStepCardCount}`);
  }

  await page.locator(".preview-stage-surface").click({
    position: {
      x: 32,
      y: 32,
    },
  });
  await page.waitForTimeout(300);

  const previewDoneStepCount = await page.locator(".preview-step-card.is-done").count();
  if (previewDoneStepCount !== 1) {
    throw new Error("preview-cleanup: 页面点击后剩余步骤未正常完成");
  }

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-after-cleanup.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "preview-cleanup",
    previewStepCardCount,
    previewDoneStepCount,
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("VNext-22 preview cleanup: 预览链路出现控制台或运行时错误");
  }
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
