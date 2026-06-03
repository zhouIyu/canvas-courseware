# 2026-05-19 多选旋转问题收口 Fix Round 02

## 问题来源

- 来源：`docs/TODO.md` 中的 `BUG-VNEXT38-01`
- 用户原始反馈：多选旋转仍然有问题；如不好修改，可直接禁止多选旋转
- 问题状态：已按“禁用多选旋转”策略修复，待用户 review

## 修复范围

- 编辑态 `ActiveSelection` 多选控制框交互策略
- 多选建立入口的一致性处理
- `BUG-VNEXT38-01` 专项自动化回归脚本与测试文档

## 根因分析

- 现有编辑器的多选依赖 Fabric `ActiveSelection`，其批量拖拽链路稳定，但批量旋转链路仍存在用户反馈的行为问题。
- 在当前版本继续硬保多选旋转，会让编辑态维护一条额外的不稳定交互分支，收益低于复杂度与回归风险。
- 用户已明确允许“如果不好修改，就禁止多选旋转”，因此本轮直接收口交互入口比继续补不稳定逻辑更稳。

## 修改说明

- 在 `packages/fabric/src/editor-adapter-support.ts` 中新增 `applyActiveSelectionInteractionPolicy`：
  - 统一给多选 `ActiveSelection` 设置 `lockRotation=true`
  - 显式隐藏 `mtr` 旋转手柄
- 在 `packages/fabric/src/editor-canvas-events.ts` 中补齐多选新建/更新时的策略应用：
  - 无论多选来自框选、Shift 点选还是标准选中态回灌，都会统一禁用旋转
- 调整 `test/bug-vnext38-01/round-01.mjs`：
  - 不再验证“多选旋转后拖拽”
  - 改为验证“多选禁旋策略生效 -> 多选拖拽正常 -> 单节点拖拽正常 -> 刷新恢复正常”
- 同步更新 `docs/TODO.md`、`docs/VNEXT.md` 与本轮测试文档，确保执行池、规划文档和验证口径一致

## 影响文件

- `packages/fabric/src/editor-adapter-support.ts`
- `packages/fabric/src/editor-canvas-events.ts`
- `test/bug-vnext38-01/round-01.mjs`
- `docs/TODO.md`
- `docs/VNEXT.md`
- `docs/test-reports/2026-05-19-bug-vnext38-01-round-02.md`
- `docs/test-reports/2026-05-19-bug-vnext38-01-fix-round-02.md`

## 验证结果

- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 已执行：`pnpm test:bug-vnext38-01`
- 已执行：`pnpm test:bug-rotate-drift`
- 结果：通过
- 关键验证点：
  - 多选态 `ActiveSelection` 已锁定旋转，且旋转手柄隐藏
  - 多选整体拖拽仍能正常更新所有参与节点的几何
  - 多选拖拽后再单独拖拽单节点，不会影响其他节点
  - 刷新页面后几何保持一致
  - 单节点旋转旧回归继续通过
- 运行产物：
  - `docs/test-reports/assets/2026-05-19-bug-vnext38-01-round-02/`
  - `docs/test-reports/assets/2026-05-15-bug-rotate-drift-round-01/run-summary.json`

## 测试人员复测步骤

1. 启动本地开发服务并打开 `http://127.0.0.1:32173/projects`
2. 新建或打开一个编辑态项目，插入两个矩形节点
3. 多选这两个节点，确认画布上不再出现多选旋转手柄，也无法直接执行多选旋转
4. 保持多选状态拖拽这两个节点，确认两者一起移动
5. 再单独拖拽其中一个节点，确认另一个节点不受影响
6. 刷新页面，确认两个节点的坐标、尺寸和角度与拖拽结束时一致
7. 执行 `pnpm test:bug-vnext38-01`，确认专项回归通过

## 预期复测结果

- 多选态不再暴露旋转手柄，也无法执行多选旋转
- 多选拖拽、单节点拖拽、自动保存与刷新恢复保持正常
- 单节点旋转能力不受本轮改动影响

## 已知限制或剩余风险

- 当前策略是直接收口多选旋转，而不是修复并保留该能力；若后续版本需要重新开放多选旋转，应重新评估 Fabric 多选变换链路并补独立回归。
- 现有专项回归通过调试桥验证多选控制策略与拖拽持久化，已覆盖当前策略目标，但未覆盖真实鼠标命中旋转手柄的视觉交互，因为该手柄已被禁用。
