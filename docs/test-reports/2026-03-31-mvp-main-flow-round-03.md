# 2026-03-31 MVP 主流程测试报告 Round 03

## 测试状态

- 测试状态：已回归通过
- 测试结论：本轮重点验证 JSON 导入导出闭环和 canvas 清晰度。Round 03 初测发现 1 条新的阻塞缺陷 `BUG-03`；基于 `docs/test-reports/2026-03-31-bugfix-round-03.md` 的修复内容完成 Round 04 回测后，该缺陷已通过回归验证。
- 本轮是否存在待复测修复文档：是，`docs/test-reports/2026-03-31-bugfix-round-03.md`
- 下一轮优先级：优先回归 `BUG-03`

## 测试范围

- JSON 导出下载
- JSON 合法导入与本地持久化
- JSON 非法导入错误提示与数据保护
- 导入后的最小预览闭环
- 编辑态 / 预览态 canvas 常规清晰度观察

## 测试环境

- 测试日期：2026-03-31
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 操作系统：`Darwin 25.3.0 arm64`
- 浏览器执行环境：`Playwright 1.58.0`
- Python：`3.13.12`
- Node.js：`v24.14.0`
- pnpm：`10.30.3`
- 说明：按当前 `AGENTS.md` 约定，本轮测试未执行 `typecheck` / `build`

## 已验证通过

- 点击“导出 JSON”后，可以正常下载标准 JSON 文件，示例项目导出文件名为 `古诗讲解示例-2026-03-31.json`。
- 导出的 JSON 包含 `version`、`meta`、`slides` 等核心结构；示例项目导出结果包含 `2` 个 slide，首页包含 `2` 个 timeline 步骤。
- 将一份合法修改后的 JSON 导入到新项目后，顶部项目标题、首页名称、首页背景色都会立即生效，并能保存到本地项目。
- 合法导入后的项目刷新页面后，标题、页面名称和背景色仍能恢复，说明导入后的落盘链路正常。
- 导入非法 JSON 后，页面会给出错误提示，且不会污染当前已导入成功的项目数据。
- 常规清晰度检查中，编辑态与预览态在 `devicePixelRatio=1` 下 canvas 内部像素尺寸与 CSS 尺寸一致，在 `devicePixelRatio=2` 下内部像素尺寸与 CSS 尺寸保持 `2x` 比例，当前测试场景中未观察到明显整体发糊。

## 缺陷明细

### BUG-03 导入 JSON 后切换到预览模式，画布为空白且点击无法推进步骤

- 状态：复测通过
- 严重级别：阻塞
- 影响范围：JSON 导入导出闭环、预览模式播放、PRD 中“能基于该 JSON 进行预览播放”的验收要求
- 前置条件：本地服务已启动，可访问 `http://127.0.0.1:32173/projects`
- 复现频率：2/2

#### 复现步骤

1. 进入项目列表页。
2. 打开示例项目“古诗讲解示例”。
3. 点击“导出 JSON”，得到一份标准 JSON 文件。
4. 返回项目列表，点击“新建项目”。
5. 点击“导入 JSON”，导入刚才导出的标准 JSON 文件。
6. 等待页面提示“已导入 ... 并保存到本地项目”。
7. 点击顶部“预览”切换到预览模式。
8. 观察当前画布，并点击预览区域尝试推进第一步。

#### 期望结果

1. 导入后的项目切到预览模式后，应正常渲染导入文档中的画布内容。
2. 预览画布应和直接打开示例项目时一致，显示封面标题、作者和卡片。
3. 点击预览画布后，应从“已播放 0 / 2 步”推进到“已播放 1 / 2 步”。

#### 实际结果

1. 预览面板上方的播放概览、步骤状态、slide 列表都显示正常，说明文档状态已被识别。
2. 但“当前画布”区域为空白，没有渲染导入文档中的可见内容。
3. 点击预览区域后，播放状态仍停留在“已播放 0 / 2 步 · 等待继续”，步骤无法推进。

#### 对照结果

- 直接打开示例项目并切换到预览模式时，画布可以正常显示，且点击后会推进到“已播放 1 / 2 步”。
- 同样的文档经“导出 JSON -> 导入新项目 -> 切预览”后出现空白，说明问题更接近导入后预览挂载或预览重建链路，而不是原始文档本身无效。
- 对照测试中，直接打开示例项目预览时 `.workspace-preview` 下存在 `lower-canvas` 与 `upper-canvas` 两层 Fabric 画布；导入后的预览只剩一个无类名的原始 `canvas` 节点。

