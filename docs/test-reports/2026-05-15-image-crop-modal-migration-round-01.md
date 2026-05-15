# 2026-05-15 图片裁剪弹窗迁移 Round 01

## 测试范围

- 编辑器图片插入链路从“先插入后在基础属性中裁剪”迁移为“选图时先裁剪再写入画布”
- 图片属性面板中的“更换图片”与“重新裁剪”入口
- 图片换图后的默认命名、节点 id 保持、自动保存与刷新回显
- 右侧图片属性面板在移除旧裁剪区后的横向收缩稳定性

## 测试环境

- 仓库：`/Users/admin/MyDemo/canvas-courseware`
- 日期：2026-05-15
- 浏览器：Playwright Chromium（headless）
- 视口：`1440 x 900`
- 访问地址：`http://127.0.0.1:32173/projects`

## 测试结果

- 通过 `pnpm typecheck`
- 通过 `pnpm build`
- 通过 `pnpm test:vnext-38-b`
- 通过 `pnpm test:vnext-21`
- 通过 `pnpm test:vnext-23`
- 通过 `pnpm test:bug-image-inspector-overflow`

## 验证结论

- 工具栏“图片”入口现在会先打开图片裁剪弹窗，确认后再插入节点；不会再要求用户去基础属性中完成首次裁剪。
- 属性面板“更换图片”已统一进入同一套裁剪弹窗，换图后节点 id 保持不变，默认命名与资源标识仍按原规则同步。
- 属性面板新增“重新裁剪”入口后，刷新回到编辑态仍能正确回显既有裁剪窗口，并在弹窗内继续编辑。
- 右键菜单“更换图片”也已对齐到新裁剪流程，没有打断图片专属快捷操作链路。
- 旧的基础属性裁剪区移除后，右侧属性栏不再因裁剪预览和长资源标识导致横向撑爆；长替代文本压测通过。

## 影响文件

- `packages/vue/src/editor/ImageCropModal.vue`
- `packages/vue/src/editor/useEditorImageCropModal.ts`
- `packages/vue/src/editor/useEditorLocalImage.ts`
- `packages/vue/src/editor/CoursewareEditor.vue`
- `packages/vue/src/editor/InspectorImageSection.vue`
- `packages/vue/src/editor/InspectorPanel.vue`
- `packages/vue/src/editor/InspectorPanel.css`
- `test/shared/browser-test-helpers.mjs`
- `test/vnext-38/round-02.mjs`
- `test/vnext-21/round-01.mjs`
- `test/vnext-23/round-01.mjs`
- `test/bug-image-inspector-overflow/round-01.mjs`

## 测试人员复测步骤

1. 启动本地开发服务并打开 `http://127.0.0.1:32173/projects`
2. 新建一个编辑态项目，点击工具栏“图片”，选择本地图片，确认会先弹出裁剪弹窗
3. 在裁剪弹窗中直接确认或调整裁剪后插入图片，确认画布与预览都使用最新裁剪结果
4. 选中该图片，在右侧属性面板点击“更换图片”与“重新裁剪”，确认两者都会进入裁剪弹窗
5. 把图片替代文本改成一段较长字符串，确认右侧属性栏不出现横向溢出
6. 执行 `pnpm test:vnext-38-b`、`pnpm test:vnext-21`、`pnpm test:vnext-23` 与 `pnpm test:bug-image-inspector-overflow`

## 预期复测结果

- 图片裁剪入口统一收口到弹窗，不再在基础属性面板中直接操作
- 首次插图、换图、右键换图和重新裁剪都能保持同一份裁剪模型与保存链路
- 右侧属性栏在长文案和窄宽度下保持稳定，不会被图片属性区横向撑爆

## 剩余风险

- 本轮已把核心图片回归脚本适配到新弹窗链路，但仓库中其他较老的图片插入类脚本如果仍直接 `setInputFiles`，后续新增场景时仍需要继续收口到统一 helper。
