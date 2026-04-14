# 2026-04-13 VNext-32 工作台首屏崩溃修复 Round 01

## 问题来源

- 来源测试文档：`docs/test-reports/2026-04-13-vnext-32-round-01.md`
- 来源问题：`BUG-2026-04-13 VNext-32-A 工作台创建后崩溃`
- 当前状态：复测通过

## 修复范围

- 新建项目进入工作台后的首屏渲染链路
- `CoursewareEditor` 与 `EditorCanvasWorkspace` 之间的画布句柄传递逻辑
- 编辑器首屏挂载阶段的 canvas 回传方式

## 根因分析

- `VNext-32-A` 拆分后，父组件 `CoursewareEditor` 通过模板把 `editorCanvasRef` 直接作为 prop 传给 `EditorCanvasWorkspace`。
- Vue 在模板中会自动解包 `ref`，子组件实际拿到的是当时的 `editorCanvasRef.value`，首屏挂载阶段该值为 `null`。
- 子组件在 `<canvas>` 挂载时继续执行 `props.canvasRef.value = ...`，等价于对 `null.value` 赋值，因此在新建项目进入工作台的首屏阶段直接触发 `TypeError: Cannot set properties of null (setting 'value')`。

## 修改说明

- 将 `EditorCanvasWorkspace` 的输入从“接收 `canvasRef` 对象”调整为“接收 `setCanvasElement` 回调”，避免依赖模板保留 `ref` 实例。
- 将子组件内部的 `<canvas>` 赋值逻辑改为通过回调把真实的 `HTMLCanvasElement | null` 回传给父组件。
- 在 `CoursewareEditor` 中新增 `handleEditorCanvasElementChange`，由父组件统一接收 canvas 节点并写回 `editorCanvasRef`，供 Fabric 适配器挂载使用。
- 对修复点补充注释，明确记录 Vue 模板自动解包 `ref` 的约束，避免后续拆分时重复踩坑。

## 影响文件

- `packages/vue/src/editor/CoursewareEditor.vue`
- `packages/vue/src/editor/EditorCanvasWorkspace.vue`
- `docs/TODO.md`

## 验证结果

- 已完成本地静态自查：确认工作台相关链路中，这一处是当前唯一直接把 `ref` 作为 prop 传递给子组件的实现。
- 已确认修复后，子组件内不再存在对 `null.value` 的直接写入路径。
- 2026-04-13 测试复测补充：已复用并更新 `test/vnext-32/round-01.mjs`，在 Google Chrome Headless 下完成自动化回归，确认新建项目进入工作台、插入文本、手动保存、编辑 / 预览切换与返回编辑主链路全部通过。
- 复测期间未再出现 `TypeError: Cannot set properties of null (setting 'value')`，页面运行时异常与额外控制台错误均未复现。
- 当前结论：代码修复已完成并复测通过，详见 `docs/test-reports/2026-04-13-vnext-32-round-02.md`。

## 测试人员复测步骤

1. 启动本地开发服务，并访问 `http://127.0.0.1:32173/projects`。
2. 点击“新建项目”。
3. 在弹窗中点击“创建并进入工作台”。
4. 等待页面跳转到 `/projects/<projectId>?mode=edit`。
5. 确认顶部 `项目标题` 输入框已经出现，编辑器首屏已完成渲染。
6. 继续执行一次基础冒烟：插入文本或矩形、点击保存、切换到预览模式，再切回编辑模式。
7. 复用脚本 `test/vnext-32/round-01.mjs` 做自动化回归。

## 预期复测结果

- 新建项目后进入工作台不再出现 `TypeError: Cannot set properties of null (setting 'value')`。
- 工作台顶部、左侧页面栏、中间画布区和右侧管理区均可正常渲染。
- `项目标题` 输入框可见且可编辑。
- 编辑器主链路可继续执行插入、保存和模式切换，不再被首屏异常阻塞。

## 已知限制与剩余风险

- 本次修改只覆盖已定位到的 canvas 句柄传递链路；虽然当前首屏崩溃已复测通过，后续推进 `VNext-32-B` 时仍建议持续关注工作台首屏挂载、编辑器初始化和模式切换相关回归。
- 本轮复测未额外覆盖 `pnpm typecheck` 与 `pnpm build`；静态基线检查仍需由开发 / 修复角色在后续交付前继续把关。
