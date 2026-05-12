# 2026-05-12 时间轴步骤卡片信息密度 Fix Round 01

## 问题来源

- 来源文档：`docs/test-reports/2026-05-12-bug-timeline-panel-density-round-01.md`
- 问题状态：待复测

## 修复范围

- 编辑态时间轴步骤卡片在窄侧栏中的展开内容收口
- 步骤卡片头部、摘要行和折叠态高度压缩
- 保留步骤设置抽屉入口，完整编辑统一走抽屉承载

## 根因分析

- `VNext-37-D` 已经收敛了头部按钮数量，但 `TimelineStepCard` 展开态仍内联承载触发说明、动作概览卡片和“打开完整设置”大按钮。
- 编辑器右侧管理栏固定宽度当前是 `216px`，该宽度下继续平铺这些内容会显著抬高步骤卡片高度，并放大视觉拥挤感。
- `CoursewareEditor.css` 仍对时间轴步骤卡片施加了较大的统一 `padding` 覆写，进一步推高了折叠态高度，导致原本通过的 `78px` 紧凑目标回退到 `110px`。

## 修改说明

- 在 `packages/vue/src/editor/TimelineStepCard.vue` 中移除展开态动作概览列表与底部“打开完整设置”按钮，仅保留轻量触发说明；完整编辑继续复用右侧 `StepSettingsDrawer`。
- 在 `packages/vue/src/editor/TimelineStepCard.css` 中压缩步骤卡片内边距、头部间距、按钮热区和摘要行排版，并把步骤序号改为更稳定的紧凑徽标样式。
- 在 `packages/vue/src/editor/CoursewareEditor.css` 中下调时间轴步骤卡片的全局覆写内边距与步骤列表间距，避免壳层样式再次把折叠态高度顶回去。
- 按用户追加指令，在 `packages/vue/src/editor/useCoursewareEditorViewport.ts` 与 `CoursewareEditor.css` 中把左右侧栏默认宽度统一放大 `50px`，让左侧页面栏和右侧时间轴窄栏都有更充足的横向空间。
- 在 `test/bug-timeline-panel-density/round-01.mjs` 中新增独立缺陷回归，锁定“步骤卡片不再内联动作概览/大按钮”和“折叠态高度不超过 `96px`”两类约束。
- 在根目录 `package.json` 中新增 `test:bug-timeline-panel-density` 脚本入口。

## 影响文件

- `packages/vue/src/editor/TimelineStepCard.vue`
- `packages/vue/src/editor/TimelineStepCard.css`
- `packages/vue/src/editor/useCoursewareEditorViewport.ts`
- `packages/vue/src/editor/CoursewareEditor.css`
- `test/bug-timeline-panel-density/round-01.mjs`
- `package.json`

## 验证结果

- 已执行：`pnpm typecheck`
- 已执行：`pnpm test:bug-timeline-panel-density`
- 已执行：`node test/vnext-37/round-04.mjs`
- 结果：通过
- 关键复测数据：
  - 当前密度档位下左侧页面栏实际宽度从 `144px` 提升到 `194px`，右侧管理栏从 `208px` 提升到 `258px`
  - 首张步骤卡片展开态不再渲染动作概览与“打开完整设置”按钮
  - 首张步骤卡片折叠态高度恢复到紧凑阈值内
  - 步骤设置抽屉入口保持可用，第二张步骤卡片仍可打开正确标题的步骤设置抽屉

## 测试人员复测步骤

1. 启动本地开发服务并打开 `http://127.0.0.1:32173/projects`
2. 新建空白项目进入编辑态
3. 展开右侧管理栏并切到“时间轴”
4. 执行 `pnpm test:bug-timeline-panel-density`
5. 执行 `node test/vnext-37/round-04.mjs`
6. 观察时间轴列表中步骤卡片是否只保留轻量说明，完整编辑是否统一通过步骤设置抽屉承载

## 预期复测结果

- 时间轴步骤卡片在窄侧栏中不再显得拥挤杂乱
- 折叠态高度保持紧凑，便于同屏浏览更多步骤
- 完整步骤编辑通过抽屉承载，步骤设置能力不回退

## 已知限制或剩余风险

- 本轮只完成了 `VNext-37-E` 中“编辑态时间轴步骤设置抽屉化”的收口，不包含预览页顶部主次操作分组重构。
- 时间轴面板当前仍保持 `216px` 固定右栏宽度；如果后续继续增加卡片内常驻元素，仍需依赖本轮新增的 Playwright 缺陷回归持续守护。
