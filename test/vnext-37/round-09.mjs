import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  normalizeInlineText,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址，允许在端口占用时临时覆写。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-14-vnext-37-h-round-01");

/**
 * 打印当前测试阶段，便于定位执行进度。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext37-h-test]", label);
}

/**
 * 在断言失败时抛出更清晰的错误信息。
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
 * 读取空态卡片的标题、描述与按钮文案。
 *
 * @param {import("playwright").Page} page
 * @param {string} selector
 * @returns {Promise<{ title: string; description: string; actionText: string; }>}
 */
async function readEmptyStateSnapshot(page, selector) {
  const root = page.locator(selector);
  await root.waitFor();

  return {
    title: normalizeInlineText(await root.locator(".cw-empty-state__title").textContent()),
    description: normalizeInlineText(await root.locator(".cw-empty-state__description").textContent()),
    actionText: await root.locator(".cw-empty-state__action").count()
      ? normalizeInlineText(await root.locator(".cw-empty-state__action").textContent())
      : "",
  };
}

/**
 * 进入一个空白项目编辑页。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ projectId: string; title: string; }>}
 */
async function openBlankWorkspace(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  const projectId = page.url().match(/\/projects\/([^/?]+)/)?.[1];
  if (!projectId) {
    throw new Error(`无法从工作台地址解析项目 id：${page.url()}`);
  }

  return {
    projectId,
    title: await page.getByLabel("项目标题").inputValue(),
  };
}

/**
 * 把目标项目改写成零页面文档，并刷新工作台进入对应空态。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<void>}
 */