#### 证据

- 截图：`docs/test-reports/assets/2026-03-31-mvp-main-flow-round-03/imported-preview-bug.png`

#### 排查线索

- 建议开发优先检查 [ProjectWorkspacePage.vue](/Users/admin/MyDemo/canvas-courseware/apps/playground/src/views/ProjectWorkspacePage.vue#L417) 中编辑器与预览器通过 `v-show` 切换的工作台渲染方式。
- 建议开发重点检查 [CoursewarePreview.vue](/Users/admin/MyDemo/canvas-courseware/packages/vue/src/preview/CoursewarePreview.vue#L49) 的文档替换逻辑，以及 [useCoursewarePreview.ts](/Users/admin/MyDemo/canvas-courseware/packages/vue/src/preview/useCoursewarePreview.ts#L73) 中仅在 `onMounted` 时执行一次 `mountAdapter` 的挂载流程，确认导入后切换模式时是否遗漏了 Fabric 预览层的重新挂载。

#### 回测结果

- 回测轮次：Round 04
- 回测状态：复测通过
- 回测结论：
  - 导入后的项目切到预览模式后，`canvas` 恢复为 `lower-canvas` 与 `upper-canvas` 两层 Fabric 画布
  - 当前画布能正常显示封面标题、作者和卡片
  - 点击预览区域后，播放状态可从“已播放 0 / 2 步”推进到“已播放 1 / 2 步”，随后自动完成第 2 步
  - 切换到“教学流程”页后，预览状态也会正确重置为“已播放 0 / 1 步”
- 回测证据：
  - `docs/test-reports/assets/2026-03-31-regression-round-04/bug-03-preview-restored.png`
  - `docs/test-reports/assets/2026-03-31-regression-round-04/baseline-preview-still-ok.png`

## 清晰度检查记录

- 编辑态 `devicePixelRatio=1`
  - canvas 属性尺寸：`1280 x 720`
  - CSS 实际尺寸：`1280 x 720`
  - 比例：`1x`
- 预览态 `devicePixelRatio=1`
  - canvas 属性尺寸：`1280 x 720`
  - CSS 实际尺寸：`1280 x 720`
  - 比例：`1x`
- 编辑态 `devicePixelRatio=2`
  - canvas 属性尺寸：`2560 x 1440`
  - CSS 实际尺寸：`1280 x 720`
  - 比例：`2x`
- 预览态 `devicePixelRatio=2`
  - canvas 属性尺寸：`2560 x 1440`
  - CSS 实际尺寸：`1280 x 720`
  - 比例：`2x`
- 结论：在本轮覆盖的桌面默认显示和高分屏场景中，未观察到明显整体发糊；但“自适应缩放后清晰度”尚未专项覆盖，不能据此关闭 TODO 中的清晰度问题。

## 证据文件

- 导出文件：`docs/test-reports/assets/2026-03-31-mvp-main-flow-round-03/exported-demo.json`
- 合法导入文件：`docs/test-reports/assets/2026-03-31-mvp-main-flow-round-03/valid-import.json`
- 非法导入文件：`docs/test-reports/assets/2026-03-31-mvp-main-flow-round-03/invalid-import.json`
- 合法导入成功截图：`docs/test-reports/assets/2026-03-31-mvp-main-flow-round-03/json-import-success.png`
- 非法导入提示截图：`docs/test-reports/assets/2026-03-31-mvp-main-flow-round-03/json-import-invalid.png`
- 编辑态清晰度截图：`docs/test-reports/assets/2026-03-31-mvp-main-flow-round-03/edit-dpr1.png`
- 预览态高分屏截图：`docs/test-reports/assets/2026-03-31-mvp-main-flow-round-03/preview-dpr2.png`
- 导入后预览空白截图：`docs/test-reports/assets/2026-03-31-mvp-main-flow-round-03/imported-preview-bug.png`

## 未覆盖范围

- 拖拽、缩放、图层上移下移 / 置顶置底未做本轮回归
- 编辑态“步骤归属可视化”仍未覆盖
- canvas 在更小视口下的自适应缩放清晰度未做专项验证

## 剩余风险

- `BUG-03` 已回归通过，但本轮仍未重新扩展到完整 MVP 主流程覆盖。
- 当前清晰度测试只覆盖默认桌面视口和高分屏基础场景，对复杂缩放场景仍需继续验证。
