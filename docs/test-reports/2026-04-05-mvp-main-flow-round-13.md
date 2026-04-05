# 2026-04-05 MVP 主流程测试报告 Round 13

## 测试状态

- 测试状态：通过
- 测试结论：本轮围绕当前版本 MVP 主流程执行真实页面烟测，当前覆盖范围内未发现新缺陷。项目创建、基础编辑、自动保存、刷新恢复、预览推进、JSON 导出与导入链路均通过。
- 本轮是否存在待复测修复文档：否

## 测试范围

- 项目列表进入工作台
- 新建项目与项目标题修改
- 编辑态新增 `Text` / `Rect` / `Image`
- 时间轴最小配置：新增 1 个步骤
- 多 slide 基础管理：新增第 2 页并切回首页
- 自动保存与刷新恢复
- 工作台内嵌预览态页面点击推进步骤
- JSON 导出
- JSON 导入

## 测试环境

- 测试日期：2026-04-05
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 操作系统：`Darwin 25.3.0 arm64`
- 浏览器执行环境：`Playwright 1.58.0`（Python chromium）
- Python：`3.13.12`
- Node.js：`v24.14.0`
- pnpm：`10.30.3`
- 说明：按当前 `AGENTS.md` 约定，本轮测试未执行 `typecheck` / `build`

## 已验证通过

- 项目列表页可以正常打开，并能从“新建项目”进入工作台。
- 项目标题修改为 `MVP主流程烟测Round13` 后，自动保存可恢复为 `已保存`。
- 在编辑态新增 `Text`、`Rectangle`、`Image` 后，首个 slide 节点数为 `3`。
- 在时间轴面板新增 1 个步骤后，首个 slide 步骤数为 `1`。
- 新增第 2 页后，文档页数为 `2`，并能切回第一页继续操作。
- 刷新页面后，项目标题与 `2` 页结构仍可从本地存储恢复。
- 切换到工作台内嵌预览态后，当前步骤触发方式会显示为 `点击页面继续`。
- 在预览画布中点击页面后，右侧步骤卡片状态从当前步骤推进为 `is-done`，说明 `page-click` 步骤已完成。
- 导出 JSON 成功，导出文件中包含：
  - `2` 个 slides
  - 首个 slide `3` 个 nodes
  - 首个 slide `1` 个步骤
  - 标题 `MVP主流程烟测Round13`
- 在新建空项目中导入刚导出的 JSON 后，工作台会显示导入成功提示，并恢复：
  - 标题 `MVP主流程烟测Round13`
  - `2` 个 slides
  - 首个 slide `3` 个 nodes
  - 首个 slide `1` 个步骤

## 关键观察

- 当前 `VNext-01` 相关历史链路修复没有带坏本轮覆盖的 MVP 主流程。
- 工作台内嵌预览模式虽然不显示顶部“播放下一步”按钮，但 `page-click` 步骤依然可以通过点击画布正常推进。
- 当前导出产物与导入结果在标题、页数、节点数和步骤数上保持一致，说明 JSON I/O 基础闭环仍然稳定。

## 证据文件

- `docs/test-reports/assets/2026-04-05-mvp-main-flow-round-13/edit-overview.png`
- `docs/test-reports/assets/2026-04-05-mvp-main-flow-round-13/after-reload.png`
- `docs/test-reports/assets/2026-04-05-mvp-main-flow-round-13/preview-before-play.png`
- `docs/test-reports/assets/2026-04-05-mvp-main-flow-round-13/preview-after-play.png`
- `docs/test-reports/assets/2026-04-05-mvp-main-flow-round-13/after-import.png`
- `docs/test-reports/assets/2026-04-05-mvp-main-flow-round-13/mvp-round13-export.json`

## 未覆盖范围

- 本轮未继续覆盖 `Text` 画布缩放；该问题仍受已挂起的 `BUG-05` 影响
- 本轮未覆盖对象删除入口、复杂时间轴多步骤编排、对象点击触发与自动触发混合链路
- 本轮未覆盖快捷键撤销 / 重做、复制粘贴、多选与框选；这些属于 `VNext-02 ~ VNext-04` 范围

## 剩余风险

- 当前 MVP 主流程烟测通过，但仍不能替代更复杂编排场景与已挂起缺陷的专项回归。
- 如果后续继续调整工作台模式切换、预览渲染、JSON 导入导出或本地持久化链路，建议优先回归本轮这条主流程路径。
