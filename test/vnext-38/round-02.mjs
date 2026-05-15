import path from "node:path";
import {
  attachPageErrorCollectors,
  DEFAULT_VIEWPORT,
  ensureDirectory,
  findProjectById,
  launchBrowserSession,
  readPreviewCanvasPixel,
  readStoredProjects,
  waitForSaved,
  writeJsonFile,
} from "../shared/browser-test-helpers.mjs";

/** 正式项目列表地址。 */
const BASE_URL = process.env.CW_BASE_URL ?? "http://127.0.0.1:32173/projects";

/** 本地项目存储键名。 */
const STORAGE_KEY = "canvas-courseware.projects";

/** 当前轮次测试资源。 */
const IMAGE_FIXTURE_PATH = path.resolve(
  "docs/test-reports/assets/2026-05-15-vnext-38-b-round-01/vnext38-image-fixture.svg",
);

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-15-vnext-38-b-round-01");

/** 目标适配方式。 */
const TARGET_OBJECT_FIT = "contain";

/** 目标透明度百分比。 */
const TARGET_OPACITY_PERCENT = 58;

/** 目标旋转角度。 */
const TARGET_ROTATION = -18;

/** 目标裁剪窗口。 */
const TARGET_CROP = {
  x: 0.5,
  y: 0,
  width: 0.5,
  height: 1,
};

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext38-b-test]", label);
}

/**
 * 读取当前项目首页中的首个图片节点。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readImageNode(project) {
  return project?.document?.slides?.[0]?.nodes?.find((node) => node.type === "image") ?? null;
}

/**
 * 把节点局部坐标系中的采样点投影到画布坐标。
 * 这里按当前编辑器图片节点的固定 frame 模型计算，便于稳定读取旋转后的预览像素。
 *
 * @param {{ x: number; y: number; width: number; height: number; rotation: number }} node
 * @param {number} localX
 * @param {number} localY
 * @returns {{ x: number; y: number }}
 */
function projectLocalPointToCanvas(node, localX, localY) {
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  const radians = (node.rotation * Math.PI) / 180;
  const rotatedX = localX * Math.cos(radians) - localY * Math.sin(radians);
  const rotatedY = localX * Math.sin(radians) + localY * Math.cos(radians);

  return {
    x: Math.round(centerX + rotatedX),
    y: Math.round(centerY + rotatedY),
  };
}

/**
 * 计算节点旋转后的轴对齐包围盒，供预览像素区域扫描复用。
 *
 * @param {{ x: number; y: number; width: number; height: number; rotation: number }} node
 * @returns {{ minX: number; maxX: number; minY: number; maxY: number }}
 */
function resolveProjectedBounds(node) {
  const corners = [
    projectLocalPointToCanvas(node, -node.width / 2, -node.height / 2),
    projectLocalPointToCanvas(node, node.width / 2, -node.height / 2),
    projectLocalPointToCanvas(node, node.width / 2, node.height / 2),
    projectLocalPointToCanvas(node, -node.width / 2, node.height / 2),
  ];

  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  };
}

/**
 * 扫描预览画布中某个区域的主导颜色分布，判断是否同时存在蓝区和绿区。
 *
 * @param {import("playwright").Page} page
 * @param {{ minX: number; maxX: number; minY: number; maxY: number }} bounds
 * @returns {Promise<{ bounds: { minX: number; maxX: number; minY: number; maxY: number }; blueCount: number; greenCount: number; sampledCount: number; } | null>}
 */
async function summarizePreviewColorRegion(page, bounds) {
  return page.locator(".preview-stage-surface .lower-canvas").evaluate((canvas, targetBounds) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return null;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const minX = Math.max(0, Math.floor(Math.min(targetBounds.minX, targetBounds.maxX)));
    const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(targetBounds.minX, targetBounds.maxX)));
    const minY = Math.max(0, Math.floor(Math.min(targetBounds.minY, targetBounds.maxY)));
    const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(targetBounds.minY, targetBounds.maxY)));
    const width = Math.max(maxX - minX + 1, 1);
    const height = Math.max(maxY - minY + 1, 1);
    const data = context.getImageData(minX, minY, width, height).data;
    let blueCount = 0;
    let greenCount = 0;
    let sampledCount = 0;

    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const index = (y * width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];

        if (alpha < 220) {
          continue;
        }

        if (red > 245 && green > 245 && blue > 245) {
          continue;
        }

        sampledCount += 1;

        if (blue > green && blue > red) {
          blueCount += 1;
          continue;
        }

        if (green > blue && green > red) {
          greenCount += 1;
        }
      }
    }

    return {
      bounds: {
        minX,
        maxX,
        minY,
        maxY,
      },
      blueCount,
      greenCount,
      sampledCount,
    };
  }, bounds);
}

