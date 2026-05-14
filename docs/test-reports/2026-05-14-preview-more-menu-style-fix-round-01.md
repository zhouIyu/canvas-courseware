# 2026-05-14 预览页更多菜单样式修复 Round 01

## 测试范围

- 预览页顶部播放控制区“更多”下拉菜单的弹层样式。
- “重新开始课件”“沉浸播放”两项低频操作的展示与交互。
- 修复后主链路的静态检查与回归脚本执行结果。

## 测试环境

- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地预览地址：`http://127.0.0.1:32173/projects`
- 执行时间：`2026-05-14`

## 测试结果

- 通过 `pnpm typecheck`。
- 通过 `pnpm build`。
- 通过 `pnpm test:vnext-37-e`。
- 回归截图见 `docs/test-reports/assets/2026-05-12-vnext-37-e-round-01/preview-topbar-controls.png`。
- 回归摘要见 `docs/test-reports/assets/2026-05-12-vnext-37-e-round-01/summary.json`。

## 结论

- “更多”菜单已补齐实体底板、边框与阴影，底层状态胶囊不再透出。
- 菜单项保持单行展示，“重新开始课件”“沉浸播放”显示稳定。
- “重新开始课件”操作在修复后仍可正常重置页码、步骤状态与主操作按钮文案。
