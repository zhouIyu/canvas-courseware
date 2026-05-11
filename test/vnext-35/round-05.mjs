import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  normalizeInlineText,
  readStoredProjects,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址，允许在端口占用时临时覆写。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-08-vnext-35-e-round-01");

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext35-e-test]", label);
}

/**
 * 在断言失败时抛出更容易定位的问题描述。
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
 * 生成一条当前轮次专用的项目标题。
 *
 * @param {string} suffix
 * @returns {string}
 */
function buildProjectTitle(suffix) {
  return `VNext35E ${suffix} ${Date.now()}`;
}

/**
 * 读取当前列表中前若干张项目卡片标题。
 *
 * @param {import("playwright").Page} page
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
async function readProjectCardTitles(page, limit = 3) {
  return page.locator(".project-card h3").evaluateAll((elements, topLimit) => {
    return elements
      .slice(0, topLimit)
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "");
  }, limit);
}

/**
 * 切换项目列表的排序模式。
 *
 * @param {import("playwright").Page} page
 * @param {string} optionLabel
 * @returns {Promise<void>}
 */
async function selectSortMode(page, optionLabel) {
  await page.locator(".sort-select").click();
  await page.locator(".arco-select-option").filter({ hasText: optionLabel }).first().click();
  await page.waitForTimeout(200);
}

/**
 * 创建一个项目并返回项目列表页。
 *
 * @param {import("playwright").Page} page
 * @param {string} title
 * @returns {Promise<string>}
 */
async function createProjectAndReturn(page, title) {
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.locator("#project-title-input input").fill(title);
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();

  const workspaceTitle = await page.getByLabel("项目标题").inputValue();

  await page.getByLabel("返回项目列表").click();
  await page.waitForURL(BASE_URL);
  await page.locator(".project-card").filter({ hasText: title }).first().waitFor();
  await page.waitForTimeout(200);

  return workspaceTitle;
}

/**
 * 读取首张项目卡片上的最后编辑展示信息。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, string>>}
 */
