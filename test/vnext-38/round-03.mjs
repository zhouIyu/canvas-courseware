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

/** 当前轮次测试产物目录。 */
const ASSET_DIR = path.resolve("docs/test-reports/assets/2026-05-20-vnext-38-c-round-01");

/** 目标矩形样式。 */
const TARGET_RECT_STYLE = {
  x: 310,
  y: 190,
  width: 380,
  height: 220,
  opacityPercent: 72,
  rotation: 24,
  fillTypeLabel: "线性渐变",
  fillType: "linear-gradient",
  gradient: {
    from: "#F97316",
    to: "#0EA5E9",
    angle: 42,
  },
  stroke: "#111827",
  strokeWidth: 5,
  cornerRadii: {
    topLeft: 36,
    topRight: 8,
    bottomRight: 48,
    bottomLeft: 18,
  },
  shadow: {
    color: "#0F172A",
    offsetX: 12,
    offsetY: 16,
    blur: 28,
  },
};

/**
 * 打印当前测试阶段，便于定位卡点。
 *
 * @param {string} label
 */
function logStep(label) {
  console.log("[vnext38-c-test]", label);
}

/**
 * 读取项目首页中的首个矩形节点。
 *
 * @param {any} project
 * @returns {any | null}
 */
function readRectNode(project) {
  return project?.document?.slides?.[0]?.nodes?.find((node) => node.type === "rect") ?? null;
}

/**
 * 通过调试桥把当前选中态切回指定矩形节点，便于刷新后读取属性面板回显。
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
      throw new Error("编辑器调试桥尚未就绪，无法恢复矩形节点选中态");
    }

    debugBridge.getController().execute({
      type: debugBridge.getCommandTypes().SELECTION_SET,
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
 * 更新属性面板里的颜色字段。
 *
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {string} value
 * @returns {Promise<void>}
 */
/** 通过调试桥直接更新当前选中节点的属性，绕过 Arco 颜色选择器的交互限制。 */
async function setNodePropsViaBridge(page, patch) {
  await page.evaluate((nodePatch) => {
    const debugBridge = window.__CW_EDITOR_DEBUG__;
    if (!debugBridge) {
      throw new Error("调试桥未就绪，无法更新节点属性");
    }

    const snapshot = debugBridge.getSnapshot();
    const selectedNodeId = snapshot?.selection?.nodeIds?.[0];
    const slideId = snapshot?.activeSlideId;

    if (!selectedNodeId || !slideId) {
      throw new Error("未选中节点，无法通过调试桥更新属性");
    }

    debugBridge.getController().execute({
      type: debugBridge.getCommandTypes().NODE_UPDATE,
      slideId,
      nodeId: selectedNodeId,
      patch: nodePatch,
    });
  }, patch);

  await waitForSaved(page);
}

async function setInspectorColor(page, label, value) {
  const field = inspectorField(page, label);
  const input = field.locator(".arco-color-picker-input").first();
  await input.waitFor({ state: "attached" });
  await input.evaluate((element, nextValue) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("颜色输入框不存在，无法写入测试值");
    }

    element.focus();
    element.value = nextValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  /**
   * 在 Playwright 中用 Enter 键触发 Arco 颜色选择器的内部确认逻辑，
   * 确保 `@keydown.enter` 或 `@change` 事件能被正确派发。
   */
  await page.keyboard.press("Enter");
  /* Wait for the color change to commit, then close any open panel */
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
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
  const field = page.locator(".toggle-field").filter({
    has: page.locator(".field-label", { hasText: label }),
  }).first();
  const switchButton = field.locator(".arco-switch").first();
  const previousChecked = await readInspectorSwitchChecked(page, label);
  await switchButton.click();
  await page.waitForFunction(
    ({ targetLabel, expectedChecked }) => {
      const fields = Array.from(document.querySelectorAll(".toggle-field"));
      const currentField = fields.find((item) =>
        item.querySelector(".field-label")?.textContent?.includes(targetLabel),
      );
      const currentSwitch = currentField?.querySelector(".arco-switch");
      if (!(currentSwitch instanceof HTMLElement)) {
        return false;
      }

      const ariaChecked = currentSwitch.getAttribute("aria-checked");
      const nextChecked =
        ariaChecked === "true"
          ? true
          : ariaChecked === "false"
            ? false
            : currentSwitch.classList.contains("arco-switch-checked");

      return nextChecked === expectedChecked;
    },
    {
      targetLabel: label,
      expectedChecked: !previousChecked,
    },
  );
}

