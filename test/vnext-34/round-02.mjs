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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-29-vnext-34-b-round-01");

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext34-b-test]", label);
}

/**
 * 在条件失败时抛出更清晰的错误信息。
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
 * 读取当前编辑器中的 slide 顺序与激活态。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ activeSlideId: string | null; slides: Array<{ id: string; name: string; }>; }>}
 */
async function readSlideState(page) {
  return page.evaluate(() => {
    const snapshot = window.__CW_EDITOR_DEBUG__?.getSnapshot?.();

    return {
      activeSlideId: snapshot?.activeSlideId ?? null,
      slides: (snapshot?.document?.slides ?? []).map((slide) => ({
        id: slide.id,
        name: slide.name,
      })),
    };
  });
}

/**
 * 在指定 slide 卡片上打开右键菜单。
 *
 * @param {import("playwright").Page} page
 * @param {number} cardIndex
 * @returns {Promise<void>}
 */
async function openSlideContextMenu(page, cardIndex) {
  await page.locator(".slide-rail .slide-card-shell").nth(cardIndex).click({
    button: "right",
  });
  await page.locator(".slide-context-menu").waitFor();
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

  logStep("assert initial slide count");
  const initialState = await readSlideState(page);
  assertOrThrow(initialState.slides.length === 1, "初始空白项目应只包含 1 页");
  summary.checks.push({
    name: "initial-slide-count",
    passed: true,
    detail: initialState,
  });

  logStep("open context menu and validate actions");
  await openSlideContextMenu(page, 0);
  const contextMenu = page.locator(".slide-context-menu");
  await contextMenu.getByRole("button", { name: "后插入" }).waitFor();
  await contextMenu.getByRole("button", { name: "复制页面" }).waitFor();
  await contextMenu.getByRole("button", { name: "删除页面" }).waitFor();
  summary.checks.push({
    name: "context-menu-actions",
    passed: true,
    detail: ["后插入", "复制页面", "删除页面"],
  });

  logStep("create slide after current target");
  await contextMenu.getByRole("button", { name: "后插入" }).click();
  await page.waitForFunction(() => window.__CW_EDITOR_DEBUG__?.getSnapshot?.().document.slides.length === 2);
  await waitForSaved(page);

  const afterCreateState = await readSlideState(page);
  assertOrThrow(afterCreateState.slides.length === 2, "后插入后页面数量应变为 2");
  assertOrThrow(
    afterCreateState.activeSlideId === afterCreateState.slides[1]?.id,
    "后插入后新页面应被自动激活并插入到目标页之后",
  );
  summary.checks.push({
    name: "create-after",
    passed: true,
    detail: afterCreateState,
  });

  logStep("duplicate first slide from context menu");
  await openSlideContextMenu(page, 0);
  await page.locator(".slide-context-menu").getByRole("button", { name: "复制页面" }).click();
  await page.waitForFunction(() => window.__CW_EDITOR_DEBUG__?.getSnapshot?.().document.slides.length === 3);
  await waitForSaved(page);

  const afterDuplicateState = await readSlideState(page);
  const duplicatedSlideId = afterDuplicateState.slides[1]?.id ?? null;
  assertOrThrow(afterDuplicateState.slides.length === 3, "复制页面后页面数量应变为 3");
  assertOrThrow(
    afterDuplicateState.activeSlideId === duplicatedSlideId,
    "复制页面后副本应插入到源页之后并自动激活",
  );
  summary.checks.push({
    name: "duplicate-slide",
    passed: true,
    detail: afterDuplicateState,
  });

  logStep("delete duplicated slide with confirm modal");
  await openSlideContextMenu(page, 1);
  await page.locator(".slide-context-menu").getByRole("button", { name: "删除页面" }).click();
  const deleteModal = page.locator(".arco-modal").filter({
    hasText: "删除页面",
  }).last();
  await deleteModal.waitFor();
  await deleteModal.getByRole("button", { name: "确认删除" }).click();
  await page.waitForFunction(() => window.__CW_EDITOR_DEBUG__?.getSnapshot?.().document.slides.length === 2);
  await waitForSaved(page);

  const afterDeleteState = await readSlideState(page);
  assertOrThrow(afterDeleteState.slides.length === 2, "删除页面后页面数量应回到 2");
  assertOrThrow(
    !afterDeleteState.slides.some((slide) => slide.id === duplicatedSlideId),
    "删除确认后不应再保留刚才的复制页",
  );
  summary.checks.push({
    name: "delete-slide-confirm",
    passed: true,
    detail: afterDeleteState,
  });

  logStep("ensure drag reorder still works");
  const orderBeforeReorder = afterDeleteState.slides.map((slide) => slide.id);
  await page.locator(".slide-rail .slide-card-shell").nth(1).dragTo(
    page.locator(".slide-rail .slide-card-shell").nth(0),
  );
  await page.waitForFunction((expectedSecondId) => {
    const snapshot = window.__CW_EDITOR_DEBUG__?.getSnapshot?.();
    return snapshot?.document?.slides?.[0]?.id === expectedSecondId;
  }, orderBeforeReorder[1]);
  await waitForSaved(page);

  const afterReorderState = await readSlideState(page);
  assertOrThrow(
    afterReorderState.slides[0]?.id === orderBeforeReorder[1],
    "拖拽排序后，第二页应成功移动到第一页位置",
  );
  summary.checks.push({
    name: "drag-reorder-after-context-menu",
    passed: true,
    detail: {
      before: orderBeforeReorder,
      after: afterReorderState.slides.map((slide) => slide.id),
      activeSlideId: afterReorderState.activeSlideId,
    },
  });

  assertOrThrow(consoleErrors.length === 0, `存在控制台错误: ${consoleErrors.join(" | ")}`);
  assertOrThrow(pageErrors.length === 0, `存在页面运行时错误: ${pageErrors.join(" | ")}`);
  summary.result = "passed";
} catch (error) {
  summary.result = "failed";
  summary.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
