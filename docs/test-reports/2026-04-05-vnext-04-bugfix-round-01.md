# 2026-04-05 VNext-04 缺陷修复说明 Round 01

## 文档状态

- 修复状态：复测通过
- 对应测试报告：`docs/test-reports/2026-04-05-vnext-04-round-01.md`
- 回归报告：`docs/test-reports/2026-04-05-vnext-04-regression-round-01.md`
- 本文档用途：供测试人员优先回归 `BUG-VNEXT04-01`

## 问题来源

- `docs/test-reports/2026-04-05-vnext-04-round-01.md` 记录 `BUG-VNEXT04-01`
- 失败现象一致出现在多选批量拖拽与多选左对齐场景：一次撤销只回退最后一个节点
- 本轮仅修复该缺陷，不扩展到 `VNext-05`、`VNext-06` 或其他未在测试报告中登记的问题

## 修复范围

- 修复多选批量拖拽后的历史记录入栈方式
- 修复多选对齐 / 分布操作的历史记录入栈方式
- 保持单选拖拽、缩放、旋转以及现有撤销 / 重做机制不变

## 根因分析

- `VNext-04` 的几何计算本身没有问题，问题出在“批量动作如何写入标准命令层”
- 多选批量拖拽在 Fabric 适配器里会拿到全部节点的新坐标，但随后仍按节点逐条派发 `adapter.node.translated`
- 图层面板里的批量对齐 / 分布也会在循环中逐条执行 `node.update`
- `EditorStore` 会把每一次 `node.update` 都单独压入历史栈，因此一次批量动作实际上生成了多条历史记录，导致单次撤销只能回退最后一条

## 修改说明

### 1. 在核心命令层新增批量节点更新命令

- 文件：
  - `packages/core/src/commands.ts`
  - `packages/core/src/reducer.ts`
  - `packages/core/src/store.ts`
  - `packages/core/src/controller.ts`
  - `packages/core/src/events.ts`
- 新增标准命令 `node.batch.update`
- 允许在同一页面内一次提交多个节点补丁，并在 reducer 中合并为单次快照变更
- 历史记录层把这条批量命令视为一次可撤销操作，从而保证一次撤销 / 重做即可整体回退 / 重放

### 2. 收敛多选拖拽的适配层事件

- 文件：`packages/fabric/src/editor-adapter.ts`
- 多选整体拖拽结束后，不再逐个派发 `adapter.node.translated`
- 改为一次性派发 `adapter.nodes.translated`
- 控制器收到该事件后，统一映射为一条 `node.batch.update`

### 3. 收敛图层面板的批量排版命令

- 文件：`packages/vue/src/editor/useEditorBatchLayout.ts`
- 多选对齐 / 分布时，先收集所有需要变更的位置补丁
- 仅在存在实际坐标变化时派发一次 `node.batch.update`
- 避免同一次批量排版被拆成多条历史记录

## 影响文件

- `packages/core/src/commands.ts`
- `packages/core/src/events.ts`
- `packages/core/src/controller.ts`
- `packages/core/src/store.ts`
- `packages/core/src/reducer.ts`
- `packages/fabric/src/editor-adapter.ts`
- `packages/vue/src/editor/useEditorBatchLayout.ts`
- `docs/TODO.md`
- `docs/test-reports/2026-04-05-vnext-04-bugfix-round-01.md`

## 开发自查与校验

- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 已执行：本地 Node 脚本验证 `node.batch.update` 的撤销 / 重做闭环
- 已执行：本地 Node 脚本验证 `adapter.nodes.translated -> node.batch.update` 的映射闭环
- 结果：
  - `pnpm typecheck`：通过
  - `pnpm build`：通过
  - `node.batch.update` 脚本验证：3 个节点批量更新后，单次 `undo` 可整体回退，单次 `redo` 可整体恢复
  - `adapter.nodes.translated` 脚本验证：适配层批量拖拽事件可正确映射为单条批量历史记录
  - 构建阶段仍存在产物 chunk 体积 warning，但未阻塞构建完成

## 测试人员复测步骤

1. 进入项目列表页，新建一个空白项目。
2. 依次新增 `Text`、`Rectangle`、`Image` 3 个对象，并将 `Image` 移到不会与其他对象重叠的位置。
3. 框选这 3 个对象，确认进入多选态。
4. 对多选包围框整体拖拽一次。
5. 点击顶部“撤销”一次，确认 3 个对象都整体回到拖拽前位置。
6. 点击顶部“重做”一次，确认 3 个对象都整体恢复到拖拽后位置。
7. 保持多选态执行一次“左对齐”，再分别点击一次“撤销 / 重做”，确认 3 个对象都整体回退 / 恢复。
8. 调整对象位置后执行一次“水平分布”，再分别点击一次“撤销 / 重做”，确认所有节点整体回退 / 恢复。
9. 如时间允许，再补充一次“垂直分布”回归，确认其历史记录行为与上述批量命令一致。

## 预期复测结果

- 多选批量拖拽只生成一条历史记录
- 多选对齐只生成一条历史记录
- 多选分布只生成一条历史记录
- 单次 `撤销` 能整体回退本次批量操作
- 单次 `重做` 能整体恢复本次批量操作

## 已知限制与剩余风险

- 本轮只修复“批量动作被拆成多条历史记录”的问题，未扩展到多选删除、复制 / 粘贴 / 重复等其他链路
- 当前开发侧只做了静态检查和脚本级验证，仍需要测试人员基于真实页面完成正式回归
- 测试报告中未覆盖的更复杂场景，例如锁定节点混入、多次连续撤销 / 重做序列、跨 slide 组合操作，仍建议后续补测

## 测试回归结果

- 回归轮次：Round 01
- 回归状态：复测通过
- 回归报告：`docs/test-reports/2026-04-05-vnext-04-regression-round-01.md`
- 回归结论：
  - 多选批量拖拽后，单次 `撤销` 可让 `Text`、`Rectangle`、`Image` 整体回到拖拽前位置；单次 `重做` 可整体恢复到拖拽后位置
  - 多选“左对齐”后，单次 `撤销 / 重做` 可让 3 个节点在“原始坐标”与“统一 `x=110`”之间整体切换
  - 多选“水平分布”与补充验证的“垂直分布”也都恢复为单次历史记录闭环，未再出现只回退最后一个节点的旧问题
