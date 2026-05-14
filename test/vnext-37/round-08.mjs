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
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-14-vnext-37-g-round-01");

/**
 * 打印当前测试阶段，便于定位执行进度。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext37-g-test]", label);
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
 * 读取页面栏第一张卡片的结构与密度指标。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{
 *   cardHeight: number | null;
 *   thumbnailHeight: number | null;
 *   hoverHintOpacity: number | null;
 *   hasLegacyHint: boolean;
 *   hasPersistentManagePill: boolean;
 *   placeholderText: string | null;
 * }>}
 */
async function readPrimaryCardMetrics(page) {
  return page.evaluate(() => {
    const shellElement = document.querySelector(".slide-rail .slide-card-shell");
    const thumbnailElement = shellElement?.querySelector(".slide-thumbnail");
    const hoverHintElement = shellElement?.querySelector(".slide-card-hover-hint");
    const placeholderElement = shellElement?.querySelector(".slide-thumbnail-placeholder-copy");
    const shellRect = shellElement?.getBoundingClientRect() ?? null;
    const thumbnailRect = thumbnailElement?.getBoundingClientRect() ?? null;
    const hoverHintOpacity = hoverHintElement
      ? Number.parseFloat(window.getComputedStyle(hoverHintElement).opacity)
      : null;

    return {
      cardHeight: shellRect ? Number(shellRect.height.toFixed(2)) : null,
      thumbnailHeight: thumbnailRect ? Number(thumbnailRect.height.toFixed(2)) : null,
      hoverHintOpacity: Number.isFinite(hoverHintOpacity) ? hoverHintOpacity : null,
      hasLegacyHint: Boolean(shellElement?.querySelector(".slide-card-hint")),
      hasPersistentManagePill: Boolean(
        Array.from(shellElement?.querySelectorAll(".slide-state-pill") ?? []).some((element) =>
          element.textContent?.includes("右键管理"),
        ),
      ),
      placeholderText: placeholderElement?.textContent?.trim() ?? null,
    };
  });
}

/**
 * 读取指定页面卡片 hover 提示的透明度。
 *
 * @param {import("playwright").Page} page
 * @param {number} cardIndex
 * @returns {Promise<number | null>}
 */
async function readHoverHintOpacity(page, cardIndex) {
  return page.locator(".slide-rail .slide-card-shell").nth(cardIndex).evaluate((element) => {
    const hintElement = element.querySelector(".slide-card-hover-hint");
    if (!(hintElement instanceof HTMLElement)) {
      return null;
    }

    return Number.parseFloat(window.getComputedStyle(hintElement).opacity);
  });
}

/**
 * 读取当前编辑器中的 slide 顺序与名称。
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

/**
 * 读取指定页面卡片头部文本，确认未激活态不再常驻“右键管理”。
 *
 * @param {import("playwright").Page} page
 * @param {number} cardIndex
 * @returns {Promise<string | null>}
 */
