# 2026-04-10 点击元素后画布收缩修复 Round 01

## 文档状态

- 当前状态：待复测
- 问题来源：用户直接反馈“点击元素，整个画布会收缩”，并提供工作台截图
- 对应改动：稳定编辑区缩放基准，避免选中元素时整块画布误缩放
- 对应脚本：`pnpm test:bug-canvas-scale-on-select`
- 关联回归：`pnpm test:vnext-23`
- 静态基线：`pnpm typecheck`、`pnpm build`
- 结果产物目录：`docs/test-reports/assets/2026-04-10-bug-canvas-scale-on-select-round-01/`

## 修复范围

- `packages/vue/src/editor/CoursewareEditor.vue`
- `test/bug-canvas-scale-on-select/round-01.mjs`
- `package.json`
- `docs/TODO.md`

## 根因分析

- 根因判断：推断为编辑区缩放依赖的 `stageViewportRef.clientWidth / clientHeight` 在选中 Fabric 对象时出现了短暂抖动。
- 影响机理：一旦 `clientWidth` 或 `clientHeight` 被浏览器按滚动条预留、布局重算或临时内容盒变化缩小，`canvasScale` 会立即被当成“可用区域真的变小了”，从而把整块画布重新缩小。
- 说明：本轮在本地自动化里没有稳定复现出与用户截图完全一致的剧烈收缩，但从代码链路看，这一处是当前编辑器里唯一会在“单纯点击选中”时直接重算整块画布缩放的关键路径，因此按该路径做了稳定化修复。

## 修改说明

- 将编辑区可用尺寸读取从 `clientWidth / clientHeight` 改为 `getBoundingClientRect()` 的 border-box 尺寸，并统一做 `Math.round`，降低临时布局抖动对缩放计算的影响。
- 为这条问题补充了高分屏编辑态专项回归：在右侧管理栏展开的情况下点击示例项目元素，断言点击前后画布宽度与缩放矩阵保持一致。
- 联动补跑最近的 `VNext-23` 右键菜单回归，确认这次缩放修复没有影响已有选中态与编辑区交互。

## 验证结果

- `pnpm typecheck`：通过
- `pnpm build`：通过
- `pnpm test:bug-canvas-scale-on-select`：通过
- `pnpm test:vnext-23`：通过

## 给测试人员的复测步骤

1. 打开任一课件项目，进入编辑模式。
2. 展开右侧管理栏，保持中间画布处于正常缩放状态。
3. 依次点击文本、图片、矩形等对象，观察中间白色画布的整体尺寸是否变化。
4. 在高分屏设备上重复上述步骤，重点观察选中框与对象本身是否保持对齐。

## 预期复测结果

- 点击对象后，画布整体缩放比例保持稳定，不会再出现整块白色画布突然缩小。
- 选中框、控制点和对象位置保持一致，不出现明显错位。
- 右侧管理栏内容切换时，不会再反向挤压中间画布导致缩放变化。

## 已知限制与剩余风险

- 本轮修复基于稳定化缩放尺寸读取，优先消除了“点击选中触发误缩放”的主路径风险。
- 若后续仍能在特定浏览器或特定系统缩放比例下复现，需要进一步记录复现环境、浏览器缩放比例和具体对象类型，再继续排查是否还有浏览器级布局抖动或 Fabric 选中层渲染差异。
