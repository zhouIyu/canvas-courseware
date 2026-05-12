# 2026-05-12 时间轴步骤卡片信息密度 Round 01

## 测试范围

- 编辑态右侧 `216px` 时间轴窄栏下的步骤卡片信息密度
- 时间轴步骤卡片折叠态高度是否保持紧凑
- 步骤卡片是否仍然内联承载动作概览与完整设置入口
- 步骤设置抽屉入口是否保持可用

## 测试环境

- 日期：2026-05-12
- 仓库：`/Users/admin/MyDemo/canvas-courseware`
- 访问地址：`http://127.0.0.1:32173/projects`
- 视口：`1440 x 900`
- 方式：
  - `pnpm test:bug-timeline-panel-density`
  - `node test/vnext-37/round-04.mjs`

## 测试结果

- 初测失败：旧版 `VNext-37-D` 回归在 2026-05-12 真实跑出失败，首张步骤卡片折叠态高度回退到 `110px`，超过紧凑阈值 `96px`。
- 初测失败：右侧管理栏当前宽度仅 `216px`，但步骤卡片展开态仍内联承载触发说明、动作概览卡片和“打开完整设置”按钮，导致窄栏里信息堆叠、纵向高度显著膨胀。
- 通过：修复后新增定向缺陷回归验证首张步骤卡片不再渲染 `.step-action-overview__item` 和 `.step-settings-entry`，完整编辑统一交给步骤设置抽屉。
- 通过：修复后首张步骤卡片折叠态高度恢复到紧凑范围，`pnpm test:bug-timeline-panel-density` 与 `node test/vnext-37/round-04.mjs` 均通过。
- 通过：步骤设置抽屉入口保留可用，第二张步骤卡片点击“打开步骤设置”后仍可正常打开对应抽屉。
- 通过：本轮未发现控制台错误或运行时错误。

## 缺陷记录

- 问题标题：时间轴步骤卡片在窄侧栏中信息堆叠，折叠态高度回退
- 前置条件：本地开发服务已启动，并进入编辑态工作台；右侧管理栏展开并切到“时间轴”
- 复现步骤：
  1. 打开 `http://127.0.0.1:32173/projects`
  2. 新建空白项目进入编辑态
  3. 打开右侧“时间轴”标签，并通过调试桥注入 3 个步骤的标准时间轴场景
  4. 观察首张步骤卡片的展开态内容和折叠态高度
- 期望结果：时间轴列表只保留轻量摘要与抽屉入口；折叠态高度保持紧凑，完整编辑交由步骤设置抽屉承载
- 实际结果：旧实现仍在窄栏里内联承载说明、动作概览和大按钮，导致步骤卡片过高且视觉杂乱
- 影响范围：编辑态右侧时间轴面板，尤其是 `216px` 固定窄栏下的步骤浏览与扫描效率

## 结论

- 该问题已被 Playwright 稳定复现，并已沉淀为独立缺陷回归脚本。
- 该问题已完成代码修复，并在 2026-05-12 通过同一条缺陷回归与 `VNext-37-D` 原回归复测。

## 产物

- 时间轴侧栏截图：[timeline-side-panel.png](/Users/admin/MyDemo/canvas-courseware/docs/test-reports/assets/2026-05-12-bug-timeline-panel-density-round-01/timeline-side-panel.png)
- 时间轴折叠截图：[timeline-panel-collapsed-first.png](/Users/admin/MyDemo/canvas-courseware/docs/test-reports/assets/2026-05-12-bug-timeline-panel-density-round-01/timeline-panel-collapsed-first.png)
- 步骤设置抽屉截图：[timeline-step-settings-drawer.png](/Users/admin/MyDemo/canvas-courseware/docs/test-reports/assets/2026-05-12-bug-timeline-panel-density-round-01/timeline-step-settings-drawer.png)
- 结构化摘要：[run-summary.json](/Users/admin/MyDemo/canvas-courseware/docs/test-reports/assets/2026-05-12-bug-timeline-panel-density-round-01/run-summary.json)
