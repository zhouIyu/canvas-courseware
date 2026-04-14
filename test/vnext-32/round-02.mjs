import fs from "node:fs/promises";
import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  normalizeInlineText,
  readStoredProjects,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";
import { loadChromium } from "../shared/playwright-runtime.mjs";

/** 正式项目列表地址。 */
const BASE_URL = "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-04-14-vnext-32-round-03");

/** 导出后保存到本地的 JSON 文件路径。 */
const EXPORTED_FILE_PATH = path.join(ASSET_DIR, "exported-courseware.json");

/** 合法导入夹具路径。 */
const VALID_IMPORT_FILE_PATH = path.join(ASSET_DIR, "import-valid.json");

/** 非法时间轴引用导入夹具路径。 */
const INVALID_REFERENCE_FILE_PATH = path.join(ASSET_DIR, "import-invalid-reference.json");

/** 不受支持版本导入夹具路径。 */
const UNSUPPORTED_VERSION_FILE_PATH = path.join(ASSET_DIR, "import-unsupported-version.json");

/** 当前轮次固定使用的 Chrome 可执行文件路径。 */
const CHROME_EXECUTABLE_PATH =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** 合法导入后期望写回的项目标题。 */
const EXPECTED_IMPORTED_TITLE = "VNext-32 导入校验课件";

/** 合法导入后期望写回的文本内容。 */
const EXPECTED_IMPORTED_TEXT = "这段文本来自 round-02 JSON 导入回归。";

/** 非法时间轴引用使用的缺失节点 id。 */
const MISSING_TARGET_ID = "missing-node-for-import";

/** 不受支持版本夹具使用的旧 schema 版本号。 */
const UNSUPPORTED_SCHEMA_VERSION = "0.9.0";

/**
 * 打印当前测试阶段，便于定位执行卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext32-import-export-test]", label);
}

/**
 * 深拷贝一份纯 JSON 数据，避免不同测试步骤共用同一对象引用。
 *
 * @template TValue
 * @param {TValue} value
 * @returns {TValue}
 */
function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 启动一套基于本机 Google Chrome 的无头浏览器会话。
 *
 * @returns {Promise<{ browser: import("playwright").Browser; context: import("playwright").BrowserContext; page: import("playwright").Page; }>}
 */
async function launchChromeBrowserSession() {
  const chromium = await loadChromium();
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_EXECUTABLE_PATH,
  });
  const context = await browser.newContext({
    viewport: DEFAULT_VIEWPORT,
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
  };
}

/**
 * 拦截浏览器自动发起的 favicon 请求，避免无关 404 噪音污染测试结果。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function interceptFaviconRequest(page) {
  await page.route("**/favicon.ico", async (route) => {
    await route.fulfill({
      status: 204,
      contentType: "image/x-icon",
      body: "",
    });
  });
}

/**
 * 从当前工作台地址中提取项目 id。
 *
 * @param {string} currentUrl
 * @returns {string}
 */
function extractProjectId(currentUrl) {
  return currentUrl.match(/\/projects\/([^?]+)/)?.[1] ?? "";
}

/**
 * 读取当前测试项目在本地存储中的最新记录。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @returns {Promise<any | null>}
 */
async function readStoredProject(page, projectId) {
  const projects = await readStoredProjects(page, STORAGE_KEY);
  return findProjectById(projects, projectId);
}

/**
 * 读取当前页面顶部反馈文案，并规整空白字符便于断言。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function readIoFeedbackText(page) {
  const rawText = await page.locator(".io-feedback").innerText();
  return normalizeInlineText(rawText);
}

/**
 * 等待顶部反馈文案更新为指定关键字。
 *
 * @param {import("playwright").Page} page
 * @param {string} expectedText
 * @returns {Promise<string>}
 */
async function waitForIoFeedbackText(page, expectedText) {
  await page.waitForFunction(
    (text) => {
      const alertElement = document.querySelector(".io-feedback");
      return Boolean(alertElement?.textContent?.includes(text));
    },
    expectedText,
  );

  return readIoFeedbackText(page);
}

/**
 * 导出当前工作台 JSON，并把下载结果落盘到测试产物目录。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<{ fileName: string; filePath: string; document: any; }>}
 */
async function exportCurrentCoursewareJson(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出 JSON" }).click(),
  ]);

  const fileName = download.suggestedFilename();
  await download.saveAs(EXPORTED_FILE_PATH);

  return {
    fileName,
    filePath: EXPORTED_FILE_PATH,
    document: JSON.parse(await fs.readFile(EXPORTED_FILE_PATH, "utf8")),
  };
}

/**
 * 基于导出的合法文档构造一份新的合法导入夹具。
 * 这里通过修改标题和文本内容，验证导入后 UI 与本地存储都已更新。
 *
 * @param {any} exportedDocument
 * @returns {any}
 */
