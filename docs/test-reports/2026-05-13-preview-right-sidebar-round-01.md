# 2026-05-13 预览右侧栏卡片重构 Round 01 测试报告

## 测试范围

- 预览页右侧步骤栏卡片重构
- 右侧摘要卡片信息层级压缩
- 右侧步骤卡片高度与双行信息结构
- 受影响旧链路回归：`VNext-35-D`、`VNext-36-E`、`VNext-37-F`

## 测试环境

- 仓库：`/Users/admin/MyDemo/canvas-courseware`
- 访问地址：`http://127.0.0.1:32173/projects`
- 执行时间：2026-05-13
- 浏览器：Playwright Chromium（headless）
- 视口：`1440 x 900`

## 测试结果

- 通过 `pnpm typecheck`
- 通过 `pnpm build`
- 通过 `node test/vnext-37/round-07.mjs`
- 通过 `pnpm test:vnext-35-d`
- 通过 `pnpm test:vnext-36-e`
- 通过 `pnpm test:vnext-37-f`

## 验证结论

- 预览页右侧步骤栏顶部已收敛为单一摘要卡片，不再额外保留旧的步骤提示区块。
- 右侧摘要卡片保留“当前页 / 课件进度”两条核心信息，并压缩补充文案，避免在窄栏里继续堆叠多层提示。
- 右侧步骤卡片已改为更紧凑的双行结构：第一行承载序号、名称和状态；第二行承载触发方式与动作数。
- 在 `1440 x 900` 视口下，右侧步骤卡片高度已压到约 `70px`，首屏可见步骤数量提升。
- `VNext-35-D` 的沉浸播放、`VNext-36-E` 的课件级进度与重启、`VNext-37-F` 的状态 Badge 与右栏摘要未被本轮重构破坏。

## 产物

- 新增：`docs/test-reports/assets/2026-05-13-preview-right-sidebar-round-01/`
- 更新：`docs/test-reports/assets/2026-05-01-vnext-35-d-round-01/`
- 更新：`docs/test-reports/assets/2026-05-11-vnext-36-e-round-01/`
- 更新：`docs/test-reports/assets/2026-05-13-vnext-37-f-round-01/`

## 结论

- 预览右侧栏卡片重构本轮开发与 UI 回归通过，可进入用户 review。