async function readSlideCardTopText(page, cardIndex) {
  return page
    .locator(".slide-rail .slide-card-shell .slide-card-top")
    .nth(cardIndex)
    .textContent();
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

  logStep("create blank project and enter edit workspace");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));
  await waitForSaved(page);

  logStep("validate compact slide card structure");
  const primaryCardMetrics = await readPrimaryCardMetrics(page);
  summary.checks.push({
    id: "primary-card-metrics",
    metrics: primaryCardMetrics,
  });

  assertOrThrow(
    typeof primaryCardMetrics.cardHeight === "number" && primaryCardMetrics.cardHeight <= 132,
    `页面卡片高度仍未压缩到预期范围，当前为 ${primaryCardMetrics.cardHeight}`,
  );
  assertOrThrow(
    typeof primaryCardMetrics.thumbnailHeight === "number" &&
      primaryCardMetrics.thumbnailHeight <= 76,
    `页面缩略图高度未压缩到预期范围，当前为 ${primaryCardMetrics.thumbnailHeight}`,
  );
  assertOrThrow(!primaryCardMetrics.hasLegacyHint, "旧的常驻页面卡片提示节点仍然存在");
  assertOrThrow(
    !primaryCardMetrics.hasPersistentManagePill,
    "未激活页仍然保留“右键管理”常驻状态标签",
  );
  assertOrThrow(
    primaryCardMetrics.placeholderText === "暂无预览",
    `无缩略图占位文案异常，当前为 ${primaryCardMetrics.placeholderText}`,
  );
  assertOrThrow(
    primaryCardMetrics.hoverHintOpacity === 0,
    `页面卡片 hover 提示默认不应可见，当前透明度为 ${primaryCardMetrics.hoverHintOpacity}`,
  );

  logStep("hover card and verify contextual hint appears");
  await page.locator(".slide-rail .slide-card-shell").first().hover();
  await page.waitForTimeout(220);
  const hoverHintOpacity = await readHoverHintOpacity(page, 0);
  assertOrThrow(
    typeof hoverHintOpacity === "number" && hoverHintOpacity > 0.8,
    `页面卡片 hover 提示未按预期出现，当前透明度为 ${hoverHintOpacity}`,
  );
  summary.checks.push({
    id: "hover-hint-opacity",
    hoverHintOpacity,
  });

  logStep("rename first slide via double click");
  const primarySlideName = "封面页";
  await page.locator(".slide-rail .slide-card-shell .slide-name").first().dblclick();
  const renameInput = page.locator(".slide-rail .slide-card-shell .slide-name-input input").first();
  await renameInput.waitFor();
  await renameInput.fill(primarySlideName);
  await renameInput.press("Enter");
  await waitForSaved(page);

  const renamedSlideState = await readSlideState(page);
  assertOrThrow(
    renamedSlideState.slides[0]?.name === primarySlideName,
    `双击重命名未生效，当前第一页名称为 ${renamedSlideState.slides[0]?.name ?? "空"}`,
  );
  summary.checks.push({
    id: "rename-first-slide",
    slides: renamedSlideState.slides,
  });

  logStep("open context menu and create another slide");
  await openSlideContextMenu(page, 0);
  const contextMenu = page.locator(".slide-context-menu");
  await contextMenu.getByRole("button", { name: "后插入" }).waitFor();
  await contextMenu.getByRole("button", { name: "复制页面" }).waitFor();
  await contextMenu.getByRole("button", { name: "删除页面" }).waitFor();
  await contextMenu.getByRole("button", { name: "后插入" }).click();
  await page.waitForFunction(() => window.__CW_EDITOR_DEBUG__?.getSnapshot?.().document.slides.length === 2);
  await waitForSaved(page);

  const afterCreateState = await readSlideState(page);
  assertOrThrow(afterCreateState.slides.length === 2, "通过右键菜单后插入页面后，页面数量应为 2");
  summary.checks.push({
    id: "context-menu-create-after",
    slides: afterCreateState.slides,
  });

  logStep("ensure inactive card top row stays clean");
  const inactiveCardIndex = afterCreateState.slides.findIndex(
    (slide) => slide.id !== afterCreateState.activeSlideId,
  );
  assertOrThrow(inactiveCardIndex >= 0, "未找到可用于校验头部文案的非激活页面卡片");
  const inactiveTopText = await readSlideCardTopText(page, inactiveCardIndex);
  assertOrThrow(
    !(inactiveTopText ?? "").includes("右键管理"),
    `未激活页卡片头部仍然出现“右键管理”，当前文本为 ${inactiveTopText}`,
  );
  summary.checks.push({
    id: "inactive-card-top-text",
    cardIndex: inactiveCardIndex,
    text: inactiveTopText,
  });

  logStep("verify drag reorder still works after compaction");
  const orderBeforeReorder = afterCreateState.slides.map((slide) => slide.id);
  await page.locator(".slide-rail .slide-card-shell").nth(1).dragTo(
    page.locator(".slide-rail .slide-card-shell").nth(0),
  );
  await page.waitForFunction((expectedFirstId) => {
    const snapshot = window.__CW_EDITOR_DEBUG__?.getSnapshot?.();
    return snapshot?.document?.slides?.[0]?.id === expectedFirstId;
  }, orderBeforeReorder[1]);
  await waitForSaved(page);

  const afterReorderState = await readSlideState(page);
  assertOrThrow(
    afterReorderState.slides[0]?.id === orderBeforeReorder[1],
    "拖拽排序后，第二页应成功移动到第一页位置",
  );
  summary.checks.push({
    id: "drag-reorder",
    before: orderBeforeReorder,
    after: afterReorderState.slides.map((slide) => slide.id),
    activeSlideId: afterReorderState.activeSlideId,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-edit-vnext-37-g.png"),
    fullPage: true,
  });

  assertOrThrow(consoleErrors.length === 0, `存在控制台错误: ${consoleErrors.join(" | ")}`);
  assertOrThrow(pageErrors.length === 0, `存在页面运行时错误: ${pageErrors.join(" | ")}`);
  summary.result = "passed";
} catch (error) {
  summary.result = "failed";
  summary.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}
