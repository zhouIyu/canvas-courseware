# 2026-04-05 VNext-04 缺陷回归测试报告 Round 01

## 回测状态

- 回测状态：通过
- 回测结论：基于 `docs/test-reports/2026-04-05-vnext-04-bugfix-round-01.md` 提供的修复说明执行真实页面回归后，`BUG-VNEXT04-01` 已复测通过。多选批量拖拽、左对齐、水平分布与补充验证的垂直分布，都已经恢复为“单次操作对应单次撤销 / 重做”的历史记录闭环。
- 对应初测报告：`docs/test-reports/2026-04-05-vnext-04-round-01.md`
- 对应修复文档：`docs/test-reports/2026-04-05-vnext-04-bugfix-round-01.md`

## 回测范围

- `BUG-VNEXT04-01` 多选批量拖拽后的单次撤销 / 重做
- `BUG-VNEXT04-01` 多选左对齐后的单次撤销 / 重做
- `BUG-VNEXT04-01` 多选水平分布后的单次撤销 / 重做
- 补充回归：多选垂直分布后的单次撤销 / 重做
- 关联链路：
  - 批量动作完成后点击“保存”，确认保存不会破坏当前历史闭环
  - 执行真实 `撤销 / 重做` 后，本地项目文档坐标能正确恢复

## 回测环境

- 回测日期：2026-04-05
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 操作系统：`Darwin 25.3.0 arm64`
- 浏览器执行环境：`Playwright 1.58.0`（Python chromium）
- Python：`3.13.12`
- Node.js：`v24.14.0`
- pnpm：`10.30.3`
- 说明：按当前 `AGENTS.md` 约定，本轮回测未执行 `typecheck` / `build`
- 说明：为避免自动保存时序对文档读取造成噪声，本轮在每次关键动作后都执行了一次真实页面“保存”，再读取本地项目文档确认结果；实测保存动作未破坏历史状态

## 回测结果

### BUG-VNEXT04-01 多选批量拖拽历史记录

- 回测状态：复测通过
- 执行路径：
  1. 新建空白项目，新增 `Text`、`Rectangle`、`Image`
  2. 将 `Image` 移到 `x=340.603, y=218.794`
  3. 框选 3 个对象后整体拖拽一次
  4. 点击“保存”
  5. 点击一次 `撤销`
  6. 点击一次 `重做`
- 回测结果：
  - 拖拽后 3 个节点坐标整体更新为：
    - `Text`：`209.699 / 171.106`
    - `Rectangle`：`259.699 / 241.106`
    - `Image`：`440.302 / 279.9`
  - 点击一次 `撤销` 后，3 个节点整体回到拖拽前位置：
    - `Text`：`110 / 110`
    - `Rectangle`：`160 / 180`
    - `Image`：`340.603 / 218.794`
  - 点击一次 `重做` 后，3 个节点整体恢复到拖拽后位置

### BUG-VNEXT04-01 多选左对齐历史记录

- 回测状态：复测通过
- 执行路径：
  1. 新建空白项目，新增 `Text`、`Rectangle`、`Image`
  2. 将 `Image` 移到 `x=340.603, y=218.794`
  3. 框选 3 个对象后执行“左对齐”
  4. 点击“保存”
  5. 点击一次 `撤销`
  6. 点击一次 `重做`
- 回测结果：
  - 左对齐后 3 个节点的 `x` 坐标统一为 `110`
  - 点击一次 `撤销` 后，`Rectangle` 与 `Image` 恢复到对齐前的 `x=160`、`x=340.603`
  - 点击一次 `重做` 后，3 个节点再次统一回到 `x=110`

### BUG-VNEXT04-01 多选水平分布历史记录

- 回测状态：复测通过
- 执行路径：
  1. 新建空白项目，新增 `Text`、`Rectangle`、`Image`
  2. 将 `Rectangle` 左移到 `x=39.397`
  3. 将 `Image` 右移到 `x=501.407`
  4. 框选 3 个对象后执行“水平分布”
  5. 点击“保存”
  6. 点击一次 `撤销`
  7. 点击一次 `重做`
- 回测结果：
  - 水平分布后，中间 `Text` 调整到 `x=195.402`
  - 点击一次 `撤销` 后，`Text` 恢复到分布前的 `x=110`
  - 点击一次 `重做` 后，`Text` 再次回到 `x=195.402`
  - 整个过程中 `Rectangle` 与 `Image` 作为两端基准点保持稳定，未出现半回退状态

### 补充回归：多选垂直分布历史记录

- 回测状态：复测通过
- 执行路径：
  1. 新建空白项目，新增 `Text`、`Rectangle`、`Image`
  2. 将 `Image` 右移到 `x=511.055`
  3. 将 `Rectangle` 下移到 `y=398.693`
  4. 框选 3 个对象后执行“垂直分布”
  5. 点击“保存”
  6. 点击一次 `撤销`
  7. 点击一次 `重做`
- 回测结果：
  - 垂直分布后，中间 `Image` 从 `y=140` 调整到 `y=207.346`
  - 点击一次 `撤销` 后，`Image` 恢复到分布前的 `y=140`
  - 点击一次 `重做` 后，`Image` 再次回到 `y=207.346`
  - 未再出现“只回退最后一个节点补丁”的旧缺陷

## 关键观察

- 这轮真实页面表现与修复说明中的命令层设计一致，说明 `node.batch.update` 已成功把批量动作收敛为单次历史记录。
- 多选批量拖拽、对齐与分布在“执行动作 -> 保存 -> 撤销 -> 重做”这条完整链路中都能稳定恢复，说明这次修复不只修好了瞬时 UI，也修好了落盘后的历史闭环。
- 本轮补充的垂直分布路径也通过，说明批量历史记录修复并不局限于初测里暴露出来的拖拽和左对齐两个入口。

## 证据文件

- `docs/test-reports/assets/2026-04-05-vnext-04-regression-round-01/batch-drag-after-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-04-regression-round-01/batch-drag-after-redo.png`
- `docs/test-reports/assets/2026-04-05-vnext-04-regression-round-01/left-align-after-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-04-regression-round-01/left-align-after-redo.png`
- `docs/test-reports/assets/2026-04-05-vnext-04-regression-round-01/horizontal-distribute-after-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-04-regression-round-01/horizontal-distribute-after-redo.png`
- `docs/test-reports/assets/2026-04-05-vnext-04-regression-round-01/vertical-distribute-after-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-04-regression-round-01/vertical-distribute-after-redo.png`

## 未覆盖范围

- 本轮未覆盖多选删除、复制 / 粘贴 / 重复
- 本轮未覆盖锁定节点混入多选后的批量操作
- 本轮未覆盖跨 slide 组合操作
- 本轮未覆盖多次连续撤销 / 重做的长序列压力场景

## 剩余风险

- 当前阻塞缺陷已经解除，但更复杂的多选编辑链路仍未在本轮展开，例如多选复制粘贴、锁定节点混入和长历史序列。
- 如果后续继续调整批量命令、历史栈策略或适配层事件收敛逻辑，建议优先重新回归本轮这 4 条路径。