/**
 * 通过调试桥把当前选中态切回指定图片节点，方便刷新后继续读取属性面板回显。
 *
 * @param {import("playwright").Page} page
 * @param {string} slideId
 * @param {string} nodeId
 * @returns {Promise<void>}
 */
async function setCanvasSelection(page, slideId, nodeId) {
  await page.evaluate(({ currentSlideId, currentNodeId }) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("编辑器调试桥尚未就绪，无法恢复图片节点选中态");
    }

    const commandTypes = debugBridge.getCommandTypes();
    debugBridge.getController().execute({
      type: commandTypes.SELECTION_SET,
      slideId: currentSlideId,
      nodeIds: [currentNodeId],
    });
  }, {
    currentSlideId: slideId,
    currentNodeId: nodeId,
  });

  await page.waitForFunction((expectedNodeId) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      return false;
    }

    const snapshot = debugBridge.getSnapshot?.();
    const canvas = debugBridge.getCanvas?.();
    return (
      snapshot?.selection?.nodeIds?.[0] === expectedNodeId &&
      snapshot?.selection?.nodeIds?.length === 1 &&
      canvas?.getActiveObjects?.()?.length === 1
    );
  }, nodeId);
}

/**
 * 读取属性面板中指定标签对应的字段容器。
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
 * 读取属性面板中指定标签对应的输入框。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {import("playwright").Locator}
 */
function inspectorInput(page, label) {
  return inspectorField(page, label).locator("input").first();
}

/**
 * 确保右侧属性管理栏处于展开状态。
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
 * 确保右侧停留在“组件属性”标签。
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
async function ensureInspectorTabActive(page) {
  const tab = page.locator(".side-tabs-nav .arco-tabs-tab").filter({ hasText: "组件属性" });
  if ((await tab.getAttribute("aria-selected")) === "true") {
    return;
  }

  await tab.click();
}

/**
 * 更新属性面板里的数值输入框并触发 blur，让编辑结果进入标准保存链路。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {number} value
 * @returns {Promise<void>}
 */
async function setInspectorNumber(page, label, value) {
  const input = inspectorInput(page, label);
  await input.click();
  await input.fill(String(value));
  await input.blur();
}

/**
 * 在属性面板中选择一个下拉选项。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {string} optionText
 * @returns {Promise<void>}
 */
async function selectInspectorOption(page, label, optionText) {
  const field = inspectorField(page, label);
  await field.locator(".arco-select").click();
  await page.locator(".arco-select-option").filter({ hasText: optionText }).click();
}

/**
 * 读取属性面板中某个下拉框当前显示的文本。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {Promise<string>}
 */
async function readInspectorSelectText(page, label) {
  return (
    (await inspectorField(page, label).locator(".arco-select-view-value").textContent())?.trim() ?? ""
  );
}

/**
 * 读取单个开关当前是否开启。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {Promise<boolean>}
 */
async function readInspectorSwitchChecked(page, label) {
  return page.evaluate((targetLabel) => {
    const fields = Array.from(document.querySelectorAll(".toggle-field"));
    const field = fields.find((item) =>
      item.querySelector(".field-label")?.textContent?.includes(targetLabel),
    );
    const switchElement = field?.querySelector(".arco-switch");
    if (!(switchElement instanceof HTMLElement)) {
      return false;
    }

    const ariaChecked = switchElement.getAttribute("aria-checked");
    if (ariaChecked === "true") {
      return true;
    }

    if (ariaChecked === "false") {
      return false;
    }

    return switchElement.classList.contains("arco-switch-checked");
  }, label);
}

/**
 * 切换指定标签对应的开关。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @returns {Promise<void>}
 */
