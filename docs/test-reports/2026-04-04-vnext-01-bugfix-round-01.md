# 2026-04-04 VNext-01 缺陷修复说明 Round 01

## 文档状态

- 修复状态：复测失败
- 对应回归报告：`docs/test-reports/2026-04-05-vnext-01-regression-round-03.md`
- 关联初测报告：`docs/test-reports/2026-04-04-vnext-01-round-01.md`
- 本文档用途：供测试人员优先回归 `BUG-VNEXT01-01`

## 问题来源

- 来源测试报告：`docs/test-reports/2026-04-04-vnext-01-round-01.md`
- 本轮处理缺陷：
  - `BUG-VNEXT01-01` 撤销 / 重做按钮在变更后仍保持禁用

## 修复范围

- 仅修复 `VNext-01` 中撤销 / 重做按钮可用状态未同步到 UI 的问题
- 未扩展到快捷键、复制粘贴、多选或其他 `VNext-02+` 任务
- 未执行开发侧页面回测；本轮完成了代码修改、静态基线检查与文档回写

## 根因分析

- 历史状态本身由 `packages/core/src/store.ts` 维护，新增对象与新增页面后会正确产生可撤销历史
- 问题核心在于 UI 层是否把历史状态重新计算并同步到按钮禁用态
- 原有实现把按钮状态刷新建立在 Vue 侧对 `snapshot` 的间接依赖上，联动链路不够明确
- 按当前修复方案，历史状态改为在 core 层通过 `mitt` 主动广播，再由编辑器 composable 直接订阅该状态变化

## 修改说明

- 文件：`packages/core/src/store.ts`
- 新增 `mitt` 事件总线，统一分发：
  - `snapshot`
  - `editor`
  - `history`
- 新增 `subscribeHistoryState`，只在撤销 / 重做历史摘要真正变化时广播按钮状态
- 文件：`packages/core/src/controller.ts`
- 新增 `subscribeHistoryState` 转发入口，供 UI 层直接订阅历史状态变化
- 文件：`packages/vue/src/editor/useCoursewareEditor.ts`
- 将历史状态从“依赖 `snapshot` 的 computed”改成独立的 `shallowRef + mitt 订阅`
- `canUndo / canRedo` 现在直接消费 `historyState` 事件结果，不再借助快照读取副作用
- 文件：`packages/core/package.json`
- 新增依赖：`mitt`

## 影响文件

- `packages/core/package.json`
- `packages/core/src/store.ts`
- `packages/core/src/controller.ts`
- `packages/vue/src/editor/useCoursewareEditor.ts`
- `docs/TODO.md`
- `docs/test-reports/2026-04-04-vnext-01-round-01.md`
- `docs/test-reports/2026-04-04-vnext-01-bugfix-round-01.md`

## 开发自查与校验

- 已执行：代码链路自查，确认 `store(mitt) -> controller -> useCoursewareEditor -> CoursewareEditor` 的历史状态联动已打通
- 已执行：`pnpm exec node --input-type=module ...` 本地最小脚本验证
- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 验证结果：
  - 初始：`canUndo=false, canRedo=false`
  - 新增节点后：`canUndo=true, canRedo=false`
  - 撤销后：`canUndo=false, canRedo=true`
  - 重做后：`canUndo=true, canRedo=false`
  - 新增页面后：`canUndo=true, undoDepth=2`
- 静态检查结果：
  - `pnpm typecheck`：通过
  - `pnpm build`：通过
  - 构建阶段仅出现产物体积偏大的 chunk warning，未阻塞构建完成
- 未执行：开发侧页面回测、自动化回归、测试人员复测

## 测试人员复测步骤

1. 进入项目列表页。
2. 点击“新建项目”，进入编辑工作台。
3. 观察顶部“历史”分组中的 `撤销 / 重做` 按钮，初始应为禁用。
4. 点击“文本”，向当前页面新增一个 `Text` 对象。
5. 观察顶部 `撤销` 是否立即变为可用。
6. 点击一次 `撤销`，确认 `重做` 变为可用。
7. 再点击一次 `重做`，确认对象恢复。
8. 再额外回归一次“+ 新建页面”场景，确认新增页面后 `撤销` 同样立即可用。

## 预期复测结果

- 新增对象后，`撤销` 应立即可用
- 执行一次撤销后，`重做` 应立即可用
- 执行重做后，文档状态应恢复
- 新增页面后，`撤销` 也应遵循同样规律
- 自动保存恢复为 `已保存` 后，历史按钮状态不应被错误重置

## 已知限制与剩余风险

- 本轮未做开发侧页面回测，最终结论仍以测试人员回归结果为准
- 目前只针对撤销 / 重做按钮可用性进行了代码链路确认，属性修改、拖拽、缩放、图层顺序、slide 管理和时间轴编辑的完整撤销重做闭环仍需后续产品 review 继续覆盖

## 测试回归结果

- 回归轮次：Round 03
- 回归状态：复测失败
- 回归报告：`docs/test-reports/2026-04-05-vnext-01-regression-round-03.md`
- 回归结论：
  - 新增 `Text` 后节点数已变为 `1`，但 `撤销 / 重做` 仍同时禁用
  - 新增 `Slide` 后页数已变为 `2`，但 `撤销 / 重做` 仍同时禁用
