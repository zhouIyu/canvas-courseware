# 2026-04-07 VNext-13 回归测试报告 Round 02

## 回测状态

- 回测状态：通过
- 回测结论：基于 `docs/test-reports/2026-04-07-vnext-13-bugfix-round-01.md` 的修复说明继续执行真实页面回归后，`VNext-13` 中“文本节点双击画布内编辑后内容未写回属性面板与本地持久化”的阻塞缺陷已复测通过。文本节点双击后点击非 canvas 区域退出编辑，属性面板、本地持久化、刷新恢复、重复 / 删除所选以及预览态展示均已同步为最新文本；右键菜单原有插入与对象级操作链路继续保持正常。
- 对应初测报告：`docs/test-reports/2026-04-07-vnext-13-round-01.md`
- 对应修复文档：`docs/test-reports/2026-04-07-vnext-13-bugfix-round-01.md`

## 回测范围

- 编辑区空白区域右键菜单
- 右键菜单“插入文本”
- 文本节点双击进入画布内编辑态
- 点击非 canvas 区域退出编辑后的文本提交
- 右键菜单“重复所选 / 删除所选”与新文本的一致性
- 自动保存、本地持久化、刷新恢复与预览态烟测

## 回测环境

- 回测日期：2026-04-07
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 浏览器执行环境：`Playwright 1.59.0`（Node.js chromium）
- 自动化脚本：`pnpm test:vnext-13`
- 视口：`1440 x 900`
- 说明：按当前 `AGENTS.md` 约定，本轮回测未执行 `pnpm typecheck` / `pnpm build`
- 说明：开发侧已在修复文档中记录 `pnpm test:vnext-13`、`pnpm typecheck` 与 `pnpm build` 通过，本轮测试侧仅执行真实页面回归

## 回测结果

### 回测 1：空白区域右键菜单

- 回测状态：复测通过
- 执行路径：
  1. 清空浏览器 `localStorage`
  2. 新建空白项目进入编辑态
  3. 在编辑区空白区域执行右键
- 回测结果：
  - 右键菜单成功打开
  - 菜单项仍为：
    - `插入文本`
    - `插入矩形`
    - `插入图片`
    - `插入图片框`
    - `粘贴`
  - 空白区域仍未错误出现 `复制所选 / 删除所选`
- 回测结论：
  - 修复未影响 `VNext-13` 已通过的空白区域右键菜单链路

### 回测 2：文本双击画布内编辑

- 回测状态：复测通过
- 执行路径：
  1. 通过右键菜单“插入文本”新增默认文本节点
  2. 双击该文本进入画布内编辑态
  3. 将内容改为 `画布内双击编辑成功`
  4. 点击非 canvas 区域退出编辑
- 回测结果：
  - 编辑后当前文本节点 `id = node-ac99ced9-8e4f-48ab-a6eb-cc0915c03fad`
  - 右侧“文本属性”中的“内容”字段已同步为 `画布内双击编辑成功`
  - `run-summary.json` 中：
    - `double-click-edit.text = 画布内双击编辑成功`
    - `double-click-edit.inspectorTextValue = 画布内双击编辑成功`
    - `double-click-edit.textUpdated = true`
  - 编辑态截图中，画布与属性面板内容保持一致
- 回测结论：
  - “点击非 canvas 区域退出编辑”后，文本已能第一时间写回标准文档与属性面板

### 回测 3：重复 / 删除所选与新文本继承

- 回测状态：复测通过
- 执行路径：
  1. 在已更新文本的节点上再次右键
  2. 点击“重复所选”
  3. 再对副本执行“删除所选”
- 回测结果：
  - 右键菜单中仍保留：
    - `复制所选`
    - `重复所选`
    - `删除所选`
  - 点击“重复所选”后，文本节点数量变为 `2`
  - 副本文本已继承最新内容：
    - `duplicatedText = 画布内双击编辑成功`
    - 偏移保持 `offsetX = 24`、`offsetY = 24`
  - 删除副本后，剩余文本节点数量回到 `1`
  - 剩余节点文本继续保持 `画布内双击编辑成功`
- 回测结论：
  - 修复后不会再把旧文本带入重复 / 删除后的后续链路

### 回测 4：本地持久化、刷新恢复与预览态

- 回测状态：复测通过
- 执行路径：
  1. 完成文本编辑与右键菜单操作后，读取浏览器 `localStorage`
  2. 刷新当前项目
  3. 切换到“预览”模式
- 回测结果：
  - `storage-after-context-actions.json` 中，文本节点 `props.text = 画布内双击编辑成功`
  - 同一节点的几何信息也已同步为编辑后结果：
    - `width = 421`
    - `height = 37.16`
  - 刷新后页面仍显示 `画布内双击编辑成功`
  - `run-summary.json` 中：
    - `reload-persistence.persistedText = 画布内双击编辑成功`
    - `reload-persistence.textStillUpdated = true`
  - 预览模式可正常打开，且当前页展示的文本仍为 `画布内双击编辑成功`
- 回测结论：
  - 文本双击编辑后的本地持久化、刷新恢复与预览态一致性已恢复

## 关键观察

- 这次修复收口在正确位置：没有改坏右键菜单本身，而是把“退出画布内编辑后提交最终文本”的时机拉回到了稳定状态。
- 从回测结果看，文字不仅内容同步了，连几何尺寸也和编辑后状态保持一致，说明这次不是单纯补了字符串回写，而是整个退出编辑后的文档同步链路恢复了。
- 当前脚本 `pnpm test:vnext-13` 已重新成为可复用的回归基线，后续如果再调整画布内文本编辑或右键菜单，可以优先复用这条自动化链路。

## 证据文件

- `docs/test-reports/assets/2026-04-07-vnext-13-round-01/blank-context-menu.png`
- `docs/test-reports/assets/2026-04-07-vnext-13-round-01/after-double-click-edit.png`
- `docs/test-reports/assets/2026-04-07-vnext-13-round-01/selected-context-menu.png`
- `docs/test-reports/assets/2026-04-07-vnext-13-round-01/after-context-duplicate.png`
- `docs/test-reports/assets/2026-04-07-vnext-13-round-01/after-context-delete.png`
- `docs/test-reports/assets/2026-04-07-vnext-13-round-01/after-reload.png`
- `docs/test-reports/assets/2026-04-07-vnext-13-round-01/preview-after-edit.png`
- `docs/test-reports/assets/2026-04-07-vnext-13-round-01/storage-after-context-actions.json`
- `docs/test-reports/assets/2026-04-07-vnext-13-round-01/run-summary.json`

## 未覆盖范围

- 右键菜单中的“插入图片”本地导入链路
- 右键菜单“复制所选”与“粘贴”闭环
- 多选对象场景下的右键菜单差异化展示
- 双击编辑后的撤销 / 重做完整闭环

## 剩余风险

- 当前 `VNext-13` 阻塞缺陷已通过回测，但如果后续继续调整 Fabric 文本编辑退出时机、右键菜单的全局指针事件收口，或属性面板与画布同步时序，建议优先回归本轮的“插入文本 -> 双击编辑 -> 点击非 canvas 退出 -> 刷新 -> 预览”组合路径。
