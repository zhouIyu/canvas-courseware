# 2026-05-12 编辑页底部显示不全 Fix Round 01

## 问题来源

- 来源文档：`docs/test-reports/2026-05-12-bug-editor-bottom-clipped-round-01.md`
- 问题状态：待复测

## 修复范围

- 工作台页 `workspace-stage` 在加载态切换为正式编辑态后的高度监听重绑
- 编辑器 / 预览器 `height` 入参恢复为真实可用高度，而不是默认兜底高度

## 根因分析

- `ProjectWorkspacePage` 首次 `onMounted` 时，页面仍处于 `isLoading` 状态，正式工作区容器 `workspace-stage` 尚未渲染到 DOM。
- 当时 `workspaceStageRef` 为空，`ResizeObserver` 没有绑定成功，`workspaceViewportHeight` 也停留在 `0`。
- 后续项目数据恢复完成并渲染编辑器后，没有任何逻辑重新绑定 `ResizeObserver` 或重新计算高度。
- 结果是 `CoursewareEditor` / `CoursewarePreview` 一直吃到组件内部默认高度 `840px`，在 `1440 x 900` 视口下把底部工作区直接挤出首屏。

## 修改说明

- 在 `apps/playground/src/views/ProjectWorkspacePage.vue` 中新增工作区高度监听的重连逻辑，统一封装断开与重绑行为。
- `onMounted` 时不再只做一次性绑定，而是调用可复用的 `reconnectWorkspaceStageResizeObserver()`。
- 新增对 `workspaceStageRef` 的监听：当正式工作区 DOM 真正出现时，立即重新绑定 `ResizeObserver` 并同步一次高度。
- 新增对 `[isLoading, documentModel, workspaceMode]` 的监听：在数据恢复完成、工作区可见后再次强制刷新高度，保证编辑态和预览态都能收到真实值。

## 影响文件

- `apps/playground/src/views/ProjectWorkspacePage.vue`

## 验证结果

- 已执行：`pnpm test:bug-editor-bottom-clipped`
- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 结果：通过
- 关键复测数据：
  - 编辑器组件收到的 `height` 已从错误的 `840px` 恢复为正确的 `818px`
  - `editor-shell` 底部从 `+8px` 越界变为 `-14px`
  - `slide-rail-host`、`workspace-shell`、`editor-side` 底部从 `+18px` 越界变为 `-4px`
  - 页面与文档总高度都回到 `900px`，未再出现首屏裁切

## 测试人员复测步骤

1. 启动本地开发服务并打开 `http://127.0.0.1:32173/projects`
2. 以 `1440 x 900` 视口打开任意示例项目，进入编辑态
3. 展开右侧管理栏，并切换到“时间轴”标签
4. 观察左侧页面栏、中间画布区、右侧管理栏底部是否都完整落在首屏内
5. 执行 `pnpm test:bug-editor-bottom-clipped`，确认脚本通过

## 预期复测结果

- 编辑页首屏不再出现底部裁切
- 三栏关键容器底部均不应超出视口底部
- 若右侧时间轴内容较长，应由 `.editor-side-body` 内部滚动承载，而不是整页底部被截断

## 已知限制或剩余风险

- 当前修复针对的是加载态切换后未重绑高度监听的问题。
- 仓库中仍有用户本地未提交的 `packages/vue/src/editor/CoursewareEditor.css` 样式调整，本次未介入其具体视觉改动；若后续继续扩大侧栏垂直内边距或顶部条高度，仍建议沿用现有 Playwright 回归脚本持续守护。