async function toggleInspectorSwitch(page, label) {
  await page.evaluate((targetLabel) => {
    const fields = Array.from(document.querySelectorAll(".toggle-field"));
    const field = fields.find((item) =>
      item.querySelector(".field-label")?.textContent?.includes(targetLabel),
    );
    const switchButton = field?.querySelector(".arco-switch");
    if (!(switchButton instanceof HTMLElement)) {
      throw new Error(`未找到开关：${targetLabel}`);
    }

    switchButton.click();
  }, label);
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
  fixturePath: IMAGE_FIXTURE_PATH,
  targetObjectFit: TARGET_OBJECT_FIT,
  targetOpacityPercent: TARGET_OPACITY_PERCENT,
  targetRotation: TARGET_ROTATION,
  targetCrop: TARGET_CROP,
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

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";

  logStep("insert local image");
  await page
    .locator(".toolbar-group-insert .local-image-file-trigger")
    .filter({ hasText: "图片" })
    .first()
    .locator("input[type='file']")
    .setInputFiles(IMAGE_FIXTURE_PATH);
  await waitForSaved(page);
  await ensureRightSidebarExpanded(page);
  await ensureInspectorTabActive(page);
  await page.getByRole("heading", { name: "图片属性" }).waitFor();

  logStep("edit image properties from inspector");
  await setInspectorNumber(page, "X", 320);
  await waitForSaved(page);
  await setInspectorNumber(page, "Y", 160);
  await waitForSaved(page);
  await setInspectorNumber(page, "宽度", 360);
  await waitForSaved(page);
  await setInspectorNumber(page, "高度", 240);
  await waitForSaved(page);
  await setInspectorNumber(page, "透明度", TARGET_OPACITY_PERCENT);
  await waitForSaved(page);
  await setInspectorNumber(page, "旋转", TARGET_ROTATION);
  await waitForSaved(page);
  await selectInspectorOption(page, "适配方式", "完整显示");
  await waitForSaved(page);
  await toggleInspectorSwitch(page, "水平翻转");
  await waitForSaved(page);
  await setInspectorNumber(page, "裁剪宽度", TARGET_CROP.width);
  await waitForSaved(page);
  await setInspectorNumber(page, "裁剪高度", TARGET_CROP.height);
  await waitForSaved(page);
  await setInspectorNumber(page, "裁剪 X", TARGET_CROP.x);
  await waitForSaved(page);
  await setInspectorNumber(page, "裁剪 Y", TARGET_CROP.y);
  await waitForSaved(page);

  const projectAfterEdit = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const editedImageNode = readImageNode(projectAfterEdit);

  summary.checks.push({
    id: "stored-image-node-after-edit",
    opacity: editedImageNode?.opacity ?? null,
    rotation: editedImageNode?.rotation ?? null,
    objectFit: editedImageNode?.props?.objectFit ?? null,
    flipX: editedImageNode?.props?.flipX ?? null,
    flipY: editedImageNode?.props?.flipY ?? null,
    crop: editedImageNode?.props?.crop ?? null,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-image-property-edit.png"),
    fullPage: true,
  });

  logStep("open preview mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
  await page.waitForTimeout(800);

  const previewRegionSummary = await summarizePreviewColorRegion(
    page,
    resolveProjectedBounds(editedImageNode),
  );
  const previewCenterPoint = projectLocalPointToCanvas(editedImageNode, 0, 0);
  const previewPixelCenter = await readPreviewCanvasPixel(page, previewCenterPoint.x, previewCenterPoint.y);

  summary.checks.push({
    id: "preview-pixels-after-edit",
    previewRegionSummary,
    previewCenterPoint,
    previewPixelCenter,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-after-image-property-edit.png"),
    fullPage: true,
  });

  logStep("reload and verify persistence");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "编辑" }).click();
  await page.waitForURL(/mode=edit$/);
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("项目标题").waitFor();
  await waitForSaved(page);
  await ensureRightSidebarExpanded(page);
  await ensureInspectorTabActive(page);
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));

  const projectAfterReload = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const reloadedImageNode = readImageNode(projectAfterReload);
  const activeSlideId = await page.evaluate(
    () => window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.activeSlideId ?? null,
  );
  if (!reloadedImageNode?.id || !activeSlideId) {
    throw new Error("刷新后未读取到目标图片节点或当前页面，无法验证属性面板回显");
  }

  await setCanvasSelection(page, activeSlideId, reloadedImageNode.id);
  const reloadedRotationValue = await inspectorInput(page, "旋转").inputValue();
  const reloadedOpacityValue = await inspectorInput(page, "透明度").inputValue();
  const reloadedCropXValue = await inspectorInput(page, "裁剪 X").inputValue();
  const reloadedCropWidthValue = await inspectorInput(page, "裁剪宽度").inputValue();
  const reloadedObjectFitLabel = await readInspectorSelectText(page, "适配方式");
  const reloadedFlipXChecked = await readInspectorSwitchChecked(page, "水平翻转");

  summary.checks.push({
    id: "reloaded-inspector-values",
    rotation: reloadedRotationValue,
    opacity: reloadedOpacityValue,
    cropX: reloadedCropXValue,
    cropWidth: reloadedCropWidthValue,
    objectFitLabel: reloadedObjectFitLabel,
    flipXChecked: reloadedFlipXChecked,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload-image-property-edit.png"),
    fullPage: true,
  });

  if (editedImageNode?.opacity !== TARGET_OPACITY_PERCENT / 100) {
    throw new Error(`图片透明度写回异常，当前值为 ${editedImageNode?.opacity ?? "null"}`);
  }

  if (editedImageNode?.rotation !== TARGET_ROTATION) {
    throw new Error(`图片旋转角度写回异常，当前值为 ${editedImageNode?.rotation ?? "null"}`);
  }

  if (editedImageNode?.props?.objectFit !== TARGET_OBJECT_FIT) {
    throw new Error(`图片适配方式写回异常，当前值为 ${editedImageNode?.props?.objectFit ?? "null"}`);
  }

  if (editedImageNode?.props?.flipX !== true || editedImageNode?.props?.flipY !== false) {
    throw new Error("图片翻转状态写回异常");
  }

  if (JSON.stringify(editedImageNode?.props?.crop ?? null) !== JSON.stringify(TARGET_CROP)) {
    throw new Error(`图片裁剪窗口写回异常，当前值为 ${JSON.stringify(editedImageNode?.props?.crop ?? null)}`);
  }

  if (reloadedImageNode?.opacity !== TARGET_OPACITY_PERCENT / 100) {
    throw new Error(`刷新后图片透明度恢复异常，当前值为 ${reloadedImageNode?.opacity ?? "null"}`);
  }

  if (reloadedImageNode?.rotation !== TARGET_ROTATION) {
    throw new Error(`刷新后图片旋转角度恢复异常，当前值为 ${reloadedImageNode?.rotation ?? "null"}`);
  }

  if (reloadedImageNode?.props?.objectFit !== TARGET_OBJECT_FIT) {
    throw new Error(`刷新后图片适配方式恢复异常，当前值为 ${reloadedImageNode?.props?.objectFit ?? "null"}`);
  }

  if (reloadedImageNode?.props?.flipX !== true || reloadedImageNode?.props?.flipY !== false) {
    throw new Error("刷新后图片翻转状态恢复异常");
  }

  if (JSON.stringify(reloadedImageNode?.props?.crop ?? null) !== JSON.stringify(TARGET_CROP)) {
    throw new Error(`刷新后图片裁剪窗口恢复异常，当前值为 ${JSON.stringify(reloadedImageNode?.props?.crop ?? null)}`);
  }

  if (reloadedRotationValue !== String(TARGET_ROTATION)) {
    throw new Error(`刷新后属性面板旋转值异常，当前值为 ${reloadedRotationValue}`);
  }

  if (reloadedOpacityValue !== String(TARGET_OPACITY_PERCENT)) {
    throw new Error(`刷新后属性面板透明度值异常，当前值为 ${reloadedOpacityValue}`);
  }

  if (reloadedCropXValue !== String(TARGET_CROP.x)) {
    throw new Error(`刷新后属性面板裁剪 X 值异常，当前值为 ${reloadedCropXValue}`);
  }

  if (reloadedCropWidthValue !== String(TARGET_CROP.width)) {
    throw new Error(`刷新后属性面板裁剪宽度值异常，当前值为 ${reloadedCropWidthValue}`);
  }

  if (!reloadedObjectFitLabel.includes("完整显示")) {
    throw new Error(`刷新后适配方式选择器未回显目标选项，当前值为 ${reloadedObjectFitLabel}`);
  }

  if (!reloadedFlipXChecked) {
    throw new Error("刷新后水平翻转开关未保持开启");
  }

  if (!previewRegionSummary || !Array.isArray(previewPixelCenter)) {
    throw new Error("预览画布像素读取失败，无法验证图片渲染结果");
  }

  if (previewRegionSummary.blueCount === 0 || previewRegionSummary.greenCount === 0) {
    throw new Error("图片翻转或裁剪后的左右颜色分布异常，预览渲染结果不符合预期");
  }

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("VNext-38-B 图片属性回归过程中出现控制台或运行时错误");
  }

  summary.result = "passed";
} catch (error) {
  summary.result = "failed";
  summary.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await writeJsonFile(path.join(ASSET_DIR, "summary.json"), summary);
  await browser.close();
}
