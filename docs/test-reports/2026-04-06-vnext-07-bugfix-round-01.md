# 2026-04-06 VNext-07 缺陷修复说明 Round 01

## 文档状态

- 修复状态：复测通过
- 对应测试报告：`docs/test-reports/2026-04-06-vnext-07-round-01.md`
- 回归报告：`docs/test-reports/2026-04-06-vnext-07-regression-round-02.md`
- 本文档用途：供测试人员优先回归 `VNext-07` 内嵌预览态缺少“重置播放”入口的问题

## 问题来源

- 最新一轮 `VNext-07` 测试报告记录缺陷：工作台内嵌预览模式缺少“一键重置当前 slide 播放状态”入口
- 缺陷触发路径为：编辑页时间轴中点击“从此预览”后，工作台切换到内嵌预览模式
- 本轮修复严格限制在该缺陷，不扩展到步骤重命名、删除或动画参数链路

## 修复范围

- 仅修复工作台内嵌预览模式下缺少“重置播放”入口的问题
- 不修改 Fabric 播放逻辑、不改动“从此预览”跳转逻辑
- 不处理测试报告中尚未覆盖的其他 `VNext-07` 功能点

## 根因分析

- 预览器组件 `packages/vue/src/preview/CoursewarePreview.vue` 已经实现了 `resetPreview` 播放重置能力
- 现有“重置播放”按钮仅渲染在 `showHeader` 为 `true` 的顶部栏中
- 工作台内嵌预览通过 `:show-header="false"` 使用该组件，导致顶部栏整体不渲染
- 结果是底层重置能力仍然存在，但正式工作台内没有任何可见入口触发该能力

## 修改说明

### 1. 为内嵌预览补充就地“重置播放”入口

- 文件：`packages/vue/src/preview/CoursewarePreview.vue`
- 在画布区头部的 `stage-head-actions` 中，仅针对内嵌模式补充“重置播放”按钮
- 按钮继续复用已有的 `resetPreview` 方法，确保行为仍然是“重置当前 slide 播放状态”
- 当当前没有激活 slide 时，按钮保持禁用，避免空状态误触发

### 2. 补齐内嵌模式按钮样式

- 文件：`packages/vue/src/preview/CoursewarePreview.css`
- 新增内嵌播放控制容器样式，保证按钮在工作台三栏布局中可见且不打乱现有状态标签排列

## 影响文件

- `packages/vue/src/preview/CoursewarePreview.vue`
- `packages/vue/src/preview/CoursewarePreview.css`
- `docs/TODO.md`
- `docs/test-reports/2026-04-06-vnext-07-bugfix-round-01.md`

## 开发自查与校验

- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 结果：
  - `pnpm typecheck`：通过
  - `pnpm build`：通过
  - 构建阶段仍存在 `apps/playground` 产物 chunk 体积超过 `500 kB` 的既有 warning，但未阻塞本轮构建完成

## 测试人员复测步骤

1. 进入项目列表页并打开任意包含时间轴步骤的项目。
2. 在编辑模式中任选一个步骤，点击“从此预览”。
3. 确认工作台切换到内嵌预览模式。
4. 在当前画布区域顶部右侧查找“重置播放”按钮。
5. 点击“重置播放”按钮。
6. 观察当前 slide 的播放状态是否恢复到初始状态，再继续手动推进步骤验证可重复调试。

## 预期复测结果

- 工作台内嵌预览模式中可见明确的“重置播放”按钮
- 点击按钮后，当前 slide 播放状态恢复到初始状态
- 修复后不影响原有“从此预览”进入预览态的链路

## 已知限制与剩余风险

- 本轮代码修复本身只补齐正式工作台中的入口，未扩展播放器底层逻辑
- `VNext-07` 其他主链路已在 `docs/test-reports/2026-04-06-vnext-07-regression-round-02.md` 中完成继续回归；若后续再次调整预览壳层，仍建议优先复测该入口

## 测试回归结果

- 回归轮次：Round 02
- 回归状态：复测通过
- 回归报告：`docs/test-reports/2026-04-06-vnext-07-regression-round-02.md`
- 回归结论：
  - 工作台内嵌预览模式中已可见“重置播放”按钮
  - 点击按钮后，当前 slide 播放状态可恢复到首步初始状态
  - 重置后再次点击预览画布，原有“从当前步骤开始预览”链路仍可继续重复调试
