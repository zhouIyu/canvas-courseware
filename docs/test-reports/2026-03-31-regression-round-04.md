# 2026-03-31 缺陷回归测试报告 Round 04

## 回测状态

- 回测状态：通过
- 回测结论：基于 `docs/test-reports/2026-03-31-bugfix-round-03.md` 提供的修复说明进行优先回归，`BUG-03` 已复测通过。
- 对应初测报告：`docs/test-reports/2026-03-31-mvp-main-flow-round-03.md`
- 对应修复文档：`docs/test-reports/2026-03-31-bugfix-round-03.md`

## 回测范围

- `BUG-03` 导入 JSON 后切换到预览模式，画布为空白且点击无法推进步骤
- 与该缺陷直接相关的最小关联链路

## 回测环境

- 回测日期：2026-03-31
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 操作系统：`Darwin 25.3.0 arm64`
- 浏览器执行环境：`Playwright 1.58.0`
- Python：`3.13.12`
- Node.js：`v24.14.0`
- pnpm：`10.30.3`
- 说明：按当前 `AGENTS.md` 约定，本轮回测未执行 `typecheck` / `build`

## 回测结果

### BUG-03 导入后预览空白且无法播放

- 回测状态：复测通过
- 执行路径：
  1. 打开示例项目“古诗讲解示例”
  2. 导出标准 JSON
  3. 新建项目
  4. 导入刚才导出的 JSON
  5. 切换到预览模式
  6. 点击预览区域推进第一步
  7. 等待自动步骤执行完成
  8. 切换到“教学流程”页确认预览仍可用
- 回测结果：
  - 导入后的项目切到预览模式后，当前画布能正常显示封面标题、作者和卡片
  - 预览区下重新出现 `lower-canvas` 与 `upper-canvas` 两层 Fabric 画布
  - 点击预览区域后，播放状态从“已播放 0 / 2 步”推进到“已播放 1 / 2 步”
  - 自动步骤完成后，播放状态进一步变为“已播放 2 / 2 步 · 已完成”
  - 切换到“教学流程”页后，预览状态正确重置为“已播放 0 / 1 步”

### 最小关联回归

- 直接打开示例项目并切换到预览模式，点击播放和自动步骤执行仍正常，说明本次修复未破坏原本已可用的基础预览链路。

## 证据文件

- 导入后预览恢复截图：`docs/test-reports/assets/2026-03-31-regression-round-04/bug-03-preview-restored.png`
- 直接预览基线截图：`docs/test-reports/assets/2026-03-31-regression-round-04/baseline-preview-still-ok.png`
- 本轮导入文件：`docs/test-reports/assets/2026-03-31-regression-round-04/bug-03-import.json`
- 本轮导出文件：`docs/test-reports/assets/2026-03-31-regression-round-04/bug-03-export.json`

## 未覆盖范围

- 本轮未重新扩展到完整 MVP 主流程，只覆盖 `BUG-03` 及其最小关联链路
- canvas 清晰度、自适应缩放、编辑态步骤归属可视化等事项未在本轮继续展开

## 剩余风险

- `BUG-03` 已修复，但完整主流程仍有剩余未覆盖项，需要继续补测
- 当前 canvas 清晰度问题仍在 TODO 中，尚未完成专项验证与关闭
