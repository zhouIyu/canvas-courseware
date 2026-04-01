# 2026-04-01 缺陷回归测试报告 Round 07

## 回测状态

- 回测状态：通过
- 回测结论：基于 `docs/test-reports/2026-04-01-bugfix-round-06.md` 提供的修复说明进行优先回归，`BUG-04` 已复测通过。
- 对应初测报告：`docs/test-reports/2026-04-01-mvp-main-flow-round-06.md`
- 对应修复文档：`docs/test-reports/2026-04-01-bugfix-round-06.md`

## 回测范围

- `BUG-04` 编辑态仍按初始 `visible` 状态隐藏后续步骤对象
- 与该缺陷直接相关的最小关联链路：
  - 图层归属标签
  - 属性面板播放归属
  - 预览模式烟测

## 回测环境

- 回测日期：2026-04-01
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 操作系统：`Darwin 25.3.0 arm64`
- 浏览器执行环境：`Playwright 1.58.0`
- Python：`3.13.12`
- Node.js：`v24.14.0`
- pnpm：`10.30.3`
- 说明：按当前 `AGENTS.md` 约定，本轮回测未执行 `typecheck` / `build`

## 回测结果

### BUG-04 编辑态默认全显

- 回测状态：复测通过
- 执行路径：
  1. 打开示例项目“古诗讲解示例”
  2. 保持在编辑模式查看首页“课程封面”
  3. 检查画布中是否显示 `Poem Body` 与 `Voice Button`
  4. 打开“组件列表”确认后续步骤归属标签
  5. 选中 `Poem Body` 与 `Voice Button`，检查属性面板中的“播放归属”
- 回测结果：
  - 编辑态画布中，诗句正文 `Poem Body` 已可见
  - 编辑态画布中，语音按钮占位 `Voice Button` 已可见
  - 图层列表仍正确显示 `默认隐藏`、`第 1 步`、`第 2 步` 等归属标签
  - 属性面板仍正确显示步骤归属摘要与步骤名称

### 最小关联回归

- 预览模式烟测仍正常：示例项目可从 `已播放 0 / 2 步` 推进到 `已播放 1 / 2 步`，随后自动完成第 2 步，说明本次修复未破坏原有预览时间轴链路。

## 证据文件

- 编辑态恢复截图：`docs/test-reports/assets/2026-04-01-regression-round-07/bug-04-edit-restored.png`
- `Poem Body` 归属详情截图：`docs/test-reports/assets/2026-04-01-regression-round-07/bug-04-poem-body-detail.png`
- `Voice Button` 归属详情截图：`docs/test-reports/assets/2026-04-01-regression-round-07/bug-04-voice-button-detail.png`
- 预览烟测截图：`docs/test-reports/assets/2026-04-01-regression-round-07/bug-04-preview-still-ok.png`

## 未覆盖范围

- 工作台信息架构与大卡片占比问题未在本轮展开
- 拖拽、缩放、图层顺序调整未在本轮继续回归
- JSON 导入导出链路未在本轮继续复验

## 剩余风险

- `BUG-04` 已修复，但完整 MVP 主流程仍有剩余未覆盖项
- 下一步仍应优先处理工作台信息架构与核心区占比问题
