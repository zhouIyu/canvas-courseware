# 2026-05-12 编辑页底部显示不全 Round 01

## 测试范围

- 编辑工作台在桌面视口下的底部可见性
- 编辑工作台关键容器在首屏内是否完整显示
- 当内容超出视口时，页面是否提供有效的纵向滚动承载

## 测试环境

- 日期：2026-05-12
- 仓库：`/Users/admin/MyDemo/canvas-courseware`
- 访问地址：`http://127.0.0.1:32173/projects`
- 视口：`1440 x 900`
- 方式：
  - `node test/bug-editor-bottom-clipped/round-01.mjs`

## 测试结果

- 初测失败：编辑工作台在 `1440 x 900` 视口下出现底部显示不全。
- 初测失败：`.editor-shell` 底部落在 `908px`，超出视口底部 `8px`。
- 初测失败：`.editor-layout` 底部落在 `909px`，超出视口底部 `9px`。
- 初测失败：`.slide-rail-host`、`.workspace-shell`、`.editor-side` 底部均落在 `918px`，超出视口底部 `18px`。
- 初测失败：`.workspace-page` 当前 `overflow-y` 为 `hidden`，`body` 与 `documentElement` 的 `scrollHeight` 都等于视口高度，页面没有提供纵向滚动承载，因此超出部分会被直接裁切。
- 通过：本轮未发现控制台错误或运行时错误。
- 2026-05-12 复测通过：修复后再次执行 `pnpm test:bug-editor-bottom-clipped`，`.editor-shell` / `.editor-layout` / `.slide-rail-host` / `.workspace-shell` / `.editor-side` 底部均已回到视口内，页面总高度恢复为 `900px`，未再出现首屏底部裁切。

## 缺陷记录

- 问题标题：编辑页面底部显示不全，缩小浏览器后仍依赖裁切而不是有效滚动
- 前置条件：本地开发服务已启动，并从项目列表打开默认示例项目进入编辑态
- 复现步骤：
  1. 使用 `1440 x 900` 桌面视口打开 `http://127.0.0.1:32173/projects`
  2. 打开任意示例项目进入编辑页
  3. 展开右侧管理栏，并切换到“时间轴”标签
  4. 观察编辑器三栏底部是否完整显示
- 期望结果：编辑页首屏关键工作区应完整显示；若高度不足，应提供自然的纵向滚动承载，而不是直接裁切底部内容
- 实际结果：编辑器主壳层与三栏容器底部超出视口，但页面禁用了纵向滚动，导致底部被裁切
- 影响范围：编辑态三栏布局整体，包括左侧页面栏、中间画布区和右侧管理栏

## 结论

- 当前问题已被 Playwright 稳定复现，并已沉淀为缺陷回归脚本。
- 该问题已完成代码修复，并在 2026-05-12 通过同一条 Playwright 缺陷回归复测。

## 产物

- 失败截图：[editor-bottom-clipped-failure.png](/Users/admin/MyDemo/canvas-courseware/docs/test-reports/assets/2026-05-12-bug-editor-bottom-clipped-round-01/editor-bottom-clipped-failure.png)
- 复测截图：[editor-bottom-clipped.png](/Users/admin/MyDemo/canvas-courseware/docs/test-reports/assets/2026-05-12-bug-editor-bottom-clipped-round-01/editor-bottom-clipped.png)
- 结构化摘要：[run-summary.json](/Users/admin/MyDemo/canvas-courseware/docs/test-reports/assets/2026-05-12-bug-editor-bottom-clipped-round-01/run-summary.json)
