# 2026-04-01 缺陷回归测试报告 Round 15

## 回测状态

- 回测状态：复测失败
- 回测结论：基于 `docs/test-reports/2026-04-01-bugfix-round-14.md` 执行复测后，`BUG-05` 仍未关闭。`Text` 缩放在第三轮修复后依然失败；`Rectangle / Image` 缩放链路继续保持可用。
- 对应初测报告：`docs/test-reports/2026-04-01-mvp-main-flow-round-12.md`
- 对应修复文档：`docs/test-reports/2026-04-01-bugfix-round-14.md`
- 当前问题状态：已挂起（2026-04-02 按用户决定暂时关闭，不作为当前阶段继续处理项）

## 回测范围

- `BUG-05` 中 `Text` 对象缩放仍未生效
- 与该剩余问题直接相关的最小关联链路：
  - `Text` 右下角控制点缩放
  - `Text` 缩放后的自动保存表现
  - `Rectangle` 缩放能力未被本轮修复带坏
  - `Image` 缩放能力未被本轮修复带坏

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

### BUG-05 剩余问题：`Text` 缩放

- 回测状态：复测失败
- 执行路径：
  1. 进入项目列表页
  2. 点击“新建项目”
  3. 点击“文本”新增单个 `Text` 对象
  4. 围绕右下角及其邻近命中区域执行多组缩放尝试
  5. 观察文本对象尺寸与本地存储结果
- 回测结果：
  - `Text` 缩放前：`width=420, height=72`
  - `Text` 缩放后：`width=420, height=72`
  - 多组控制点偏移尝试后，文本对象宽高仍未变化
  - 说明当前第三轮修复仍未打通 `Textbox` 的实际缩放链路

### 最小关联回归

- `Rectangle` 缩放仍正常：
  - 本轮单项回归中，`Rectangle` 由 `280 x 180` 增长到 `773.804 x 499.508`
- `Image` 缩放仍正常：
  - 本轮单项回归中，`Image` 由 `260 x 220` 增长到 `609.111 x 516.202`

## 证据文件

- `docs/test-reports/assets/2026-04-01-regression-round-15/text-scale-still-fails.png`
- `docs/test-reports/assets/2026-04-01-regression-round-15/rect-scale-pass.png`
- `docs/test-reports/assets/2026-04-01-regression-round-15/image-scale-pass.png`

## 未覆盖范围

- `Text` 缩放修复后的再次回归尚未执行
- 缩放后的刷新恢复未在本轮对 `Text` 单独继续验证，因为基础缩放本身未成功
- 多 slide、时间轴配置、旋转后再缩放等组合场景未在本轮覆盖

## 剩余风险

- 当前 `BUG-05` 的唯一未关闭项仍然收敛到 `Text` 缩放链路，但它持续阻塞编辑态“支持缩放”的统一验收。
- 下一步建议开发直接对 `Textbox` 控制点命中、控制点 key、`action` 和变换事件产物做专门埋点取证。