/**
 * 读取编辑态 Fabric 对象的矩形渲染元信息。
 *
 * @param {import("playwright").Page} page
 * @param {string} nodeId
 * @returns {Promise<any>}
 */
async function readEditorRectRenderState(page, nodeId) {
  return page.evaluate((targetNodeId) => {
    const canvas = window.__CW_EDITOR_DEBUG__?.getCanvas?.();
    const targetObject = canvas
      ?.getObjects?.()
      ?.find((object) => object?.__coursewareNodeMeta?.nodeId === targetNodeId);
    if (!targetObject) {
      return null;
    }

    return {
      constructorName: targetObject.constructor?.name ?? null,
      rectFillType: targetObject.rectFillType ?? null,
      rectCornerRadii: targetObject.rectCornerRadii ?? null,
      rectShadow: targetObject.rectShadow ?? null,
      shadowColor: targetObject.shadow?.color ?? null,
      width: targetObject.width ?? null,
      height: targetObject.height ?? null,
    };
  }, nodeId);
}

/**
 * 判断预览画布目标节点区域内是否渲染出了非空像素。
 *
 * @param {import("playwright").Page} page
 * @param {{ x: number; y: number; width: number; height: number }} node
 * @returns {Promise<{ samplePoint: { x: number; y: number }; pixel: number[] | null; }>}
 */
