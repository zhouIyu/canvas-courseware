# 2026-05-15 图片属性侧栏横向溢出 Fix Round 01

## 问题来源

- 来源：用户直接反馈“图片的 属性设置 把右侧栏撑爆了”
- 问题状态：待复测

## 修复范围

- 编辑器右侧“组件属性”中图片属性表单的横向收缩行为
- 图片裁剪卡片头部资源标识过长时的省略与截断策略
- 图片属性侧栏横向溢出专项自动化回归

## 根因分析

- 属性面板的两列表单和分组卡片缺少统一的 `min-width: 0` 收缩约束，Arco 数字输入框在窄列里会按自身固有宽度撑开网格子项，最终把右侧栏内容顶到滚动条区域之外。
- 图片“基础裁剪”预览框使用固定 `220px x 148px` 尺寸，在当前右侧窄栏可用宽度不足时会直接把整张卡片横向撑开。
- 图片裁剪卡片头部的资源标识 badge 没有做可收缩和省略处理；当图片资源名或替代文本较长时，会继续放大这个横向溢出问题。

## 修改说明

- 在 `packages/vue/src/editor/InspectorPanel.css` 中为属性面板容器、分组卡片、表单 grid、字段容器和输入包装统一补齐 `min-width: 0`。
- 为 Arco 输入框、数字输入框和选择器的内部可收缩区域补齐 `max-width: 100%` 与 `box-sizing: border-box`，确保窄栏中仍按容器宽度收缩。
- 将图片“基础裁剪”预览框从固定宽高改为按容器宽度自适应收缩，并通过 `aspect-ratio` 保持既有预览比例。
- 为图片资源提示文案增加 `overflow-wrap: anywhere`，并为分组 badge 增加省略号截断，避免长资源名继续撑爆右栏。
- 新增 `test/bug-image-inspector-overflow/round-01.mjs`，覆盖“插入图片 -> 打开组件属性 -> 校验基础裁剪区无横向溢出 -> 写入超长替代文本后再次校验”的回归链路。
- 在根目录 `package.json` 与 `test/README.md` 中补齐 `pnpm test:bug-image-inspector-overflow` 脚本入口与测试说明。

## 影响文件

- `packages/vue/src/editor/InspectorPanel.css`
- `test/bug-image-inspector-overflow/round-01.mjs`
- `docs/test-reports/assets/2026-05-15-bug-image-inspector-overflow-round-01/bug-image-inspector-overflow-fixture.svg`
- `package.json`
- `test/README.md`
- `docs/TODO.md`

## 验证结果

- 已执行：`pnpm typecheck`
- 已执行：`pnpm build`
- 已执行：`pnpm test:bug-image-inspector-overflow`
- 结果：通过
- 运行产物目录：`docs/test-reports/assets/2026-05-15-bug-image-inspector-overflow-round-01/`

## 测试人员复测步骤

1. 启动本地开发服务并打开 `http://127.0.0.1:32173/projects`
2. 新建或打开一个编辑态项目，插入一张图片
3. 展开右侧管理栏并切到“组件属性”，确认“图片属性 / 基础裁剪”区域不再横向顶出右栏
4. 把图片“替代文本”改成较长的一串字符，继续确认右栏仍不出现横向撑爆
5. 执行 `pnpm test:bug-image-inspector-overflow`，确认专项回归通过

## 预期复测结果

- 图片属性表单在右侧窄栏中保持完整收缩，不再把右侧栏内容顶出容器
- 基础裁剪区的数字输入框在两列布局下仍保持完整可见
- 长图片资源名或替代文本会被截断显示，而不会继续撑爆右栏

## 已知限制或剩余风险

- 本轮回归主要覆盖图片属性表单在默认桌面视口下的横向收缩，不包含用户自定义浏览器缩放比例下的逐像素视觉复核。
- 若后续继续向图片属性区叠加新的横向并排控件，仍需要沿用这次补齐的收缩约束，否则同类问题可能再次出现。
