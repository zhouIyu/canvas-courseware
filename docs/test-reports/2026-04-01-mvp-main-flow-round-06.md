# 2026-04-01 MVP 主流程测试报告 Round 06

## 测试状态

- 测试状态：已回归通过
- 测试结论：本轮优先验证“编辑态步骤归属可视化”。Round 06 初测发现 `BUG-04`；基于 `docs/test-reports/2026-04-01-bugfix-round-06.md` 的修复内容完成 Round 07 回测后，该缺陷已通过回归验证。
- 本轮是否存在待复测修复文档：是，`docs/test-reports/2026-04-01-bugfix-round-06.md`

## 测试范围

- 编辑态步骤归属可视化
- 图层列表中的默认显隐与步骤归属提示
- 属性面板中的播放归属摘要
- 最小预览主流程烟测

## 测试环境

- 测试日期：2026-04-01
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 操作系统：`Darwin 25.3.0 arm64`
- 浏览器执行环境：`Playwright 1.58.0`
- Python：`3.13.12`
- Node.js：`v24.14.0`
- pnpm：`10.30.3`
- 说明：按当前 `AGENTS.md` 约定，本轮测试未执行 `typecheck` / `build`

## 已验证通过

- 示例项目首页图层列表中，`Course Title`、`Author Name`、`Poem Card` 会显示 `默认显示` 与 `未加入步骤` 标签。
- 示例项目首页图层列表中，`Poem Body` 会显示 `默认隐藏`、`第 1 步` 和 `第 1 步 起参与播放` 标签。
- 示例项目首页图层列表中，`Voice Button` 会显示 `默认隐藏`、`第 2 步` 和 `第 2 步 起参与播放` 标签。
- 选中未加入时间轴的 `Course Title` 后，组件属性面板中的“播放归属”区域会显示 `未编排`、`默认显示` 和“当前对象尚未加入时间轴步骤”。
- 选中 `Poem Body` 后，组件属性面板中的“播放归属”区域会显示 `1 个步骤`、`默认隐藏`、`第 1 步` 和步骤名称 `展示诗句内容`。
- 选中 `Voice Button` 后，组件属性面板中的“播放归属”区域会显示 `1 个步骤`、`默认隐藏`、`第 2 步` 和步骤名称 `展示语音按钮`。
- 预览模式烟测通过：示例项目仍可从 `已播放 0 / 2 步` 推进到 `已播放 1 / 2 步`，随后自动完成第 2 步。

## 缺陷明细

### BUG-04 编辑态仍按初始 `visible` 状态隐藏后续步骤对象，未满足“默认全显”

- 状态：复测通过
- 严重级别：高
- 影响范围：编辑态排版、步骤配置效率、PRD 中“编辑态默认展示当前 slide 的全部元素”的核心要求
- 前置条件：本地服务已启动，可访问 `http://127.0.0.1:32173/projects`
- 复现频率：2/2

#### 复现步骤

1. 进入项目列表页。
2. 打开示例项目“古诗讲解示例”。
3. 保持在编辑模式，定位到首页“课程封面”。
4. 观察画布中是否显示诗句正文 `Poem Body` 与语音按钮 `Voice Button`。
5. 打开“组件列表”查看图层归属信息。

#### 期望结果

1. 编辑态应默认展示当前 slide 的全部元素，即使这些元素在预览态需要等到后续步骤才出现。
2. `Poem Body` 与 `Voice Button` 在编辑态画布中也应可见，只是通过归属标签提示它们属于后续步骤。

#### 实际结果

1. 图层列表和属性面板已经明确标识 `Poem Body`、`Voice Button` 属于后续步骤。
2. 但编辑画布首屏仍只显示标题、作者和卡片，`Poem Body` 与 `Voice Button` 没有被绘制出来。
3. 这说明当前编辑态仍在沿用节点原始 `visible` 状态控制显示，而不是执行“默认全显”的编辑策略。

#### 证据

- 编辑态总览截图：`docs/test-reports/assets/2026-04-01-mvp-main-flow-round-06/edit-demo-overview.png`
- `Poem Body` 归属详情截图：`docs/test-reports/assets/2026-04-01-mvp-main-flow-round-06/inspector-poem-body-detail.png`

#### 排查线索

- 建议开发优先检查编辑态 Fabric 适配器或节点同步逻辑，确认编辑模式下是否仍直接消费节点 `visible` 字段。
- 从测试现象看，时间轴归属摘要已经正确生成，问题更像是“展示策略未切换”，而不是“归属数据缺失”。

#### 回测结果

- 回测轮次：Round 07
- 回测状态：复测通过
- 回测结论：
  - 编辑态画布中，`Poem Body` 与 `Voice Button` 已恢复可见，满足“默认全显”
  - 图层列表中的 `默认隐藏`、`第 1 步`、`第 2 步` 等归属标签仍保持正确
  - 属性面板中的“播放归属”摘要仍保持正确
  - 预览模式烟测未受影响，仍能从 `已播放 0 / 2 步` 推进到 `已播放 2 / 2 步`
- 回测证据：
  - `docs/test-reports/assets/2026-04-01-regression-round-07/bug-04-edit-restored.png`
  - `docs/test-reports/assets/2026-04-01-regression-round-07/bug-04-poem-body-detail.png`
  - `docs/test-reports/assets/2026-04-01-regression-round-07/bug-04-voice-button-detail.png`
  - `docs/test-reports/assets/2026-04-01-regression-round-07/bug-04-preview-still-ok.png`

## 证据文件

- `docs/test-reports/assets/2026-04-01-mvp-main-flow-round-06/edit-demo-overview.png`
- `docs/test-reports/assets/2026-04-01-mvp-main-flow-round-06/inspector-course-title.png`
- `docs/test-reports/assets/2026-04-01-mvp-main-flow-round-06/inspector-poem-body-detail.png`
- `docs/test-reports/assets/2026-04-01-mvp-main-flow-round-06/preview-smoke.png`

## 未覆盖范围

- 工作台信息架构与大卡片占比问题未在本轮展开
- 拖拽、缩放、图层顺序调整未在本轮继续回归
- JSON 导入导出链路未在本轮继续复验

## 剩余风险

- `BUG-04` 已回归通过，但工作台信息架构与大卡片占比问题仍未处理。
- 本轮仅覆盖 `BUG-04` 修复路径和最小关联烟测，未重新扩展到完整 MVP 主流程。
