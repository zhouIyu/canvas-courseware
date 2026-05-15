# 2026-05-15 画布旋转漂移与闪动 Fix Round 01

## 问题来源

- 来源：用户直接反馈“旋转是依据左上角，直接在画布上旋转元素结束时，元素漂移了”以及后续补充“旋转完后，会出现闪动”
- 问题状态：待复测

## 修复范围

- 编辑态旋转结束后的节点几何回写
- 编辑态文档同步到 Fabric 画布时的节点复用与选中态复用
- 旋转专项自动化回归脚本与测试产物补齐

## 根因分析

- Fabric 在旋转结束后，会同时更新对象的 `left/top/angle`；此前适配层只把 `rotation` 回写进标准文档，遗漏了旋转后新的 `x/y`，导致刷新或重新渲染后节点回到旧坐标，看起来像绕左上角旋转并发生漂移。
- 上述旋转回写进入文档后，编辑态同步链路会把整个当前 slide 的 Fabric 对象树整页重建；旋转结束时再叠加一次选中态恢复，用户会看到控制框与对象瞬时被清空再恢复，表现成一次明显闪动。
- 纯选中态同步阶段此前无论选中结果是否真的变化，都会执行一次 `discardActiveObject + setActiveObject`，进一步放大了旋转结束后的视觉抖动。

## 修改说明

- 在 `packages/core/src/events.ts` 中扩展 `adapter.node.rotated` 事件结构，补齐旋转结束后的 `x / y / rotation`。
- 在 `packages/core/src/controller.ts` 中把旋转事件统一映射成一条 `NODE_UPDATE`，一次性回写 `x / y / rotation`，避免旋转动作拆成多条历史记录。
- 在 `packages/fabric/src/editor-adapter/selection.ts` 中改为直接使用旋转后的完整几何结果上报旋转事件，确保旋转结束时位置与角度同步落盘。
- 在 `packages/fabric/src/editor-adapter/rendering.ts` 中新增“结构稳定时原地同步现有 Fabric 对象”的分支；当节点身份、类型和图片资源入口未变化时，优先原地更新几何、样式与 frame 参数，避免整页重建带来的闪动。
- 在 `packages/fabric/src/editor-adapter-support.ts` 中为选中态同步增加“当前 Fabric 选中态已匹配则跳过”的短路，避免纯同步阶段重复清空并重建控制框。
- 在 `test/bug-rotate-drift/round-01.mjs` 中新增旋转专项回归，校验旋转后的 `x / y / rotation` 会被正确写入快照与本地存储，并在旋转完成时确认 Fabric 对象未被重建、单选态未丢失。
- 在根目录 `package.json` 中新增 `pnpm test:bug-rotate-drift` 脚本入口。

## 影响文件

- `packages/core/src/events.ts`
- `packages/core/src/controller.ts`
- `packages/fabric/src/editor-adapter/selection.ts`
- `packages/fabric/src/editor-adapter/rendering.ts`
- `packages/fabric/src/editor-adapter-support.ts`
- `test/bug-rotate-drift/round-01.mjs`
- `package.json`
- `test/README.md`
- `docs/TODO.md`

## 验证结果

- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 已执行：`pnpm test:bug-rotate-drift`
- 结果：通过
- 关键复测数据：
  - 合成旋转后目标矩形从 `{ x: 160, y: 180, rotation: 0 }` 正确写回为 `{ x: 206, y: 208, rotation: 33 }`
  - 刷新后快照与本地存储仍保持 `{ x: 206, y: 208, rotation: 33 }`
  - 旋转结束时 Fabric 当前对象 identity 维持不变，未发生对象重建
  - 旋转结束时当前单选态保持稳定，未出现选中对象丢失
  - 运行产物已写入 `docs/test-reports/assets/2026-05-15-bug-rotate-drift-round-01/`

## 测试人员复测步骤

1. 启动本地开发服务并打开 `http://127.0.0.1:32173/projects`
2. 进入任意编辑态项目，选中一个矩形、文本或图片节点
3. 直接在画布上拖动旋转手柄，观察旋转结束瞬间对象是否仍停留在原视觉中心附近，且控制框不再明显闪动
4. 刷新页面，确认节点位置与角度保持不变
5. 执行 `pnpm test:bug-rotate-drift`，确认专项回归通过

## 预期复测结果

- 直接在画布上旋转元素后，不再出现“像绕左上角旋转”的漂移
- 旋转结束时对象与控制框保持稳定，不再出现明显闪动
- 刷新后节点的坐标与角度与旋转结束时一致

## 已知限制或剩余风险

- 当前专项回归覆盖的是“旋转结束后的完整几何回写”和“对象/选中态复用”两条核心链路，仍未覆盖真实鼠标拖动旋转手柄在不同浏览器缩放比下的逐帧视觉表现。
- 若后续继续引入“节点属性更新即整页重建”的新同步逻辑，仍可能重新带回类似闪动，建议保留并持续运行本轮新增专项回归。
