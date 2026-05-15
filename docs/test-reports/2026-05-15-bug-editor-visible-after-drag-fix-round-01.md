# 2026-05-15 编辑态拖拽后隐藏节点被重新隐藏 Fix Round 01

## 问题来源

- 来源：用户直接反馈“编辑态，拖拽后，会将设置不可见的元素，给隐藏了”
- 问题状态：待复测

## 修复范围

- 编辑态节点原地同步时的 `visible` 处理
- 编辑态“默认全显”策略在拖拽后的持续生效
- 可见性专项自动化回归脚本与测试产物补齐

## 根因分析

- 编辑态此前已经通过 `applyEditorVisibilityStrategy(...)` 约定了“默认全显”：文档里的 `node.visible` 只服务预览态，编辑画布里一律强制显示，便于排版和步骤配置。
- 但上一轮为解决旋转闪动而新增的“原地同步现有 Fabric 对象”分支，在 `applyCommonNodeObjectFields(...)` 中又把 `visible` 直接写回成了 `node.visible`。
- 结果是：当某个节点在文档中本来就是 `visible=false`，拖拽或其他几何同步触发原地更新后，编辑画布会把该对象重新隐藏回去，于是出现“拖拽后消失”的回归。

## 修改说明

- 在 `packages/fabric/src/editor-adapter/rendering.ts` 中调整原地同步公共字段逻辑，编辑态同步阶段始终写入 `visible: true`，继续保持“默认全显”。
- 保持文档模型中的 `node.visible` 不变，避免影响预览态时间轴和初始显隐语义。
- 新增 `test/bug-editor-visible-after-drag/round-01.mjs`，用调试桥构造 `visible=false` 的矩形节点，再触发一次合成拖拽，锁定“文档里仍为 hidden，但编辑画布里持续可见”的链路。
- 在根目录 `package.json` 中新增 `pnpm test:bug-editor-visible-after-drag` 脚本入口，并同步更新 `test/README.md`。

## 影响文件

- `packages/fabric/src/editor-adapter/rendering.ts`
- `test/bug-editor-visible-after-drag/round-01.mjs`
- `package.json`
- `test/README.md`
- `docs/TODO.md`

## 验证结果

- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 已执行：`pnpm test:bug-editor-visible-after-drag`
- 结果：通过
- 关键复测数据：
  - 写入 `visible=false` 后，文档中的目标节点仍保持 `visible=false`
  - 同一时刻编辑画布中的目标对象仍为 `visible=true`
  - 合成拖拽后，文档中的节点位置正确更新到 `{ x: 244, y: 232 }`，`visible` 继续保持 `false`
  - 合成拖拽后，编辑画布中的对象继续保持 `visible=true`，且当前单选态未丢失
  - 运行产物已写入 `docs/test-reports/assets/2026-05-15-bug-editor-visible-after-drag-round-01/`

## 测试人员复测步骤

1. 启动本地开发服务并打开 `http://127.0.0.1:32173/projects`
2. 打开任意编辑态项目，选中一个在预览态默认隐藏的后续步骤节点
3. 在编辑态直接拖拽该节点，观察拖拽结束后该节点是否仍留在画布上
4. 刷新页面并切到预览态，确认该节点仍保持预览态原本的 `visible=false` / 后续步骤出现语义
5. 执行 `pnpm test:bug-editor-visible-after-drag`，确认专项回归通过

## 预期复测结果

- 编辑态拖拽后，文档中 `visible=false` 的节点不会在编辑画布里消失
- 编辑态继续默认展示当前 slide 的全部元素
- 预览态不受影响，仍按文档原始 `visible` 与时间轴步骤执行

## 已知限制或剩余风险

- 当前专项回归覆盖的是“写入 hidden 后立即拖拽”的核心回归链路，尚未扩展到缩放、旋转或批量拖拽场景。
- 若后续继续在编辑态同步分支里直接消费 `node.visible`，仍可能再次引入同类回归，建议保留并持续运行本轮专项回归。
