import path from "node:path";
import { Buffer } from "node:buffer";
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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-29-vnext-33-f-round-01");

/** 新建页应继承的画布宽度。 */
const INHERITED_SLIDE_WIDTH = 1024;

/** 新建页应继承的画布高度。 */
const INHERITED_SLIDE_HEIGHT = 576;

/** 新建页应继承的背景色。 */
const INHERITED_BACKGROUND_FILL = "#d7f4ea";

/** 新建页应继承的背景图填充方式。 */
const INHERITED_BACKGROUND_FIT = "contain";

/** 用于验证背景继承的内联 SVG 背景图。 */
const INHERITED_BACKGROUND_IMAGE = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
    <rect width="240" height="160" fill="#d7f4ea"/>
    <circle cx="68" cy="82" r="42" fill="#34d399"/>
    <circle cx="172" cy="74" r="34" fill="#0f766e" opacity="0.86"/>
    <rect x="52" y="112" width="136" height="16" rx="8" fill="#0f766e" opacity="0.16"/>
  </svg>`,
).toString("base64")}`;

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext33-f-test]", label);
}

/**
 * 在条件不满足时抛出可读性更好的错误信息。
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
 * 统一规整颜色值大小写，避免不同写回链路的十六进制大小写差异影响断言。
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
function normalizeColorValue(value) {
  return value?.trim().toUpperCase() ?? "";
}

/**
 * 从本地存储读取目标项目。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<any | null>}
 */
async function readPersistedProject(page, projectId) {
  return findProjectById(await readStoredProjects(page, STORAGE_KEY), projectId);
}

/**
 * 读取当前编辑器标准快照。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<any | null>}
 */
async function readEditorSnapshot(page) {
  return page.evaluate(() => window.__CW_EDITOR_DEBUG__?.getSnapshot?.() ?? null);
}

/**
 * 读取当前激活页 id。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string | null>}
 */
async function readActiveSlideId(page) {
  const snapshot = await readEditorSnapshot(page);
  return snapshot?.activeSlideId ?? null;
}

/**
 * 基于 slide id 返回当前项目中的页面快照。
 *
 * @param {any | null} project
 * @param {string | null} slideId
 * @returns {any | null}
 */
function findSlideById(project, slideId) {
  if (!slideId) {
    return null;
  }

  return project?.document?.slides?.find((slide) => slide.id === slideId) ?? null;
}

/**
 * 通过标准命令层把当前激活页设置成带尺寸和背景图的基准页。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function updateActiveSlideBaseConfig(page) {
  await page.evaluate((payload) => {
    const bridge = window.__CW_EDITOR_DEBUG__;
    if (!bridge) {
      throw new Error("未找到编辑器调试桥，无法设置页面基准配置。");
    }

    const snapshot = bridge.getSnapshot();
    const activeSlideId = snapshot.activeSlideId;
    const activeSlide = snapshot.document.slides.find((slide) => slide.id === activeSlideId);
    if (!activeSlideId || !activeSlide) {
      throw new Error("当前没有激活页，无法设置页面基准配置。");
    }

    bridge.getController().execute({
      type: bridge.getCommandTypes().SLIDE_UPDATE,
      slideId: activeSlideId,
      patch: {
        size: {
          width: payload.width,
          height: payload.height,
        },
        background: {
          ...activeSlide.background,
          fill: payload.fill,
          image: {
            src: payload.image,
            fit: payload.fit,
          },
        },
      },
    });
  }, {
    width: INHERITED_SLIDE_WIDTH,
    height: INHERITED_SLIDE_HEIGHT,
    fill: INHERITED_BACKGROUND_FILL,
    image: INHERITED_BACKGROUND_IMAGE,
    fit: INHERITED_BACKGROUND_FIT,
  });
}

/**
 * 点击左侧页面栏中的指定页序卡片，并等待其成为激活页。
 *
 * @param {import("playwright").Page} page
 * @param {number} index
 * @returns {Promise<void>}
 */
async function activateSlideByIndex(page, index) {
  const slideShell = page.locator(".slide-list .slide-card-shell").nth(index);
  await slideShell.locator(".slide-card").click();
  await page.waitForFunction((targetIndex) => {
    const shells = Array.from(document.querySelectorAll(".slide-list .slide-card-shell"));
    return shells[targetIndex]?.classList.contains("is-active") ?? false;
  }, index);
}