async function rewriteProjectToZeroSlides(page, projectId) {
  await page.evaluate(({ storageKey, targetProjectId }) => {
    const rawValue = window.localStorage.getItem(storageKey);
    const projects = rawValue ? JSON.parse(rawValue) : [];
    const targetProject = projects.find((project) => project.id === targetProjectId);

    if (!targetProject) {
      throw new Error(`未找到目标项目：${targetProjectId}`);
    }

    targetProject.document.slides = [];
    targetProject.thumbnail = null;
    targetProject.slideThumbnails = {};
    targetProject.workspaceState = {
      ...(targetProject.workspaceState ?? {}),
      timelineCollapsedStepIdsBySlideId: {},
    };

    window.localStorage.setItem(storageKey, JSON.stringify(projects));
  }, {
    storageKey: STORAGE_KEY,
    targetProjectId: projectId,
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await page.waitForFunction(() => window.__CW_EDITOR_DEBUG__?.getSnapshot?.().document.slides.length === 0);
}

/**
 * 确保编辑器右侧管理栏处于展开态，便于读取属性与时间轴空态。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function ensureEditorSideExpanded(page) {
  const expandButton = page.getByLabel("展开右侧管理栏");
  if (await expandButton.isVisible()) {
    await expandButton.click();
  }
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
  logStep("open blank workspace");
  const blankProject = await openBlankWorkspace(page);

  logStep("verify project list search empty state");
  await page.getByLabel("返回项目列表").click();
  await page.waitForURL(BASE_URL);
  await page.getByRole("heading", { name: "最近项目" }).waitFor();
  await page.getByPlaceholder("搜索项目名称...").fill("no-match-empty-state");
  await page.waitForTimeout(220);
  const projectListEmptyState = await readEmptyStateSnapshot(page, ".empty-state");
  summary.checks.push({
    id: "project-list-empty-state",
    ...projectListEmptyState,
  });
  assertOrThrow(projectListEmptyState.title === "没有找到匹配的项目", `项目列表空态标题异常：${projectListEmptyState.title}`);
  assertOrThrow(
    projectListEmptyState.description.includes("试试调整关键词"),
    `项目列表空态说明异常：${projectListEmptyState.description}`,
  );
  assertOrThrow(projectListEmptyState.actionText === "清空搜索", `项目列表空态按钮异常：${projectListEmptyState.actionText}`);

  logStep("re-enter blank workspace");
  await page.getByRole("button", { name: "清空搜索" }).click();
  await page.waitForTimeout(200);
  await page
    .locator(".project-card")
    .filter({ hasText: blankProject.title })
    .getByRole("button", { name: "打开" })
    .click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();

  logStep("rewrite project to zero-slide workspace");
  await rewriteProjectToZeroSlides(page, blankProject.projectId);

  logStep("verify embedded workspace no longer contains technical copy");
  const embeddedEditorText = normalizeInlineText(await page.locator(".workspace-editor").textContent());
  const embeddedEditorTopbarCount = await page.locator(".workspace-editor .editor-topbar").count();
  summary.checks.push({
    id: "embedded-editor-copy",
    text: embeddedEditorText,
    topbarCount: embeddedEditorTopbarCount,
  });
  assertOrThrow(
    !embeddedEditorText.includes("snapshot") && !embeddedEditorText.includes("controller"),
    `嵌入态工作台仍存在技术说明：${embeddedEditorText}`,
  );
  assertOrThrow(embeddedEditorTopbarCount === 0, `嵌入态编辑器不应渲染内部顶栏：${embeddedEditorTopbarCount}`);

  logStep("verify edit workspace empty states");
  await ensureEditorSideExpanded(page);
  const slideRailEmptyState = await readEmptyStateSnapshot(page, ".slide-rail .rail-empty");
  const stageEmptyState = await readEmptyStateSnapshot(page, ".workspace-shell .empty-stage");
  await page.locator(".side-tabs-nav .arco-tabs-tab").filter({ hasText: "组件属性" }).click();
  const inspectorEmptyState = await readEmptyStateSnapshot(page, ".inspector-panel");
  await page.locator(".side-tabs-nav .arco-tabs-tab").filter({ hasText: "时间轴" }).click();
  const timelineEmptyState = await readEmptyStateSnapshot(page, ".timeline-panel");

  summary.checks.push({
    id: "edit-empty-states",
    slideRail: slideRailEmptyState,
    stage: stageEmptyState,
    inspector: inspectorEmptyState,
    timeline: timelineEmptyState,
  });

  assertOrThrow(slideRailEmptyState.title === "还没有页面", `页面栏空态标题异常：${slideRailEmptyState.title}`);
  assertOrThrow(slideRailEmptyState.actionText === "新建第一页", `页面栏空态按钮异常：${slideRailEmptyState.actionText}`);
  assertOrThrow(stageEmptyState.title === "还没有页面", `编辑区空态标题异常：${stageEmptyState.title}`);
  assertOrThrow(stageEmptyState.actionText === "当前页设置", `编辑区空态按钮异常：${stageEmptyState.actionText}`);
  assertOrThrow(inspectorEmptyState.title === "未选中对象", `属性面板空态标题异常：${inspectorEmptyState.title}`);
  assertOrThrow(
    inspectorEmptyState.description === "点击画布中的对象查看属性",
    `属性面板空态说明异常：${inspectorEmptyState.description}`,
  );
  assertOrThrow(timelineEmptyState.title === "还没有页面", `时间轴空态标题异常：${timelineEmptyState.title}`);

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-edit-vnext-37-h.png"),
    fullPage: true,
  });

  logStep("verify preview empty states");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=preview$/);
  const previewStageEmptyState = await readEmptyStateSnapshot(page, ".workspace-preview .preview-stage-shell");
  const previewTimelineEmptyState = await readEmptyStateSnapshot(page, ".workspace-preview .preview-side");
  summary.checks.push({
    id: "preview-empty-states",
    stage: previewStageEmptyState,
    timeline: previewTimelineEmptyState,
  });
  assertOrThrow(previewStageEmptyState.title === "还没有页面", `预览区空态标题异常：${previewStageEmptyState.title}`);
  assertOrThrow(
    previewStageEmptyState.description === "在编辑模式中创建页面后即可预览",
    `预览区空态说明异常：${previewStageEmptyState.description}`,
  );
  assertOrThrow(
    previewTimelineEmptyState.title === "当前页面还没有播放步骤",
    `预览右栏空态标题异常：${previewTimelineEmptyState.title}`,
  );

  await page.screenshot({
    path: path.join(ASSET_DIR, "workspace-preview-vnext-37-h.png"),
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
