import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  launchBrowserSession,
  setImageFileAndConfirmCrop,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";
/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";
/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve(
  "docs/test-reports/assets/2026-05-15-bug-image-inspector-overflow-round-01",
);
/** 当前轮次用于插图的本地图片夹具。 */
const IMAGE_FIXTURE_PATH = path.resolve(
  "docs/test-reports/assets/2026-05-15-bug-image-inspector-overflow-round-01/bug-image-inspector-overflow-fixture.svg",
);
/** 用于压测属性头部资源标识的长文本。 */
const LONG_IMAGE_ALT =
  "bug-image-inspector-overflow-asset-name-with-many-segments-for-right-sidebar-width-pressure-check";
/** 容器允许的最大横向溢出阈值。 */
const MAX_ALLOWED_HORIZONTAL_OVERFLOW_PX = 1;

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[bug-image-inspector-overflow]", label);
}

/**
 * 读取属性面板里指定标签所在的字段容器。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {import("playwright").Locator}
 */
function inspectorField(page, label) {
  return page.locator(".field").filter({
    has: page.locator(".field-label", { hasText: label }),
  }).first();
}

/**
 * 读取属性面板里指定标签对应的输入框。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {import("playwright").Locator}
 */
function inspectorInput(page, label) {
  return inspectorField(page, label).locator("input, textarea").first();
}

/**
 * 确保右侧管理栏已经展开。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function ensureRightSidebarExpanded(page) {
  const sideBody = page.locator(".editor-side-body");
  if (await sideBody.isVisible().catch(() => false)) {
    return;
  }

  await page.getByRole("button", { name: "展开右侧管理栏" }).click();
  await sideBody.waitFor();
}

/**
 * 确保当前停留在“组件属性”标签。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function ensureInspectorTabActive(page) {
  const inspectorTab = page
    .locator(".side-tabs-nav .arco-tabs-tab")
    .filter({ hasText: "组件属性" })
    .first();

  if ((await inspectorTab.getAttribute("aria-selected")) === "true") {
    return;
  }

  await inspectorTab.click();
}

/**
 * 更新属性面板里的文本字段，并通过 blur 触发标准保存链路。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {string} value
 * @returns {Promise<void>}
 */
async function setInspectorText(page, label, value) {
  const input = inspectorInput(page, label);
  await input.click();
  await input.fill(value);
  await input.blur();
}

/**
 * 读取右侧图片属性面板的横向溢出快照。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<any>}
 */
async function readInspectorOverflowSnapshot(page) {
  return page.evaluate(() => {
    /**
     * 读取单个元素的尺寸、滚动和定位信息。
     *
     * @param {string} selector
     * @returns {{
     *   selector: string;
     *   clientWidth: number;
     *   scrollWidth: number;
     *   left: number;
     *   right: number;
     *   width: number;
     * } | null}
     */
    const readBox = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        selector,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        left: Number(rect.left.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
      };
    };

    const sideBody = document.querySelector(".editor-side-body");
    const panel = document.querySelector(".inspector-panel");
    if (!(sideBody instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      return null;
    }

    const sideBodyRect = sideBody.getBoundingClientRect();
    const visibleChildren = Array.from(panel.querySelectorAll("*"))
      .filter((node) => node instanceof HTMLElement)
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

    const worstChild = visibleChildren.reduce(
      (currentWorst, node) => {
        const element = /** @type {HTMLElement} */ (node);
        const rect = element.getBoundingClientRect();
        const overflowPx = Number((rect.right - sideBodyRect.right).toFixed(2));

        if (overflowPx <= currentWorst.overflowPx) {
          return currentWorst;
        }

        return {
          overflowPx,
          selector:
            element.className
              ?.toString()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 3)
              .map((className) => `.${className}`)
              .join("") || element.tagName.toLowerCase(),
          textPreview: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ?? "",
        };
      },
      {
        overflowPx: Number.NEGATIVE_INFINITY,
        selector: "",
        textPreview: "",
      },
    );

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      side: readBox(".editor-side"),
      sideBody: readBox(".editor-side-body"),
      panel: readBox(".inspector-panel"),
      cropCard: readBox(".image-source-row"),
      cropHead: readBox(".group-card .group-head"),
      cropBadge: readBox(".group-footnote .group-badge"),
      maxChildOverflowPx: Number(Math.max(worstChild.overflowPx, 0).toFixed(2)),
      worstChild,
    };
  });
}

/**
 * 断言右侧图片属性面板没有横向撑爆。
 *
 * @param {string} stageLabel
 * @param {any} snapshot
 * @returns {void}
 */
function assertNoInspectorOverflow(stageLabel, snapshot) {
  if (!snapshot) {
    throw new Error(`未能读取图片属性面板横向快照：${stageLabel}`);
  }

  const trackedBoxes = [
    snapshot.side,
    snapshot.sideBody,
    snapshot.panel,
    snapshot.cropCard,
    snapshot.cropHead,
  ].filter(Boolean);

  const overflowedBoxes = trackedBoxes.filter(
    (box) => box.scrollWidth - box.clientWidth > MAX_ALLOWED_HORIZONTAL_OVERFLOW_PX,
  );

  if (overflowedBoxes.length > 0) {
    const detail = overflowedBoxes
      .map(
        (box) =>
          `${box.selector}: scrollWidth=${box.scrollWidth}, clientWidth=${box.clientWidth}`,
      )
      .join("; ");
    throw new Error(`图片属性面板横向滚动溢出：${stageLabel}; ${detail}`);
  }

  if (snapshot.maxChildOverflowPx > MAX_ALLOWED_HORIZONTAL_OVERFLOW_PX) {
    throw new Error(
      `图片属性面板子元素越出右侧容器：${stageLabel}; overflow=${snapshot.maxChildOverflowPx}px; selector=${snapshot.worstChild.selector}; text=${snapshot.worstChild.textPreview}`,
    );
  }
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
  viewport: DEFAULT_VIEWPORT,
  fixturePath: IMAGE_FIXTURE_PATH,
  longImageAlt: LONG_IMAGE_ALT,
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

  logStep("insert local image");
  await setImageFileAndConfirmCrop(
    page
      .locator(".toolbar-group-insert .local-image-file-trigger")
      .filter({ hasText: "图片" })
      .first()
      .locator("input[type='file']"),
    page,
    IMAGE_FIXTURE_PATH,
  );
  await waitForSaved(page);

  logStep("open inspector");
  await ensureRightSidebarExpanded(page);
  await ensureInspectorTabActive(page);
  await page.getByRole("heading", { name: "图片属性" }).waitFor();

  logStep("read initial overflow snapshot");
  const initialSnapshot = await readInspectorOverflowSnapshot(page);
  assertNoInspectorOverflow("initial", initialSnapshot);
  summary.checks.push({
    id: "initial-inspector-overflow-snapshot",
    snapshot: initialSnapshot,
  });

  logStep("stress long image resource label");
  await setInspectorText(page, "替代文本", LONG_IMAGE_ALT);
  await waitForSaved(page);
  await page.waitForTimeout(200);

  const longLabelSnapshot = await readInspectorOverflowSnapshot(page);
  assertNoInspectorOverflow("after-long-label", longLabelSnapshot);
  summary.checks.push({
    id: "long-label-inspector-overflow-snapshot",
    snapshot: longLabelSnapshot,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "image-inspector-no-overflow.png"),
    fullPage: true,
  });

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("图片属性侧栏溢出回归过程中出现控制台或运行时错误");
  }
} finally {
  summary.consoleErrors = consoleErrors;
  summary.pageErrors = pageErrors;
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
