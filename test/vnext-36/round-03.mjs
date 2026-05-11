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

/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 项目列表排序偏好本地存储键名。 */
const SORT_MODE_STORAGE_KEY = "canvas-courseware.project-list.sort-mode";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-10-vnext-36-c-round-01");

/**
 * 打印当前测试阶段，便于定位执行失败点。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext36-c-test]", label);
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
 * 构造一个最小可用的 slide 数据。
 *
 * @param {number} index
 * @param {{ width: number; height: number }} size
 * @returns {any}
 */
function createSlide(index, size) {
  return {
    id: `slide-${index + 1}`,
    name: `第${index + 1}页`,
    size,
    background: {
      fill: "#FFFFFF",
      image: null,
    },
    nodes: [],
    timeline: {
      steps: [],
      animations: [],
    },
  };
}

/**
 * 构造一条测试项目记录。
 *
 * @param {{
 *   id: string;
 *   title: string;
 *   createdAt: string;
 *   updatedAt: string;
 *   slideCount: number;
 *   size?: { width: number; height: number; };
 * }} options
 * @returns {any}
 */
function createProjectRecord(options) {
  const size = options.size ?? {
    width: 1280,
    height: 720,
  };

  return {
    id: options.id,
    title: options.title,
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
    thumbnail: null,
    slideThumbnails: {},
    workspaceState: {
      timelineCollapsedStepIdsBySlideId: {},
    },
    document: {
      version: "1.0.0",
      meta: {
        id: options.id,
        title: options.title,
        createdAt: options.createdAt,
        updatedAt: options.updatedAt,
      },
      slides: Array.from({ length: options.slideCount }, (_, index) =>
        createSlide(index, size),
      ),
    },
  };
}

/**
 * 读取当前列表中前若干张项目卡片标题。
 *
 * @param {import("playwright").Page} page
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
async function readProjectCardTitles(page, limit = 4) {
  return page.locator(".project-card h3").evaluateAll((elements, topLimit) =>
    elements
      .slice(0, topLimit)
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? ""), limit);
}

/**
 * 切换项目列表排序模式。
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
 * 读取首张卡片的摘要信息。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, string>>}
 */
async function readFirstCardSummary(page) {
  const firstProjectCard = page.locator(".project-card").first();
  const metaTexts = await firstProjectCard.locator(".project-meta span").allTextContents();

  return {
    title: normalizeInlineText(await firstProjectCard.locator("h3").textContent()),
    updatedLabel: normalizeInlineText(
      await firstProjectCard.locator(".project-updated-label").textContent(),
    ),
    updatedSummary: normalizeInlineText(
      await firstProjectCard.locator(".project-updated strong").textContent(),
    ),
    createdLabel: normalizeInlineText(
      await firstProjectCard.locator(".project-created-label").textContent(),
    ),
    createdSummary: normalizeInlineText(
      await firstProjectCard.locator(".project-created strong").textContent(),
    ),
    description: normalizeInlineText(await firstProjectCard.locator(".project-copy p").textContent()),
    metaTexts: metaTexts.map((text) => normalizeInlineText(text)),
  };
}

/**
 * 读取本地存储中的排序偏好。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string | null>}
 */
