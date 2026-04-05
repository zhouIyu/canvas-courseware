# 2026-04-05 VNext-01 缺陷修复说明 Round 02

## 文档状态

- 修复状态：复测通过
- 对应测试报告：`docs/test-reports/2026-04-04-vnext-01-round-01.md`
- 关联失败回归：`docs/test-reports/2026-04-05-vnext-01-regression-round-02.md`、`docs/test-reports/2026-04-05-vnext-01-regression-round-03.md`
- 本文档用途：供测试人员优先回归 `BUG-VNEXT01-01`

## 问题来源

- Round 01 初测确认 `BUG-VNEXT01-01`：新增对象 / 新增页面成功后，顶部 `撤销 / 重做` 按钮仍保持禁用
- 基于 `docs/test-reports/2026-04-04-vnext-01-bugfix-round-01.md` 的首轮修复，Round 02 与 Round 03 真实页面回归仍失败
- 本轮仅继续处理这条缺陷，不扩展到其他 `VNext` 任务

## 修复范围

- 仅修复 `VNext-01` 中撤销 / 重做按钮状态在真实页面里仍不更新的问题
- 未扩展到快捷键、复制粘贴、多选或其他 `VNext-02+` 任务
- 已执行开发侧静态检查与最小真实页面探针，但未替代测试人员正式回归

## 根因分析

- 首轮修复已经把历史状态改成 `mitt` 事件订阅驱动，`store -> controller -> useCoursewareEditor` 这条链路本身可工作
- 真正的问题出在编辑器组件的 `v-model` 回写回环：
  - 内部命令先更新 `snapshot`
  - 再把最新文档通过 `documentModel.value = document` 回写给外层
  - 外层响应式文档回传后，又被 `CoursewareEditor.vue` 误判成“外部新文档”
  - 于是再次执行 `replaceDocument`
- `replaceDocument` 会重置历史栈，导致新增对象 / 新增页面后刚产生的 `canUndo=true` 立刻被清空，用户最终看到的仍是“按钮禁用”

## 修改说明

### 1. 保留首轮 `mitt` 历史状态订阅链路

- 文件：
  - `packages/core/src/store.ts`
  - `packages/core/src/controller.ts`
  - `packages/vue/src/editor/useCoursewareEditor.ts`
- 继续沿用 `mitt` 主动广播历史状态，再由编辑器 composable 订阅更新 `historyState`

### 2. 修复 `CoursewareEditor` 的文档回写回环

- 文件：`packages/vue/src/editor/CoursewareEditor.vue`
- 新增 `isSyncingDocumentModel` 标记
- 当内部 `snapshot` 回写到外层 `v-model` 时，显式标记这轮同步
- 外层 `documentModel` 监听在该标记生效期间直接跳过，不再误触发 `replaceDocument`
- 这样可以避免历史栈在每次内部编辑后被错误重置

## 影响文件

- `packages/core/package.json`
- `packages/core/src/store.ts`
- `packages/core/src/controller.ts`
- `packages/vue/src/editor/useCoursewareEditor.ts`
- `packages/vue/src/editor/CoursewareEditor.vue`
- `docs/TODO.md`
- `docs/test-reports/2026-04-04-vnext-01-round-01.md`
- `docs/test-reports/2026-04-05-vnext-01-bugfix-round-02.md`

## 开发自查与校验

- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 结果：
  - `pnpm typecheck`：通过
  - `pnpm build`：通过
  - 构建阶段仅出现产物体积偏大的 chunk warning，未阻塞构建完成
- 已执行：本地最小脚本验证 `store(mitt) -> controller -> useCoursewareEditor` 历史状态联动
- 已执行：真实页面最小浏览器探针
- 浏览器探针结果：
  - 新建项目后新增 `Text`：`撤销` 已可用，`重做` 保持禁用
  - 新建项目后新增 `Slide`：`撤销` 已可用，`重做` 保持禁用
  - 说明当前真实页面里 `撤销` 已能正常开放，`重做` 保持初始禁用符合预期

## 测试人员复测步骤

1. 进入项目列表页。
2. 点击“新建项目”，进入编辑工作台。
3. 观察顶部“历史”分组中的 `撤销 / 重做` 按钮，初始应为禁用。
4. 点击“文本”，向当前页面新增一个 `Text` 对象。
5. 观察顶部 `撤销` 是否立即变为可用。
6. 点击一次 `撤销`，确认 `重做` 变为可用。
7. 再点击一次 `重做`，确认对象恢复。
8. 再额外回归一次“+ 新建页面”场景，确认新增页面后 `撤销` 同样立即可用。
9. 观察自动保存恢复为 `已保存` 后，历史按钮状态是否仍保持正确。

## 预期复测结果

- 新增对象后，`撤销` 应立即可用
- 执行一次撤销后，`重做` 应立即可用
- 执行重做后，文档状态应恢复
- 新增页面后，`撤销` 也应遵循同样规律
- 自动保存恢复为 `已保存` 后，历史按钮状态不应再被错误重置

## 已知限制与剩余风险

- 本轮只修复 `撤销 / 重做` 按钮可用性，不代表 `VNext-01` 的所有撤销重做场景都已完整回归
- 属性修改、拖拽、缩放、图层顺序、slide 管理和时间轴编辑的完整撤销重做闭环仍需后续产品 review 继续覆盖

## 测试回归结果

- 回归轮次：Round 04
- 回归状态：复测通过
- 回归报告：`docs/test-reports/2026-04-05-vnext-01-regression-round-04.md`
- 回归结论：
  - 新增 `Text` 后，`撤销` 已立即可用；执行 `撤销 / 重做` 后，节点数可在 `1 -> 0 -> 1` 之间正确恢复
  - 新增 `Slide` 后，`撤销` 已立即可用；执行 `撤销 / 重做` 后，页数可在 `2 -> 1 -> 2` 之间正确恢复
  - 自动保存恢复为 `已保存` 后，历史按钮状态未再被错误重置