/**
 * 拖拽左侧页面栏中的某一页到目标页位置。
 *
 * @param {import("playwright").Page} page
 * @param {number} sourceIndex
 * @param {number} targetIndex
 * @returns {Promise<void>}
 */
async function dragSlideToIndex(page, sourceIndex, targetIndex) {
  const didDispatch = await page.evaluate(({ fromIndex, toIndex }) => {
    const slideShells = Array.from(document.querySelectorAll(".slide-list .slide-card-shell"));
    const sourceShell = slideShells[fromIndex];
    const targetShell = slideShells[toIndex];

    if (!(sourceShell instanceof HTMLElement) || !(targetShell instanceof HTMLElement)) {
      return false;
    }

    const targetBounds = targetShell.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    const clientX = targetBounds.left + targetBounds.width / 2;
    const clientY = targetBounds.bottom - 6;

    sourceShell.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }),
    );
    targetShell.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX,
        clientY,
      }),
    );
    targetShell.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX,
        clientY,
      }),
    );
    sourceShell.dispatchEvent(
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
  });

  assertOrThrow(didDispatch, "未找到可拖拽的页面卡片，无法执行拖拽排序。");
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
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
  await waitForSaved(page);

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";
  const sourceSlideId = await readActiveSlideId(page);

  logStep("insert a text node for duplicate baseline");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);

  logStep("set active slide base config");
  await updateActiveSlideBaseConfig(page);
  await waitForSaved(page);

  logStep("create first follow-up slide");
  await page.getByRole("button", { name: "新建页面" }).click();
  await waitForSaved(page);
  const firstCreatedSlideId = await readActiveSlideId(page);

  logStep("reactivate first slide and create next page from current context");
  await activateSlideByIndex(page, 0);
  await page.getByRole("button", { name: "新建页面" }).click();
  await waitForSaved(page);

  const insertedSlideId = await readActiveSlideId(page);
  const projectAfterSecondCreate = await readPersistedProject(page, projectId);
  const slidesAfterSecondCreate = projectAfterSecondCreate?.document?.slides ?? [];
  const sourceSlideAfterSecondCreate = findSlideById(projectAfterSecondCreate, sourceSlideId);
  const insertedSlide = findSlideById(projectAfterSecondCreate, insertedSlideId);

  assertOrThrow(
    slidesAfterSecondCreate.length === 3,
    `二次新建后页面数量异常，期望 3 页，实际 ${slidesAfterSecondCreate.length} 页。`,
  );
  assertOrThrow(
    slidesAfterSecondCreate[1]?.id === insertedSlideId,
    "顶部“新建页面”没有插入到当前激活页之后。",
  );
  assertOrThrow(
    slidesAfterSecondCreate[2]?.id === firstCreatedSlideId,
    "顶部“新建页面”后，原有后续页面没有顺延到新页之后。",
  );
  assertOrThrow(
    insertedSlide?.size?.width === sourceSlideAfterSecondCreate?.size?.width &&
      insertedSlide?.size?.height === sourceSlideAfterSecondCreate?.size?.height,
    "快速新建页没有继承当前页的画布尺寸。",
  );
  assertOrThrow(
    normalizeColorValue(insertedSlide?.background?.fill) ===
      normalizeColorValue(sourceSlideAfterSecondCreate?.background?.fill),
    "快速新建页没有继承当前页的背景色。",
  );
  assertOrThrow(
    insertedSlide?.background?.image?.src === sourceSlideAfterSecondCreate?.background?.image?.src &&
      insertedSlide?.background?.image?.fit === sourceSlideAfterSecondCreate?.background?.image?.fit,
    "快速新建页没有继承当前页的背景图配置。",
  );
  assertOrThrow(
    (insertedSlide?.nodes?.length ?? 0) === 0,
    "快速新建页错误复制了页面对象内容，期望为空白页。",
  );

  summary.checks.push({
    id: "quick-create-after-active-slide",
    sourceSlideId,
    firstCreatedSlideId,
    insertedSlideId,
    slideOrder: slidesAfterSecondCreate.map((slide) => slide.id),
    inheritedBackgroundFit: insertedSlide?.background?.image?.fit ?? null,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-quick-create.png"),
    fullPage: true,
  });

  logStep("duplicate current first slide and verify immediate thumbnail reuse");
  await activateSlideByIndex(page, 0);
  await page
    .locator(".slide-list .slide-card-shell")
    .nth(0)
    .getByRole("button", { name: "复制" })
    .click();

  await page.waitForFunction(() => {
    const activeCard = document.querySelector(".slide-list .slide-card-shell.is-active");
    if (!(activeCard instanceof HTMLElement)) {
      return false;
    }

    return activeCard.querySelectorAll(".thumb-line").length === 0;
  });

  const duplicateSlideId = await readActiveSlideId(page);
  await waitForSaved(page);
  const projectAfterDuplicate = await readPersistedProject(page, projectId);
  const slidesAfterDuplicate = projectAfterDuplicate?.document?.slides ?? [];
  const sourceSlide = findSlideById(projectAfterDuplicate, sourceSlideId);
  const duplicateSlide = findSlideById(projectAfterDuplicate, duplicateSlideId);

  assertOrThrow(
    slidesAfterDuplicate.length === 4,
    `复制页面后数量异常，期望 4 页，实际 ${slidesAfterDuplicate.length} 页。`,
  );
  assertOrThrow(
    slidesAfterDuplicate[1]?.id === duplicateSlideId,
    "复制页没有插入到源页之后。",
  );
  assertOrThrow(
    (duplicateSlide?.nodes?.length ?? 0) === (sourceSlide?.nodes?.length ?? 0),
    "复制页没有保留源页对象内容。",
  );
  assertOrThrow(
    normalizeColorValue(duplicateSlide?.background?.fill) ===
      normalizeColorValue(sourceSlide?.background?.fill) &&
      duplicateSlide?.background?.image?.src === sourceSlide?.background?.image?.src &&
      duplicateSlide?.background?.image?.fit === sourceSlide?.background?.image?.fit,
    "复制页没有保留源页背景配置。",
  );

  summary.checks.push({
    id: "duplicate-slide-after-source",
    sourceSlideId,
    duplicateSlideId,
    nodeCount: duplicateSlide?.nodes?.length ?? null,
    duplicateName: duplicateSlide?.name ?? null,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-duplicate.png"),
    fullPage: true,
  });

  logStep("drag duplicated slide to the end");
  await dragSlideToIndex(page, 1, 3);
  await waitForSaved(page);

  const projectAfterReorder = await readPersistedProject(page, projectId);
  const slidesAfterReorder = projectAfterReorder?.document?.slides ?? [];
  assertOrThrow(
    slidesAfterReorder[3]?.id === duplicateSlideId,
    "拖拽排序后，复制页没有移动到末尾。",
  );

  summary.checks.push({
    id: "drag-reorder-slide",
    finalOrder: slidesAfterReorder.map((slide) => slide.id),
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reorder.png"),
    fullPage: true,
  });

  logStep("reload workspace and verify persistence");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);

  const projectAfterReload = await readPersistedProject(page, projectId);
  const slidesAfterReload = projectAfterReload?.document?.slides ?? [];
  assertOrThrow(
    JSON.stringify(slidesAfterReload.map((slide) => slide.id)) ===
      JSON.stringify(slidesAfterReorder.map((slide) => slide.id)),
    "刷新后页面顺序与刷新前不一致。",
  );

  summary.checks.push({
    id: "reload-persistence",
    reloadedOrder: slidesAfterReload.map((slide) => slide.id),
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload.png"),
    fullPage: true,
  });

  logStep("switch to preview mode and verify slide count");
  await page.locator(".workspace-mode-switch").getByText("预览", { exact: true }).click();
  await page.locator(".preview-shell").waitFor();
  const previewSlideCards = page.locator(".preview-rail .slide-card");
  const previewSlideCount = await previewSlideCards.count();

  assertOrThrow(
    previewSlideCount === slidesAfterReload.length,
    `预览态页面数量异常，期望 ${slidesAfterReload.length} 页，实际 ${previewSlideCount} 页。`,
  );

  await previewSlideCards.nth(previewSlideCount - 1).click();
  await page.waitForFunction((targetIndex) => {
    const previewCards = Array.from(document.querySelectorAll(".preview-rail .slide-card"));
    return previewCards[targetIndex]?.classList.contains("is-active") ?? false;
  }, previewSlideCount - 1);

  summary.checks.push({
    id: "preview-slide-rail-sync",
    previewSlideCount,
    activatedPreviewIndex: previewSlideCount - 1,
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("页面存在控制台错误或运行时错误，详见测试结果摘要。");
  }
} finally {
  summary.completedAt = new Date().toISOString();
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
