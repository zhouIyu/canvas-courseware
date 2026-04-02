# 2026-04-01 缺陷回归测试报告 Round 13

## 回测状态

- 回测状态：复测失败
- 回测结论：基于 `docs/test-reports/2026-04-01-bugfix-round-12.md` 执行回归后，`BUG-05` 尚未完全关闭。`Rectangle` 缩放链路已恢复，`Image` 单项缩放通过，但 `Text` 缩放仍未生效。
- 对应初测报告：`docs/test-reports/2026-04-01-mvp-main-flow-round-12.md`
- 对应修复文档：`docs/test-reports/2026-04-01-bugfix-round-12.md`

## 回测范围

- `BUG-05` 编辑态对象缩放交互未生效
- 与该缺陷直接相关的最小关联链路：
  - `Rectangle` 先拖拽再缩放
  - 缩放后的自动保存与刷新恢复
  - `Text` 单对象缩放
  - `Image` 单对象缩放

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

### BUG-05 编辑态缩放核心链路

- 回测状态：复测失败
- `Rectangle` 路径：复测通过
  - 在新建项目中新增 `Rectangle` 后，可先完成拖拽，再拖动右下角控制点完成缩放。
  - 缩放后右侧属性面板中的“宽度 / 高度”会同步更新。
  - 自动保存完成后刷新页面，缩放后的尺寸仍能恢复，说明落盘链路可用。
- `Text` 路径：复测失败
  - 在只包含单个 `Text` 对象的新建项目中，围绕右下角控制点执行多组缩放尝试后，节点尺寸仍保持不变。
  - 本轮聚焦取证中，`Text` 缩放前后均为 `width=420, height=72`，说明当前修复尚未覆盖文本对象缩放链路。
- `Image` 路径：复测通过
  - 在只包含单个 `Image` 对象的新建项目中，缩放后尺寸明显变化，并成功写入本地存储。
  - 本轮聚焦取证中，`Image` 由 `width=260, height=220` 增长到 `width=609.111, height=516.202`。

### 关键观察

- 本轮修复已经改善了 `Rectangle` 和 `Image` 的控制点命中与尺寸落盘，但 `Text` 仍然没有进入有效缩放。
- 因为 `BUG-05` 对应的是“编辑态对象缩放能力”这一统一验收项，所以只要 `Text` 仍失败，就不能将该缺陷标记为通过。

## 证据文件

- `docs/test-reports/assets/2026-04-01-regression-round-13/rect-resized.png`
- `docs/test-reports/assets/2026-04-01-regression-round-13/rect-reload-restored.png`
- `docs/test-reports/assets/2026-04-01-regression-round-13/text-scale-still-fails.png`
- `docs/test-reports/assets/2026-04-01-regression-round-13/image-scale-pass.png`

## 未覆盖范围

- `Text / Rect / Image` 与图层顺序、时间轴配置混合操作的组合场景未在本轮继续扩展
- 多 slide 下的对象缩放未在本轮覆盖
- 旋转与缩放连续组合操作未在本轮覆盖

## 剩余风险

- 当前 `Rectangle` 和 `Image` 缩放链路虽已恢复，但 `Text` 缩放仍未通过，MVP 编辑态“支持缩放”的验收要求仍未完全满足。
- 下一轮修复应优先聚焦 `Text` 对象的控制点命中与尺寸落盘链路，并在修复后回归三类对象的一致性。