function buildValidImportDocument(exportedDocument) {
  const nextDocument = cloneJsonValue(exportedDocument);
  const firstSlide = nextDocument.slides?.[0];
  const firstTextNode = firstSlide?.nodes?.find((node) => node.type === "text");

  if (!firstSlide || !firstTextNode) {
    throw new Error("导出文档缺少可复用的首屏文本节点，无法构造合法导入夹具。");
  }

  nextDocument.meta.title = EXPECTED_IMPORTED_TITLE;
  firstTextNode.name = "导入校验文本";
  firstTextNode.props.text = EXPECTED_IMPORTED_TEXT;

  return nextDocument;
}

/**
 * 构造一份当前 schema 版本下的非法文档。
 * 这里故意让时间轴动作引用一个不存在的节点，以验证 validator 拦截逻辑。
 *
 * @param {any} exportedDocument
 * @returns {any}
 */
function buildInvalidReferenceImportDocument(exportedDocument) {
  const nextDocument = cloneJsonValue(exportedDocument);
  const firstSlide = nextDocument.slides?.[0];

  if (!firstSlide) {
    throw new Error("导出文档缺少首张页面，无法构造非法时间轴引用夹具。");
  }

  nextDocument.meta.title = "非法时间轴引用课件";
  firstSlide.timeline.animations = [];
  firstSlide.timeline.steps = [
    {
      id: "step-invalid-reference",
      name: "非法时间轴引用步骤",
      trigger: {
        type: "page-click",
      },
      actions: [
        {
          id: "action-invalid-reference",
          type: "show-node",
          targetId: MISSING_TARGET_ID,
        },
      ],
    },
  ];

  return nextDocument;
}

/**
 * 构造一份版本号不受支持的旧文档。
 * 这里用来验证 migrator 在缺少迁移链路时会返回明确错误，而不是静默导入脏数据。
 *
 * @param {any} exportedDocument
 * @returns {any}
 */
function buildUnsupportedVersionImportDocument(exportedDocument) {
  const nextDocument = cloneJsonValue(exportedDocument);
  nextDocument.version = UNSUPPORTED_SCHEMA_VERSION;
  nextDocument.meta.title = "旧版本课件";
  return nextDocument;
}

/**
 * 把构造好的导入夹具落盘到测试产物目录。
 *
 * @param {string} filePath
 * @param {any} document
 * @returns {Promise<void>}
 */
async function writeImportFixture(filePath, document) {
  await fs.writeFile(filePath, JSON.stringify(document, null, 2), "utf8");
}

/**
 * 通过顶栏上传控件导入一份 JSON 文件。
 *
 * @param {import("playwright").Page} page
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function importJsonFile(page, filePath) {
  await page.locator(".workspace-upload input[type='file']").setInputFiles(filePath);
}

/**
 * 断言当前项目记录已经稳定写回到本地存储。
 *
 * @param {import("playwright").Page} page
 * @param {string} projectId
 * @param {{ expectedTitle: string; expectedText: string; }} expectedState
 * @returns {Promise<{ title: string; text: string | null; nodeCount: number; }>}
 */
async function assertStoredProjectState(page, projectId, expectedState) {
  const storedProject = await readStoredProject(page, projectId);
  const firstSlide = storedProject?.document?.slides?.[0] ?? null;
  const firstTextNode = firstSlide?.nodes?.find((node) => node.type === "text") ?? null;
  const storedTitle = storedProject?.title ?? "";
  const storedText = firstTextNode?.props?.text ?? null;

  if (storedTitle !== expectedState.expectedTitle) {
    throw new Error(`本地存储标题异常：期望 ${expectedState.expectedTitle}，实际为 ${storedTitle}`);
  }

  if (storedText !== expectedState.expectedText) {
    throw new Error(`本地存储文本异常：期望 ${expectedState.expectedText}，实际为 ${storedText}`);
  }

  return {
    title: storedTitle,
    text: storedText,
    nodeCount: firstSlide?.nodes?.length ?? 0,
  };
}

/**
 * 过滤掉本轮预期内的导入失败诊断日志，保留真正需要关注的控制台错误。
 *
 * @param {string[]} consoleErrors
 * @returns {string[]}
 */
function collectUnexpectedConsoleErrors(consoleErrors) {
  return consoleErrors.filter((message) => !message.includes("project.import.failed"));
}

await ensureDirectory(ASSET_DIR);

/** 当前浏览器会话。 */
const { browser, context, page } = await launchChromeBrowserSession();

/** 拦截 favicon 404，避免把静态资源缺失误判成业务异常。 */
await interceptFaviconRequest(page);

/** 当前错误收集器。 */
const { consoleErrors, pageErrors } = attachPageErrorCollectors(page);

/** 当前轮次结构化结果。 */
const summary = {
  baseUrl: BASE_URL,
  executedAt: new Date().toISOString(),
  browser: "Google Chrome Headless",
  chromeExecutablePath: CHROME_EXECUTABLE_PATH,
  desktopViewport: DEFAULT_VIEWPORT,
  checks: [],
  consoleErrors,
  pageErrors,
};