async function readPersistedSortMode(page) {
  return page.evaluate((storageKey) => window.localStorage.getItem(storageKey), SORT_MODE_STORAGE_KEY);
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
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  logStep("seed project records and reset sort preference");
  const seededProjects = [
    createProjectRecord({
      id: "project-ancient-poem",
      title: "古诗讲解示例",
      createdAt: "2026-05-02T09:00:00.000Z",
      updatedAt: "2026-05-09T06:00:00.000Z",
      slideCount: 2,
      size: {
        width: 1280,
        height: 720,
      },
    }),
    createProjectRecord({
      id: "project-geometry",
      title: "几何练习课",
      createdAt: "2026-05-03T08:30:00.000Z",
      updatedAt: "2026-05-10T05:00:00.000Z",
      slideCount: 5,
      size: {
        width: 1024,
        height: 768,
      },
    }),
    createProjectRecord({
      id: "project-chemistry",
      title: "化学实验复盘",
      createdAt: "2026-05-10T02:00:00.000Z",
      updatedAt: "2026-05-10T04:30:00.000Z",
      slideCount: 3,
      size: {
        width: 1080,
        height: 1920,
      },
    }),
    createProjectRecord({
      id: "project-english",
      title: "英语晨读计划",
      createdAt: "2026-05-01T01:00:00.000Z",
      updatedAt: "2026-05-05T02:00:00.000Z",
      slideCount: 1,
      size: {
        width: 1280,
        height: 720,
      },
    }),
  ];

  await page.evaluate(({ storageKey, sortKey, projects }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(projects));
    window.localStorage.removeItem(sortKey);
  }, {
    storageKey: STORAGE_KEY,
    sortKey: SORT_MODE_STORAGE_KEY,
    projects: seededProjects,
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  logStep("verify default updated-desc sort and summary");
  const defaultTitles = await readProjectCardTitles(page);
  const firstCardSummary = await readFirstCardSummary(page);
  const defaultCountLabel = normalizeInlineText(await page.locator(".section-copy p").textContent());

  await page.screenshot({
    path: path.join(ASSET_DIR, "project-list-default-summary.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "default-sort-and-summary",
    titles: defaultTitles,
    countLabel: defaultCountLabel,
    firstCardSummary,
  });

  assertOrThrow(
    defaultTitles.join("|") === "几何练习课|化学实验复盘|古诗讲解示例|英语晨读计划",
    `默认按最近编辑排序结果异常：${defaultTitles.join(" > ")}`,
  );
  assertOrThrow(firstCardSummary.updatedLabel === "最后编辑", `最后编辑标签异常：${firstCardSummary.updatedLabel}`);
  assertOrThrow(firstCardSummary.createdLabel === "创建时间", `创建时间标签异常：${firstCardSummary.createdLabel}`);
  assertOrThrow(firstCardSummary.metaTexts.includes("5 页"), `项目页数摘要缺失：${firstCardSummary.metaTexts.join(" | ")}`);
  assertOrThrow(firstCardSummary.metaTexts.includes("1024 × 768"), `项目尺寸摘要缺失：${firstCardSummary.metaTexts.join(" | ")}`);
  assertOrThrow(firstCardSummary.metaTexts.includes("今天更新"), `项目活跃状态缺失：${firstCardSummary.metaTexts.join(" | ")}`);
  assertOrThrow(
    firstCardSummary.description.includes("恢复最近一次工作区内容"),
    `项目摘要说明异常：${firstCardSummary.description}`,
  );
  assertOrThrow(
    defaultCountLabel.includes("按最近编辑优先排序"),
    `默认排序说明异常：${defaultCountLabel}`,
  );

  logStep("switch to created-desc sort");
  await selectSortMode(page, "最新创建优先");
  const createdDescTitles = await readProjectCardTitles(page);
  const persistedCreatedDescMode = await readPersistedSortMode(page);

  summary.checks.push({
    id: "created-desc-sort",
    titles: createdDescTitles,
    persistedSortMode: persistedCreatedDescMode,
  });

  assertOrThrow(
    createdDescTitles.join("|") === "化学实验复盘|几何练习课|古诗讲解示例|英语晨读计划",
    `按最新创建优先排序结果异常：${createdDescTitles.join(" > ")}`,
  );
  assertOrThrow(
    persistedCreatedDescMode === "created-desc",
    `创建时间排序偏好未持久化：${persistedCreatedDescMode}`,
  );

  logStep("switch to slide-count-desc sort");
  await selectSortMode(page, "页数最多优先");
  const slideCountDescTitles = await readProjectCardTitles(page);
  const persistedSlideCountMode = await readPersistedSortMode(page);

  summary.checks.push({
    id: "slide-count-desc-sort",
    titles: slideCountDescTitles,
    persistedSortMode: persistedSlideCountMode,
  });

  assertOrThrow(
    slideCountDescTitles.join("|") === "几何练习课|化学实验复盘|古诗讲解示例|英语晨读计划",
    `按页数最多优先排序结果异常：${slideCountDescTitles.join(" > ")}`,
  );
  assertOrThrow(
    persistedSlideCountMode === "slide-count-desc",
    `页数排序偏好未持久化：${persistedSlideCountMode}`,
  );

  logStep("reload page and verify sort preference restore");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
  const titlesAfterReload = await readProjectCardTitles(page);
  const countLabelAfterReload = normalizeInlineText(await page.locator(".section-copy p").textContent());

  summary.checks.push({
    id: "sort-preference-restored",
    titles: titlesAfterReload,
    countLabel: countLabelAfterReload,
  });

  assertOrThrow(
    titlesAfterReload.join("|") === slideCountDescTitles.join("|"),
    `刷新后排序偏好未恢复：${titlesAfterReload.join(" > ")}`,
  );
  assertOrThrow(
    countLabelAfterReload.includes("按页数最多优先排序"),
    `刷新后排序说明异常：${countLabelAfterReload}`,
  );

  logStep("search within persisted sort mode");
  await page.getByPlaceholder("搜索项目名称...").fill("化学");
  await page.waitForTimeout(200);
  const searchedTitles = await readProjectCardTitles(page, 1);
  const searchedCountLabel = normalizeInlineText(await page.locator(".section-copy p").textContent());

  summary.checks.push({
    id: "search-with-new-sort-modes",
    titles: searchedTitles,
    countLabel: searchedCountLabel,
  });

  assertOrThrow(searchedTitles[0] === "化学实验复盘", `搜索结果异常：${searchedTitles[0]}`);
  assertOrThrow(searchedCountLabel.includes("匹配 1 个"), `搜索统计异常：${searchedCountLabel}`);

  await page.getByPlaceholder("搜索项目名称...").fill("");
  await page.waitForTimeout(200);

  const storedProjects = await readStoredProjects(page, STORAGE_KEY);
  await writeJsonFile(path.join(ASSET_DIR, "storage-after-vnext36-c.json"), storedProjects);
  await page.screenshot({
    path: path.join(ASSET_DIR, "project-list-slide-count-sort-restored.png"),
    fullPage: true,
  });
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
