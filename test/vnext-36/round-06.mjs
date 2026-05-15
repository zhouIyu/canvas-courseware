import path from "node:path";
import {
  attachPageErrorCollectors,
  clearIndexedDbStore,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  launchBrowserSession,
  normalizeInlineText,
  readDiagnosticEntries,
  readIndexedDbStoreRecords,
  readStoredProjects,
  readWorkspaceIoFeedbackText,
  setImageFileAndConfirmCrop,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址，允许在端口变化时临时覆写。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 项目本地存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 图片资产数据库名。 */
const PROJECT_ASSET_DB_NAME = "canvas-courseware-assets";

/** 图片资产对象仓库名。 */
const PROJECT_ASSET_STORE_NAME = "project-assets";

/** 本地图片测试资源。 */
const LOCAL_IMAGE_PATH = path.resolve(
  "docs/test-reports/assets/2026-04-07-vnext-08-round-01/vnext08-sample.png",
);

/** 当前轮次产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-11-vnext-36-f-round-01");

/** 当前固定项目标题。 */
const PROJECT_TITLE = "VNext-36-F 自动保存韧性回归课件";

/**
 * 打印当前阶段，便于在命令行里快速定位失败位置。
 *
 * @param {string} label
 * @returns {void}
 */
function logStep(label) {
  console.log("[vnext36-f-test]", label);
}

/**
 * 在断言失败时抛出更明确的错误信息。
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
 * 读取页面顶栏告警文本。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function readIoFeedback(page) {
  return normalizeInlineText(await readWorkspaceIoFeedbackText(page));
}

/**
 * 从当前存储记录中读取首个图片节点。
 *
 * @param {any | null} projectRecord
 * @returns {any | null}
 */
function readFirstImageNode(projectRecord) {
  return projectRecord?.document?.slides?.[0]?.nodes?.find((node) => node.type === "image") ?? null;
}

/**
 * 读取当前存储记录首页中的全部图片节点。
 *
 * @param {any | null} projectRecord
 * @returns {any[]}
 */
function readFirstSlideImageNodes(projectRecord) {
  return projectRecord?.document?.slides?.[0]?.nodes?.filter((node) => node.type === "image") ?? [];
}

/**
 * 创建一个最小的 blank 项目并进入工作台。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function createBlankProject(page) {
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.waitForFunction(() =>
    Boolean(window.__CW_EDITOR_DEBUG__) && Boolean(window.__CW_DIAGNOSTICS__),
  );
  await waitForSaved(page);

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";
  assertOrThrow(Boolean(projectId), "未能从工作台地址解析出项目 id");
  return projectId;
}

/**
 * 插入一张本地图片并等待自动保存完成。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function insertLocalImage(page) {
  await setImageFileAndConfirmCrop(
    page
      .locator(".toolbar-group-insert .local-image-file-trigger")
      .filter({ hasText: "图片" })
      .first()
      .locator("input[type='file']"),
    page,
    LOCAL_IMAGE_PATH,
  );
  await waitForSaved(page);
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
  projectTitle: PROJECT_TITLE,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open project list and clear persisted localStorage");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  logStep("create blank project");
  const projectId = await createBlankProject(page);
  await page.getByLabel("项目标题").fill(PROJECT_TITLE);
  await page.getByLabel("项目标题").blur();
  await waitForSaved(page);

  logStep("insert local image and verify asset storage created");
  await insertLocalImage(page);
  const recordsAfterInsert = await readIndexedDbStoreRecords(
    page,
    PROJECT_ASSET_DB_NAME,
    PROJECT_ASSET_STORE_NAME,
  );
  const storedProjectAfterInsert = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );

  summary.checks.push({
    id: "initial-asset-storage",
    assetRecordCount: recordsAfterInsert.length,
    savedImageSource: readFirstImageNode(storedProjectAfterInsert)?.props?.src ?? null,
  });

  assertOrThrow(recordsAfterInsert.length > 0, "插入本地图片后，资产仓库中未生成任何记录。");

  logStep("simulate cleared asset storage and reload workspace");
  await clearIndexedDbStore(page, PROJECT_ASSET_DB_NAME, PROJECT_ASSET_STORE_NAME);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    Boolean(window.__CW_EDITOR_DEBUG__) && Boolean(window.__CW_DIAGNOSTICS__),
  );
  await page.locator(".io-feedback").waitFor();
  const missingAssetFeedback = await readIoFeedback(page);
  const diagnosticsAfterReload = await readDiagnosticEntries(page);
  const runtimeSnapshotAfterReload = await page.evaluate(
    () => window.__CW_EDITOR_DEBUG__?.getSnapshot?.() ?? null,
  );

  await writeJsonFile(
    path.join(ASSET_DIR, "diagnostics-after-missing-asset-reload.json"),
    diagnosticsAfterReload,
  );
  await writeJsonFile(
    path.join(ASSET_DIR, "runtime-snapshot-after-missing-asset-reload.json"),
    runtimeSnapshotAfterReload,
  );

  summary.checks.push({
    id: "missing-asset-feedback",
    feedback: missingAssetFeedback,
    diagnosticEvents: diagnosticsAfterReload.map((entry) => entry.event),
    runtimeImageSource: readFirstImageNode({
      document: runtimeSnapshotAfterReload?.document,
    })?.props?.src ?? null,
  });

  assertOrThrow(
    missingAssetFeedback.includes("本地图片资源缺失"),
    `资产仓库被清空后，顶栏未给出明确恢复摘要：${missingAssetFeedback}`,
  );
  assertOrThrow(
    diagnosticsAfterReload.some((entry) => entry.event === "project.asset.hydrate.partial"),
    "资产仓库被清空后，诊断日志缺少 project.asset.hydrate.partial。",
  );

  logStep("override IndexedDB availability and trigger degraded autosave");
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      enumerable: true,
      value: undefined,
    });
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    Boolean(window.__CW_EDITOR_DEBUG__) && Boolean(window.__CW_DIAGNOSTICS__),
  );
  await page.evaluate(() => {
    window.__CW_DIAGNOSTICS__.clear();
  });
  await insertLocalImage(page);
  await waitForSaved(page);
  await page.locator(".io-feedback").waitFor();
  const degradedSaveFeedback = await readIoFeedback(page);
  const diagnosticsAfterDegradedSave = await readDiagnosticEntries(page);
  const storedProjectAfterDegradedSave = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const imageNodesAfterDegradedSave = readFirstSlideImageNodes(storedProjectAfterDegradedSave);

  await writeJsonFile(
    path.join(ASSET_DIR, "diagnostics-after-degraded-save.json"),
    diagnosticsAfterDegradedSave,
  );
  await writeJsonFile(
    path.join(ASSET_DIR, "storage-after-degraded-save.json"),
    storedProjectAfterDegradedSave,
  );

  summary.checks.push({
    id: "degraded-autosave-feedback",
    feedback: degradedSaveFeedback,
    diagnosticEvents: diagnosticsAfterDegradedSave.map((entry) => entry.event),
    assetStorageStatus: diagnosticsAfterDegradedSave.find(
      (entry) => entry.event === "project.save.completed",
    )?.context?.assetStorageStatus ?? null,
    savedImageSources: imageNodesAfterDegradedSave.map((node) => node.props?.src ?? null),
  });

  assertOrThrow(
    degradedSaveFeedback.includes("无法访问本地图片仓库"),
    `降级自动保存后未看到明确提示：${degradedSaveFeedback}`,
  );
  assertOrThrow(
    diagnosticsAfterDegradedSave.some(
      (entry) =>
        entry.event === "project.save.completed"
        && entry.context?.assetStorageStatus === "unavailable",
    ),
    "降级自动保存后，诊断日志未记录 assetStorageStatus=unavailable。",
  );
  assertOrThrow(
    imageNodesAfterDegradedSave.some((node) => (node.props?.src ?? "").startsWith("data:image/")),
    "降级自动保存后，新插入的本地图片未以原始 data URL 形式继续保留。",
  );
} catch (error) {
  summary.error = String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  await browser.close();
}

console.log(JSON.stringify(summary, null, 2));