try {
  logStep("open project list");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "最近项目" }).waitFor();

  logStep("create blank project");
  await page.getByRole("button", { name: "新建项目" }).click();
  await page.locator(".project-create-modal").waitFor();
  await page.getByRole("button", { name: "创建并进入工作台" }).click();
  await page.waitForURL(/\/projects\/[^/]+\?mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await page.locator(".editor-shell").waitFor();
  await waitForSaved(page);

  /** 当前自动创建项目的唯一 id。 */
  const projectId = extractProjectId(page.url());
  if (!projectId) {
    throw new Error("未能从工作台地址中解析出项目 id。");
  }

  logStep("insert baseline text node");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "文本" }).click();
  await waitForSaved(page);

  logStep("export current project json");
  const exportedPayload = await exportCurrentCoursewareJson(page);
  await waitForIoFeedbackText(page, "已导出");

  summary.checks.push({
    id: "export-json",
    fileName: exportedPayload.fileName,
    version: exportedPayload.document.version,
    slideCount: exportedPayload.document.slides?.length ?? 0,
  });

  logStep("prepare import fixtures");
  const validImportDocument = buildValidImportDocument(exportedPayload.document);
  const invalidReferenceImportDocument = buildInvalidReferenceImportDocument(exportedPayload.document);
  const unsupportedVersionImportDocument =
    buildUnsupportedVersionImportDocument(exportedPayload.document);

  await writeImportFixture(VALID_IMPORT_FILE_PATH, validImportDocument);
  await writeImportFixture(INVALID_REFERENCE_FILE_PATH, invalidReferenceImportDocument);
  await writeImportFixture(UNSUPPORTED_VERSION_FILE_PATH, unsupportedVersionImportDocument);

  logStep("import valid json");
  await importJsonFile(page, VALID_IMPORT_FILE_PATH);
  const validImportFeedback = await waitForIoFeedbackText(page, "已导入 import-valid.json 并保存到本地项目");
  await waitForSaved(page);

  const currentTitle = await page.getByLabel("项目标题").inputValue();
  if (currentTitle !== EXPECTED_IMPORTED_TITLE) {
    throw new Error(`合法导入后顶部标题异常：期望 ${EXPECTED_IMPORTED_TITLE}，实际为 ${currentTitle}`);
  }

  const storedStateAfterValidImport = await assertStoredProjectState(page, projectId, {
    expectedTitle: EXPECTED_IMPORTED_TITLE,
    expectedText: EXPECTED_IMPORTED_TEXT,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "valid-import.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "valid-import",
    feedback: validImportFeedback,
    storedTitle: storedStateAfterValidImport.title,
    storedText: storedStateAfterValidImport.text,
    nodeCount: storedStateAfterValidImport.nodeCount,
  });

  logStep("import invalid reference json");
  await importJsonFile(page, INVALID_REFERENCE_FILE_PATH);
  const invalidReferenceFeedback = await waitForIoFeedbackText(page, MISSING_TARGET_ID);
  const storedStateAfterInvalidReference = await assertStoredProjectState(page, projectId, {
    expectedTitle: EXPECTED_IMPORTED_TITLE,
    expectedText: EXPECTED_IMPORTED_TEXT,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "invalid-reference-feedback.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "invalid-reference-import",
    feedback: invalidReferenceFeedback,
    storedTitle: storedStateAfterInvalidReference.title,
    storedText: storedStateAfterInvalidReference.text,
  });

  logStep("import unsupported version json");
  await importJsonFile(page, UNSUPPORTED_VERSION_FILE_PATH);
  const unsupportedVersionFeedback = await waitForIoFeedbackText(page, UNSUPPORTED_SCHEMA_VERSION);
  const storedStateAfterUnsupportedVersion = await assertStoredProjectState(page, projectId, {
    expectedTitle: EXPECTED_IMPORTED_TITLE,
    expectedText: EXPECTED_IMPORTED_TEXT,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "unsupported-version-feedback.png"),
    fullPage: true,
  });

  summary.checks.push({
    id: "unsupported-version-import",
    feedback: unsupportedVersionFeedback,
    storedTitle: storedStateAfterUnsupportedVersion.title,
    storedText: storedStateAfterUnsupportedVersion.text,
  });

  if (pageErrors.length > 0) {
    throw new Error(`页面存在运行时异常：${pageErrors.join(" | ")}`);
  }

  const unexpectedConsoleErrors = collectUnexpectedConsoleErrors(consoleErrors);
  summary.unexpectedConsoleErrors = unexpectedConsoleErrors;

  if (unexpectedConsoleErrors.length > 0) {
    throw new Error(`页面存在非预期控制台错误：${unexpectedConsoleErrors.join(" | ")}`);
  }

  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
} catch (error) {
  summary.failure = String(error);
  await writeJsonFile(path.join(ASSET_DIR, "run-summary.json"), summary);
  throw error;
} finally {
  await page.close();
  await context.close();
  await browser.close();
}
