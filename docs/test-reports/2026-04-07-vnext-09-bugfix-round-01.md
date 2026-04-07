# 2026-04-07 VNext-09 缺陷修复说明 Round 01

## 文档状态

- 修复状态：复测失败
- 对应测试报告：`docs/test-reports/2026-04-07-vnext-09-round-01.md`
- 本文档用途：供测试人员优先回归 `VNext-09` 新建页面背景初始化问题

## 问题来源

- `docs/test-reports/2026-04-07-vnext-09-round-01.md` 记录缺陷：新建页面后，第 2 页默认继承第 1 页背景图
- 缺陷阻断“按 slide 独立配置背景”的主链路，导致产品 review Round 01 未通过
- 本轮修复严格限制在“新建页面背景初始化”逻辑，不扩展到远程背景图、JSON 导入导出或其他未登记问题

## 修复范围

- 修复编辑器中新建空白页面时的背景初始化逻辑
- 修复“从当前页后新增下一页”复用的同一草稿页创建逻辑
- 保持“复制页面”完整继承原页面背景的既有行为不变

## 根因分析

- 编辑器 slide 管理 composable `packages/vue/src/editor/useEditorSlideManagement.ts` 中的 `createDraftSlide` 会基于参考页组装新 slide
- 旧实现不仅继承了参考页的尺寸和背景色，还会把 `background.image.src` 与 `background.image.fit` 一并传给 `createSlide`
- 这导致“新建页面”与“复制页面”在背景初始化上没有边界，新页面会带入上一页背景图资源并写入文档持久化数据

## 修改说明

### 1. 收紧新建页面的背景继承边界

- 文件：`packages/vue/src/editor/useEditorSlideManagement.ts`
- 保留新建页对参考页尺寸和基础背景色的继承
- 移除对参考页背景图地址与填充方式的继承，让 `createSlide` 回到默认 `background.image = null`
- 在函数注释中明确“新建页面”和“复制页面”的职责边界，降低后续回归风险

## 影响文件

- `packages/vue/src/editor/useEditorSlideManagement.ts`
- `docs/TODO.md`
- `docs/test-reports/2026-04-07-vnext-09-bugfix-round-01.md`

## 开发自查与校验

- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 结果：
  - `pnpm typecheck`：通过
  - `pnpm build`：通过
  - 构建阶段仍存在 `apps/playground` 产物 chunk 体积超过 `500 kB` 的既有 warning，但未阻塞本轮构建完成

## 测试人员复测步骤

1. 进入项目列表页，新建一个空白项目。
2. 在第 1 页“页面设置”中设置背景色，并导入一张本地背景图。
3. 点击左侧“新建页面”，切换到新建的第 2 页。
4. 观察第 2 页编辑画布是否仍显示第 1 页背景图内容。
5. 打开浏览器 `localStorage`，检查第 2 页 `background.image` 是否为空。
6. 再补充验证“从当前页后新增下一页”入口，确认其背景初始化行为一致。
7. 如第 2 页背景图为空，再继续回归背景色修改、缩略页、刷新恢复与预览渲染链路。

## 预期复测结果

- 新建页面后，第 2 页默认不再继承第 1 页背景图
- 第 2 页的 `background.image` 为空，除非用户主动设置
- 修改第 2 页背景色时，不会再被上一页背景图覆盖
- “新建页面”和“从当前页后新增下一页”两个入口的背景初始化表现一致
- “复制页面”仍保留原页面背景图与填充方式

## 已知限制与剩余风险

- 本轮只修复“新建空白页面继承背景图”的问题，没有调整背景色默认值策略
- 当前开发侧完成的是代码修复与静态基线检查，仍需测试侧在真实页面中完成正式回归
- 建议测试侧继续关注：
  - 复制页面与新建页面之间的背景继承边界
  - 多页场景下缩略页背景与预览背景的一致性

## 复测同步结果

- 对应复测报告：`docs/test-reports/2026-04-07-vnext-09-regression-round-02.md`
- 复测结论：失败
- 同步说明：
  - 本轮修改已修复新页面数据层错误，`background.image` 不再写入新建页面与“后插入”页面
  - 但编辑画布在切到这些页面后，仍残留上一页背景图，导致 UI 与实际页面状态不一致
  - 后续修复应继续聚焦编辑画布在 `background.image = null` 场景下的背景清理与重绘时机
