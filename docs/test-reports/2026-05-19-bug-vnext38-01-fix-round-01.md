# 2026-05-19 多选旋转后拖拽回退 Fix Round 01

## 问题来源

- 来源：`docs/TODO.md` 中的 `BUG-VNEXT38-01`
- 用户原始反馈：多选元素统一旋转后，再拖拽其中一个元素，其他已旋转元素会回退到旋转前状态
- 问题状态：已修复，自动化回归通过

## 修复范围

- 编辑态 `ActiveSelection` 多选整体变换后的标准文档回写
- 多选旋转后再拖拽单节点时的几何保持链路
- 多选旋转专项自动化回归脚本、测试入口与测试产物

## 根因分析

- 之前编辑态适配层对 `ActiveSelection` 的 `object:modified` 只稳定支持“批量平移”回写；当多选动作命中 `rotate / scale / skew` 时，会在入口直接短路，不把各子节点的最终几何写回标准文档。
- 这样会造成 Fabric 画布现场已经显示为“旋转后”，但标准文档里仍保留“旋转前”的旧 `x / y / width / height / rotation`。
- 后续只要再拖拽其中一个节点，单节点更新会触发整页同步，其他未被本次拖拽更新的节点就会按旧文档状态重新渲染，表现成“旋转结果被回退”。

## 修改说明

- 在 `packages/fabric/src/editor-adapter-support.ts` 中新增多选几何补丁计算逻辑：
  - 不再只按包围盒位移推导批量平移
  - 改为基于 `ActiveSelection` 当前整体变换矩阵和子对象自身矩阵，逐个还原每个节点的绝对 `x / y / width / height / rotation`
  - 仅在节点几何确实变化时才生成批量补丁，避免无效历史记录
- 在 `packages/fabric/src/editor-adapter/selection.ts` 中移除多选 `rotate / scale / skew` 的短路逻辑，统一把多选整体变换落为一次 `adapter.nodes.translated`
- 在 `packages/core/src/events.ts` 中把多选事件负载从“仅有 `x / y` 的平移结果”升级为“每节点完整 `NodePatch`”
- 在 `packages/core/src/controller.ts` 中把该批量事件映射为一次 `NODE_BATCH_UPDATE`，确保多选旋转后的完整几何一次性落盘
- 新增 `test/bug-vnext38-01/round-01.mjs` 和 `pnpm test:bug-vnext38-01`，覆盖“多选旋转 -> 拖拽单节点 -> 自动保存 -> 刷新恢复”完整缺陷链路

## 影响文件

- `packages/fabric/src/editor-adapter-support.ts`
- `packages/fabric/src/editor-adapter/selection.ts`
- `packages/core/src/events.ts`
- `packages/core/src/controller.ts`
- `test/bug-vnext38-01/round-01.mjs`
- `package.json`
- `test/README.md`
- `docs/TODO.md`
- `docs/VNEXT.md`

## 验证结果

- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 已执行：`pnpm test:bug-vnext38-01`
- 已执行：`pnpm test:bug-rotate-drift`
- 结果：通过
- 关键验证点：
  - 多选旋转后，两张矩形卡片都正确持久化为 `rotation = 32`
  - 继续拖拽主卡片后，副卡片仍保持 `rotation = 32` 且 `x / y` 未回退
  - 刷新页面后，两张卡片的几何与拖拽结束时一致
  - 旧的单节点旋转回归 `pnpm test:bug-rotate-drift` 继续通过，未引入回归
- 运行产物：
  - `docs/test-reports/assets/2026-05-19-bug-vnext38-01-round-01/`
  - `docs/test-reports/assets/2026-05-15-bug-rotate-drift-round-01/run-summary.json`

## 测试人员复测步骤

1. 启动本地开发服务并打开 `http://127.0.0.1:32173/projects`
2. 新建或打开一个编辑态项目，插入两个矩形节点
3. 多选这两个节点，在画布上统一旋转到任意角度
4. 再单独拖拽其中一个节点，观察另一个已旋转节点是否保持原旋转结果，不出现回退
5. 刷新页面，确认两个节点的坐标、尺寸和角度与拖拽结束时一致
6. 执行 `pnpm test:bug-vnext38-01`，确认专项回归通过

## 预期复测结果

- 多选旋转后再拖拽单节点时，其余节点不再回退到旋转前状态
- 自动保存与刷新恢复后，所有参与旋转的节点都保持最新几何
- 单节点旋转原有修复链路继续稳定

## 已知限制或剩余风险

- 当前专项回归主要通过调试桥合成多选旋转和单节点拖拽，已经覆盖标准文档同步断点，但尚未覆盖真实鼠标拖动旋转手柄的逐帧视觉反馈。
- 这次修复顺带把多选缩放/斜切的标准文档回写入口也统一到了同一批量几何补丁链路；若后续继续调整 Fabric 多选同步协议，建议保留并持续运行本轮新增专项回归。
