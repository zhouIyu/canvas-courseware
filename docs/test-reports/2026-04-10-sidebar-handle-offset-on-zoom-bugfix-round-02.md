# 2026-04-10 浏览器缩放后侧栏按钮跑偏修复 Round 02

## 文档状态

- 当前状态：待复测
- 问题来源：在 Round 01 基础上，用户进一步要求“默认最小宽度 1280px；再小就不跟着缩放了，保证最小的三栏布局”
- 对应改动：为工作台页增加最小 `1280px` 宽度基线；窄视口改为横向滚动承载；编辑器 / 预览器的布局断点改为依据真实容器宽度判断
- 对应脚本：`pnpm test:bug-sidebar-handle-offset-on-zoom`
- 静态基线：`pnpm typecheck`、`pnpm build`
- 结果产物目录：`docs/test-reports/assets/2026-04-10-bug-sidebar-handle-offset-on-zoom-round-02/`

## 修复范围

- `apps/playground/src/views/ProjectWorkspacePage.css`
- `packages/vue/src/editor/CoursewareEditor.css`
- `packages/vue/src/preview/CoursewarePreview.css`
- `test/bug-sidebar-handle-offset-on-zoom/round-01.mjs`
- `docs/TODO.md`

## 根因分析

- Round 01 主要解决了“窄桌面时按钮漂进内容区”的问题，但工作台整体仍然会跟随浏览器视口继续收缩。
- 当浏览器缩放后等效宽度低于桌面基线时，工作台页外层没有提供固定的最小承载宽度，编辑器和预览器会继续被压缩。
- 另外，编辑器与预览器内部原先使用的是基于 viewport 的 `@media` 断点；即使外层未来保住了最小宽度，只要浏览器视口本身低于断点，它们依然会误判为“该切换到窄屏布局”。

## 修改说明

- 在工作台页壳层中增加 `1280px` 的最小宽度基线，并把横向溢出收口到 `.workspace-page` 自身，由页面容器负责横向滚动承载。
- 让 `.workspace-topbar` 与 `.workspace-stage` 统一按 `max(100%, 1280px)` 渲染，确保顶部工具区和编辑 / 预览主区始终共享同一条桌面宽度基线。
- 将编辑器与预览器壳层声明为 `container-type: inline-size`，把原先依赖 viewport 的关键布局断点改为 `@container`，避免“浏览器视口变小但组件真实宽度仍足够”时误触发单列 / 窄屏布局。
- 更新专项回归脚本：在 `960x760` 视口下打开项目，编辑态主动展开右侧管理栏，断言工作台 `scrollWidth` 大于 `clientWidth`、顶部和内容区宽度保持 `1280px`，并继续校验编辑态与预览态的三栏布局和侧栏 handle 位置。

## 验证结果

- `pnpm test:bug-sidebar-handle-offset-on-zoom`：通过
- `pnpm typecheck`：通过
- `pnpm build`：通过

## 给测试人员的复测步骤

1. 打开任一课件项目，进入编辑模式。
2. 将浏览器缩放或窗口宽度压到小于 `1280px`，例如接近 `960px` 的桌面可视宽度。
3. 确认工作台不再继续压缩成窄布局，而是通过横向滚动承载完整桌面结构。
4. 在编辑态展开右侧管理栏，确认左侧页面栏、中间画布区、右侧管理栏仍保持三栏布局。
5. 切换到预览模式，确认左侧页面栏、中间预览区、右侧步骤栏同样保持三栏布局。

## 预期复测结果

- 工作台在小于 `1280px` 的桌面宽度下不再继续缩放压缩，而是保持最小 `1280px` 的桌面基线。
- 编辑态展开右侧管理栏后仍保持三栏；预览态默认也保持三栏。
- 浏览器缩放后的左侧侧栏按钮不会再漂进画布内容区。

## 已知限制与剩余风险

- 当前策略是优先保障桌面编辑体验，窄视口下改为横向滚动，不再尝试移动端式折叠布局。
- 如果后续希望在小于 `1280px` 时指定“默认先看左栏”“默认居中画布”或“自动对齐到最近交互区域”的滚动落点，还可以在此基础上继续细化。