async function readFirstProjectUpdatedSnapshot(page) {
  const firstProjectCard = page.locator(".project-card").first();

  return {
    label: normalizeInlineText(
      await firstProjectCard.locator(".project-updated-label").textContent(),
    ),
    summary: normalizeInlineText(
      await firstProjectCard.locator(".project-updated strong").textContent(),
    ),
    detail: normalizeInlineText(
      await firstProjectCard.locator(".project-updated-detail").textContent(),
    ),
  };
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
  logStep("open project list and reset local storage");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  const seededTitles = await readProjectCardTitles(page);
  const seededCountLabel = normalizeInlineText(await page.locator(".section-copy p").textContent());

  summary.checks.push({
    id: "seeded-project-list",
    titles: seededTitles,
    countLabel: seededCountLabel,
  });

  assertOrThrow(seededTitles[0] === "古诗讲解示例", `示例项目首卡异常：${seededTitles[0]}`);

  logStep("create alpha project");
  const alphaProjectTitle = buildProjectTitle("Alpha");
  const alphaWorkspaceTitle = await createProjectAndReturn(page, alphaProjectTitle);

  summary.checks.push({
    id: "alpha-project-created",
    title: alphaProjectTitle,
    workspaceTitle: alphaWorkspaceTitle,
  });

  assertOrThrow(alphaWorkspaceTitle === alphaProjectTitle, "Alpha 项目进入工作台后的标题不一致。");

  logStep("create beta project");
  const betaProjectTitle = buildProjectTitle("Beta");
  const betaWorkspaceTitle = await createProjectAndReturn(page, betaProjectTitle);

  summary.checks.push({
    id: "beta-project-created",
    title: betaProjectTitle,
    workspaceTitle: betaWorkspaceTitle,
  });

  assertOrThrow(betaWorkspaceTitle === betaProjectTitle, "Beta 项目进入工作台后的标题不一致。");

  logStep("verify default descending order and updated display");
  const defaultSortedTitles = await readProjectCardTitles(page);
  const updatedSnapshot = await readFirstProjectUpdatedSnapshot(page);

  await page.screenshot({
    path: path.join(ASSET_DIR, "project-list-default-sort.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "default-sort-and-updated-display",
    titles: defaultSortedTitles,
    updatedSnapshot,
    countLabel: normalizeInlineText(await page.locator(".section-copy p").textContent()),
  });

  assertOrThrow(defaultSortedTitles[0] === betaProjectTitle, `默认排序首卡应为最新项目：${defaultSortedTitles[0]}`);
  assertOrThrow(defaultSortedTitles[1] === alphaProjectTitle, `默认排序第二张卡应为 Alpha：${defaultSortedTitles[1]}`);
  assertOrThrow(updatedSnapshot.label === "最后编辑", `最后编辑标签异常：${updatedSnapshot.label}`);
  assertOrThrow(updatedSnapshot.summary.length > 0, "最后编辑摘要为空。");
  assertOrThrow(updatedSnapshot.detail.length > 0, "最后编辑完整时间为空。");

  logStep("switch to ascending order");
  await selectSortMode(page, "较早编辑优先");
  const ascendingTitles = await readProjectCardTitles(page);
  const ascendingCountLabel = normalizeInlineText(await page.locator(".section-copy p").textContent());

  summary.checks.push({
    id: "ascending-sort",
    titles: ascendingTitles,
    countLabel: ascendingCountLabel,
  });

  assertOrThrow(ascendingTitles[0] === "古诗讲解示例", `升序排序首卡应为最早项目：${ascendingTitles[0]}`);
  assertOrThrow(ascendingTitles[2] === betaProjectTitle, `升序排序末卡应为最新项目：${ascendingTitles[2]}`);
  assertOrThrow(
    ascendingCountLabel.includes("按较早编辑优先排序"),
    `升序排序说明异常：${ascendingCountLabel}`,
  );

  logStep("switch back to descending order");
  await selectSortMode(page, "最近编辑优先");
  const restoredTitles = await readProjectCardTitles(page);

  summary.checks.push({
    id: "descending-sort-restored",
    titles: restoredTitles,
  });

  assertOrThrow(restoredTitles[0] === betaProjectTitle, `切回降序后首卡异常：${restoredTitles[0]}`);

  logStep("search alpha project");
  await page.getByPlaceholder("搜索项目名称...").fill("alpha");
  await page.waitForTimeout(200);

  const searchedTitles = await readProjectCardTitles(page, 1);
  const searchedCountLabel = normalizeInlineText(await page.locator(".section-copy p").textContent());

  summary.checks.push({
    id: "search-alpha",
    titles: searchedTitles,
    countLabel: searchedCountLabel,
  });

  assertOrThrow(searchedTitles[0] === alphaProjectTitle, `搜索 Alpha 后结果异常：${searchedTitles[0]}`);
  assertOrThrow(searchedCountLabel.includes("匹配 1 个"), `搜索结果统计异常：${searchedCountLabel}`);

  logStep("open alpha project from search result");
  await page.getByRole("button", { name: "打开" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  const openedTitleFromSearch = await page.getByLabel("项目标题").inputValue();

  summary.checks.push({
    id: "open-project-from-search",
    workspaceTitle: openedTitleFromSearch,
    workspaceUrl: page.url(),
  });

  assertOrThrow(
    openedTitleFromSearch === alphaProjectTitle,
    `搜索结果打开的项目标题异常：${openedTitleFromSearch}`,
  );

  logStep("return and verify empty search state");
  await page.getByLabel("返回项目列表").click();
  await page.waitForURL(BASE_URL);
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
  await page.getByPlaceholder("搜索项目名称...").fill("not-found-keyword");
  await page.waitForTimeout(200);

  const emptySearchCountLabel = normalizeInlineText(
    await page.locator(".section-copy p").textContent(),
  );
  const emptyProjectCardCount = await page.locator(".project-card").count();
  const clearSearchButtonVisible = await page.getByRole("button", { name: "清空搜索" }).isVisible();

  summary.checks.push({
    id: "empty-search-state",
    countLabel: emptySearchCountLabel,
    projectCardCount: emptyProjectCardCount,
    clearSearchButtonVisible,
  });

  assertOrThrow(
    emptySearchCountLabel.includes("匹配 0 个"),
    `空搜索态统计异常：${emptySearchCountLabel}`,
  );
  assertOrThrow(emptyProjectCardCount === 0, `空搜索态仍然存在项目卡片：${emptyProjectCardCount}`);
  assertOrThrow(clearSearchButtonVisible, "空搜索态未展示“清空搜索”按钮。");

  await page.getByRole("button", { name: "清空搜索" }).click();
  await page.waitForTimeout(200);

  const restoredProjectTitles = await readProjectCardTitles(page);
  const storedProjects = await readStoredProjects(page, STORAGE_KEY);

  await page.screenshot({
    path: path.join(ASSET_DIR, "project-list-search-restored.png"),
    fullPage: true,
  });

  await writeJsonFile(path.join(ASSET_DIR, "storage-after-vnext35-e.json"), storedProjects);

  summary.checks.push({
    id: "search-cleared",
    titles: restoredProjectTitles,
    storedProjectTitles: storedProjects.map((project) => project.title),
  });

  assertOrThrow(restoredProjectTitles.length >= 3, "清空搜索后项目列表未恢复。");
  assertOrThrow(storedProjects.length === 3, `本地存储项目数量异常：${storedProjects.length}`);
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
