import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  normalizeInlineText,
  readStoredProjects,
  readViewportMetrics,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 当前测试访问的正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";
/** 项目列表本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-07-vnext-10-round-01");

/**
 * 统一打印阶段日志，便于排查脚本卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext10-test]", label);
}

/**
 * 根据预设卡片标题定位对应按钮。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {import("playwright").Locator}
 */
function presetCard(page, label) {
  return page.locator(".preset-card").filter({ hasText: label }).first();
}

/**
 * 根据标题和首个页面尺寸定位目标项目。
 *
 * @param {any[]} projects
 * @param {string} title
 * @param {number} width
 * @param {number} height
 * @returns {any | null}
 */
function findProjectByTitleAndSize(projects, title, width, height) {
  return (
    projects.find((project) => {
      const firstSlide = project?.document?.slides?.[0];
      return (
        project?.title === title &&
        firstSlide?.size?.width === width &&
        firstSlide?.size?.height === height
      );
    }) ?? null
  );
}

/**
 * 写入自定义尺寸输入框并触发 blur，让 Arco 数字输入完成归一化。
 *
 * @param {import("playwright").Locator} input
 * @param {string} value
 * @returns {Promise<void>}
 */
async function fillNumberInput(input, value) {
  await input.click();
  await input.fill(value);
  await input.blur();
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
  await page.waitForTimeout(400);

  const initialProjectCount = await page.locator(".project-card").count();
  const initialCountLabel = normalizeInlineText(await page.locator(".section-copy p").textContent());

  await page.screenshot({
    path: path.join(ASSET_DIR, "project-list-overview.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "home-overview",
    projectCardCount: initialProjectCount,
    countLabel: initialCountLabel,
    metrics: await readViewportMetrics(page),
  });

  logStep("open create modal");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByText("创建参数").waitFor();

  await page.screenshot({
    path: path.join(ASSET_DIR, "create-modal-default.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "create-modal-default",
    summaryTitle: normalizeInlineText(await page.locator(".summary-copy h3").textContent()),
    summaryText: normalizeInlineText(await page.locator(".summary-copy p").textContent()),
    tag: normalizeInlineText(await page.locator(".create-summary .arco-tag").textContent()),
  });

  logStep("switch preset cards");
  await presetCard(page, "经典课件").click();
  const classicSummary = normalizeInlineText(await page.locator(".summary-copy p").textContent());
  await presetCard(page, "竖屏讲解").click();

  await page.screenshot({
    path: path.join(ASSET_DIR, "create-modal-portrait.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "preset-switching",
    classicSummary,
    portraitSummary: normalizeInlineText(await page.locator(".summary-copy p").textContent()),
    portraitHint: normalizeInlineText(await page.locator(".field-hint").textContent()),
  });

  logStep("create portrait project");
  const portraitTitle = `VNext10 竖屏创建测试 ${Date.now()}`;
  await page.locator("#project-title-input input").fill(portraitTitle);
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-portrait-edit.png"),
    fullPage: true,
  });

  const projectsAfterPortrait = await readStoredProjects(page, STORAGE_KEY);
  const portraitRecord = findProjectByTitleAndSize(projectsAfterPortrait, portraitTitle, 1080, 1920);

  summary.checks.push({
    id: "portrait-workspace",
    url: page.url(),
    titleInput: await page.getByLabel("项目标题").inputValue(),
    recordFound: Boolean(portraitRecord),
    storedSlideSize: portraitRecord?.document?.slides?.[0]?.size ?? null,
    metrics: await readViewportMetrics(page),
  });

  logStep("enter preview mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page
    .locator(".embedded-preview-actions")
    .getByRole("button", { name: "重置播放" })
    .waitFor();
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-portrait-preview.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "portrait-preview-smoke",
    url: page.url(),
    resetButtonVisible: await page
      .locator(".embedded-preview-actions")
      .getByRole("button", { name: "重置播放" })
      .isVisible(),
    stageTitleVisible: await page.getByText("当前画布").isVisible(),
    metrics: await readViewportMetrics(page),
  });

  logStep("return to project list after portrait");
  await page.getByLabel("返回项目列表").click();
  await page.waitForURL(BASE_URL);
  await page.getByText(portraitTitle).waitFor();
  await page.waitForTimeout(300);

  await page.screenshot({
    path: path.join(ASSET_DIR, "project-list-after-portrait.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "portrait-return-list",
    projectCardCount: await page.locator(".project-card").count(),
    topCardTitle: normalizeInlineText(
      await page.locator(".project-card").first().locator("h3").textContent(),
    ),
    topCardMeta: normalizeInlineText(
      await page.locator(".project-card").first().locator(".project-meta").textContent(),
    ),
  });

  logStep("open create modal for custom size");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByText("创建参数").waitFor();
  await presetCard(page, "自定义").click();

  const numberInputs = page.locator(".custom-size-grid input");
  await fillNumberInput(numberInputs.nth(0), "280");
  await fillNumberInput(numberInputs.nth(1), "160");
  await page.waitForTimeout(350);

  await page.screenshot({
    path: path.join(ASSET_DIR, "create-modal-custom-min.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "custom-min-clamp",
    summaryText: normalizeInlineText(await page.locator(".summary-copy p").textContent()),
    tag: normalizeInlineText(await page.locator(".create-summary .arco-tag").textContent()),
    widthInputValue: await numberInputs.nth(0).inputValue(),
    heightInputValue: await numberInputs.nth(1).inputValue(),
  });

  logStep("create custom size project");
  await page.locator("#project-title-input input").fill("");
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-custom-edit.png"),
    fullPage: true,
  });

  const projectsAfterCustom = await readStoredProjects(page, STORAGE_KEY);
  const customRecord = findProjectByTitleAndSize(projectsAfterCustom, "未命名课件", 320, 180);

  summary.checks.push({
    id: "custom-workspace",
    url: page.url(),
    titleInput: await page.getByLabel("项目标题").inputValue(),
    recordFound: Boolean(customRecord),
    storedSlideSize: customRecord?.document?.slides?.[0]?.size ?? null,
  });

  logStep("return to final project list");
  await page.getByLabel("返回项目列表").click();
  await page.waitForURL(BASE_URL);
  await page.waitForTimeout(300);

  await page.screenshot({
    path: path.join(ASSET_DIR, "project-list-after-custom.png"),
    fullPage: true,
  });

  const finalProjects = await readStoredProjects(page, STORAGE_KEY);
  await writeJsonFile(path.join(ASSET_DIR, "storage-after-vnext10.json"), finalProjects);

  summary.checks.push({
    id: "final-list-state",
    projectCardCount: await page.locator(".project-card").count(),
    countLabel: normalizeInlineText(await page.locator(".section-copy p").textContent()),
    topThreeTitles: await page
      .locator(".project-card h3")
      .evaluateAll((elements) => elements.slice(0, 3).map((element) => element.textContent?.trim() ?? "")),
    metrics: await readViewportMetrics(page),
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