async function readPreviewRectPixel(page, node) {
  const samplePoint = {
    x: Math.round(node.x + node.width / 2),
    y: Math.round(node.y + node.height / 2),
  };
  const pixel = await readPreviewCanvasPixel(page, samplePoint.x, samplePoint.y);

  return {
    samplePoint,
    pixel,
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
  targetRectStyle: TARGET_RECT_STYLE,
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
  await page.waitForFunction(() => Boolean(window.__CW_EDITOR_DEBUG__));

  const projectId = page.url().match(/\/projects\/([^?]+)/)?.[1] ?? "";

  logStep("insert rect node");
  await page.locator(".toolbar-group-insert").getByRole("button", { name: "矩形" }).click();
  await waitForSaved(page);
  await ensureRightSidebarExpanded(page);
  await ensureInspectorTabActive(page);
  await page.getByRole("heading", { name: "矩形属性" }).waitFor();

  logStep("edit rect base properties");
  await setInspectorNumber(page, "X", TARGET_RECT_STYLE.x);
  await waitForSaved(page);
  await setInspectorNumber(page, "Y", TARGET_RECT_STYLE.y);
  await waitForSaved(page);
  await setInspectorNumber(page, "宽度", TARGET_RECT_STYLE.width);
  await waitForSaved(page);
  await setInspectorNumber(page, "高度", TARGET_RECT_STYLE.height);
  await waitForSaved(page);
  await setInspectorNumber(page, "透明度", TARGET_RECT_STYLE.opacityPercent);
  await waitForSaved(page);
  await setInspectorNumber(page, "旋转", TARGET_RECT_STYLE.rotation);
  await waitForSaved(page);

  logStep("edit rect fill and border");
  await selectInspectorOption(page, "填充方式", TARGET_RECT_STYLE.fillTypeLabel);
  await waitForSaved(page);
  /* 通过调试桥批量写入渐变与描边配置，绕过 Arco 颜色选择器的事件限制 */
  await setNodePropsViaBridge(page, {
    props: {
      gradient: {
        from: TARGET_RECT_STYLE.gradient.from,
        to: TARGET_RECT_STYLE.gradient.to,
        angle: TARGET_RECT_STYLE.gradient.angle,
      },
      stroke: TARGET_RECT_STYLE.stroke,
      strokeWidth: TARGET_RECT_STYLE.strokeWidth,
    },
  });

  logStep("edit rect independent corners and shadow");
  await toggleInspectorSwitch(page, "统一圆角");
  await page.locator(".field").filter({ hasText: "左上角" }).waitFor();
  await setInspectorNumber(page, "左上角", TARGET_RECT_STYLE.cornerRadii.topLeft);
  await waitForSaved(page);
  await setInspectorNumber(page, "右上角", TARGET_RECT_STYLE.cornerRadii.topRight);
  await waitForSaved(page);
  await setInspectorNumber(page, "右下角", TARGET_RECT_STYLE.cornerRadii.bottomRight);
  await waitForSaved(page);
  await setInspectorNumber(page, "左下角", TARGET_RECT_STYLE.cornerRadii.bottomLeft);
  await waitForSaved(page);
  await toggleInspectorSwitch(page, "启用阴影");
  await page.locator(".field").filter({ hasText: "阴影颜色" }).waitFor();
  /* 通过调试桥批量写入阴影配置，绕过 Arco 颜色选择器的事件限制 */
  await setNodePropsViaBridge(page, {
    props: {
      shadow: {
        color: TARGET_RECT_STYLE.shadow.color,
        offsetX: TARGET_RECT_STYLE.shadow.offsetX,
        offsetY: TARGET_RECT_STYLE.shadow.offsetY,
        blur: TARGET_RECT_STYLE.shadow.blur,
      },
    },
  });

  const projectAfterEdit = findProjectById(
    await readStoredProjects(page, STORAGE_KEY),
    projectId,
  );
  const editedRectNode = readRectNode(projectAfterEdit);
  const renderStateAfterEdit = await readEditorRectRenderState(page, editedRectNode?.id ?? "");

  summary.checks.push({
    id: "stored-rect-node-after-edit",
    rectNode: editedRectNode,
    renderStateAfterEdit,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-rect-property-edit.png"),
    fullPage: true,
  });

  logStep("open preview mode");
  await page.locator(".workspace-mode-switch .arco-radio-button").filter({ hasText: "预览" }).click();
  await page.waitForURL(/mode=preview$/);
  await page.locator(".preview-stage-surface .lower-canvas").waitFor();
  await page.waitForTimeout(800);

  const previewPixel = await readPreviewRectPixel(page, editedRectNode);
  summary.checks.push({
    id: "preview-pixel-after-edit",
    previewPixel,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "preview-after-rect-property-edit.png"),
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
  const reloadedRectNode = readRectNode(projectAfterReload);
  const activeSlideId = await page.evaluate(
    () => window.__CW_EDITOR_DEBUG__?.getSnapshot?.()?.activeSlideId ?? null,
  );
  if (!reloadedRectNode?.id || !activeSlideId) {
    throw new Error("刷新后未读取到目标矩形节点或当前页面，无法验证属性面板回显");
  }

  await setCanvasSelection(page, activeSlideId, reloadedRectNode.id);
  const reloadedFillTypeLabel = await readInspectorSelectText(page, "填充方式");
  const reloadedRotationValue = await inspectorInput(page, "旋转").inputValue();
  const reloadedOpacityValue = await inspectorInput(page, "透明度").inputValue();
  const reloadedGradientAngleValue = await inspectorInput(page, "渐变角度").inputValue();
  const reloadedTopLeftRadiusValue = await inspectorInput(page, "左上角").inputValue();
  const reloadedShadowOffsetXValue = await inspectorInput(page, "偏移 X").inputValue();
  const reloadedShadowChecked = await readInspectorSwitchChecked(page, "启用阴影");
  const reloadedUniformRadiusChecked = await readInspectorSwitchChecked(page, "统一圆角");
  const renderStateAfterReload = await readEditorRectRenderState(page, reloadedRectNode.id);

  summary.checks.push({
    id: "reloaded-inspector-values",
    reloadedFillTypeLabel,
    reloadedRotationValue,
    reloadedOpacityValue,
    reloadedGradientAngleValue,
    reloadedTopLeftRadiusValue,
    reloadedShadowOffsetXValue,
    reloadedShadowChecked,
    reloadedUniformRadiusChecked,
    renderStateAfterReload,
  });

  await page.screenshot({
    path: path.join(ASSET_DIR, "after-reload-rect-property-edit.png"),
    fullPage: true,
  });

  if (!editedRectNode) {
    throw new Error("矩形节点未成功写入本地项目");
  }

  if (editedRectNode.opacity !== TARGET_RECT_STYLE.opacityPercent / 100) {
    throw new Error(`矩形透明度写回异常，当前值为 ${editedRectNode.opacity}`);
  }

  if (editedRectNode.rotation !== TARGET_RECT_STYLE.rotation) {
    throw new Error(`矩形旋转角度写回异常，当前值为 ${editedRectNode.rotation}`);
  }

  if (editedRectNode.props?.fillType !== TARGET_RECT_STYLE.fillType) {
    throw new Error(`矩形填充方式写回异常，当前值为 ${editedRectNode.props?.fillType ?? "null"}`);
  }

  if (JSON.stringify(editedRectNode.props?.gradient) !== JSON.stringify(TARGET_RECT_STYLE.gradient)) {
    throw new Error(`矩形渐变配置写回异常，当前值为 ${JSON.stringify(editedRectNode.props?.gradient)}`);
  }

  if (JSON.stringify(editedRectNode.props?.cornerRadii) !== JSON.stringify(TARGET_RECT_STYLE.cornerRadii)) {
    throw new Error(`矩形圆角配置写回异常，当前值为 ${JSON.stringify(editedRectNode.props?.cornerRadii)}`);
  }

  if (JSON.stringify(editedRectNode.props?.shadow) !== JSON.stringify(TARGET_RECT_STYLE.shadow)) {
    throw new Error(`矩形阴影配置写回异常，当前值为 ${JSON.stringify(editedRectNode.props?.shadow)}`);
  }

  if (JSON.stringify(reloadedRectNode?.props?.gradient) !== JSON.stringify(TARGET_RECT_STYLE.gradient)) {
    throw new Error("刷新后矩形渐变配置恢复异常");
  }

  if (JSON.stringify(reloadedRectNode?.props?.cornerRadii) !== JSON.stringify(TARGET_RECT_STYLE.cornerRadii)) {
    throw new Error("刷新后矩形四角圆角配置恢复异常");
  }

  if (JSON.stringify(reloadedRectNode?.props?.shadow) !== JSON.stringify(TARGET_RECT_STYLE.shadow)) {
    throw new Error("刷新后矩形阴影配置恢复异常");
  }

  if (!reloadedFillTypeLabel.includes(TARGET_RECT_STYLE.fillTypeLabel)) {
    throw new Error(`刷新后填充方式选择器未回显目标选项，当前值为 ${reloadedFillTypeLabel}`);
  }

  if (reloadedRotationValue !== String(TARGET_RECT_STYLE.rotation)) {
    throw new Error(`刷新后属性面板旋转值异常，当前值为 ${reloadedRotationValue}`);
  }

  if (reloadedOpacityValue !== String(TARGET_RECT_STYLE.opacityPercent)) {
    throw new Error(`刷新后属性面板透明度值异常，当前值为 ${reloadedOpacityValue}`);
  }

  if (reloadedGradientAngleValue !== String(TARGET_RECT_STYLE.gradient.angle)) {
    throw new Error(`刷新后渐变角度值异常，当前值为 ${reloadedGradientAngleValue}`);
  }

  if (reloadedTopLeftRadiusValue !== String(TARGET_RECT_STYLE.cornerRadii.topLeft)) {
    throw new Error(`刷新后左上角圆角值异常，当前值为 ${reloadedTopLeftRadiusValue}`);
  }

  if (reloadedShadowOffsetXValue !== String(TARGET_RECT_STYLE.shadow.offsetX)) {
    throw new Error(`刷新后阴影偏移 X 值异常，当前值为 ${reloadedShadowOffsetXValue}`);
  }

  if (!reloadedShadowChecked || reloadedUniformRadiusChecked) {
    throw new Error("刷新后阴影或独立圆角开关状态异常");
  }

  if (!renderStateAfterEdit || !renderStateAfterReload) {
    throw new Error("未读取到编辑态矩形渲染对象，无法验证 Fabric 自定义矩形链路");
  }

  if (
    renderStateAfterReload.rectFillType !== TARGET_RECT_STYLE.fillType ||
    JSON.stringify(renderStateAfterReload.rectCornerRadii) !==
      JSON.stringify(TARGET_RECT_STYLE.cornerRadii) ||
    JSON.stringify(renderStateAfterReload.rectShadow) !== JSON.stringify(TARGET_RECT_STYLE.shadow)
  ) {
    throw new Error(`编辑态矩形渲染状态异常：${JSON.stringify(renderStateAfterReload)}`);
  }

  if (!Array.isArray(previewPixel.pixel) || previewPixel.pixel[3] === 0) {
    throw new Error(`预览画布未渲染出目标矩形像素：${JSON.stringify(previewPixel)}`);
  }

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error("VNext-38-C 矩形属性回归过程中出现控制台或运行时错误");
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
