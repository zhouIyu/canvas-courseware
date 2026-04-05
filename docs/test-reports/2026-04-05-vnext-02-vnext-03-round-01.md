# 2026-04-05 VNext-02 / VNext-03 功能测试报告 Round 01

## 测试状态

- 测试状态：通过
- 测试结论：基于最近一次功能提交 `437b9d5 feat(editor): add VNext-02 keyboard workflow and clipboard actions` 执行真实页面功能测试后，当前覆盖范围内未发现新缺陷。快捷键体系与复制 / 粘贴 / 重复的核心链路均通过。
- 对应功能提交：`437b9d5 feat(editor): add VNext-02 keyboard workflow and clipboard actions`
- 本轮是否存在待复测修复文档：否

## 测试范围

- `VNext-02` 快捷键体系：
  - `Delete`
  - `Meta + Z`
  - `Meta + Shift + Z`
  - `方向键`
  - `Shift + 方向键`
- `VNext-03` 节点复制 / 粘贴 / 重复：
  - 同页复制 / 粘贴
  - 同页重复
  - 跨 slide 粘贴
  - 基础属性、样式与图片资源引用保留

## 测试环境

- 测试日期：2026-04-05
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 操作系统：`Darwin 25.3.0 arm64`
- 浏览器执行环境：`Playwright 1.58.0`（Python chromium）
- Python：`3.13.12`
- Node.js：`v24.14.0`
- pnpm：`10.30.3`
- 说明：按当前 `AGENTS.md` 约定，本轮测试未执行 `typecheck` / `build`
- 说明：本轮快捷键以 macOS 实际链路为准，使用 `Meta` 组合键执行

## 已验证通过

### 场景 1：方向键微调与撤销 / 重做快捷键

- 新建项目后新增 `Rectangle`，默认坐标为 `x=160, y=180`
- 按一次 `ArrowRight` 后，坐标更新为 `x=161, y=180`
- 再按一次 `Shift + ArrowDown` 后，坐标更新为 `x=161, y=190`
- 按一次 `Meta + Z` 后，恢复到 `x=161, y=180`
- 按一次 `Meta + Shift + Z` 后，再次回到 `x=161, y=190`

### 场景 2：同页复制 / 粘贴

- 在同一页中对选中 `Rectangle` 执行 `Meta + C`、`Meta + V`
- 粘贴后节点数从 `1` 变为 `2`
- 新节点保留：
  - 类型 `rect`
  - 尺寸 `280 x 180`
  - 填充色 `#99F6E4`
- 新节点坐标按预期偏移：
  - 原节点 `x=161, y=190`
  - 粘贴节点 `x=185, y=214`

### 场景 3：同页重复

- 对当前粘贴得到的矩形执行 `Meta + D`
- 节点数从 `2` 变为 `3`
- 新重复节点继续保留与源节点一致的尺寸和填充色
- 新重复节点再次按预期偏移：
  - 源节点 `x=185, y=214`
  - 重复节点 `x=209, y=238`

### 场景 4：删除快捷键

- 对当前选中节点执行 `Delete`
- 节点数从 `3` 变为 `2`
- 再执行一次 `Meta + Z` 后，节点数恢复为 `3`

### 场景 5：跨 slide 粘贴与资源引用保留

- 新增 `Image` 后，在右侧属性面板把图片地址设置为 `https://example.com/demo-image.png`
- 复制该图片节点后新增第 2 页，并在第 2 页执行 `Meta + V`
- 第 2 页节点数变为 `1`
- 粘贴后的图片节点保留：
  - 类型 `image`
  - `src=https://example.com/demo-image.png`
  - `objectFit=cover`
  - 尺寸 `260 x 220`
- 坐标同样按预期偏移：
  - 原节点基础坐标加 `24 / 24`

## 关键观察

- 当前 `VNext-02` 的快捷键实现已经覆盖了删除、撤销、重做、方向键微调和大步移动的最小闭环。
- 当前 `VNext-03` 的复制 / 粘贴 / 重复能力已经覆盖同页与跨 slide 场景，并且在本轮图片节点测试中保留了资源引用字段。
- 同页粘贴与重复都采用稳定的固定偏移策略，用户可以明显看到新节点位置变化，不会与源节点完全重叠。

## 证据文件

- `docs/test-reports/assets/2026-04-05-vnext-02-vnext-03-round-01/keyboard-nudge.png`
- `docs/test-reports/assets/2026-04-05-vnext-02-vnext-03-round-01/same-slide-paste.png`
- `docs/test-reports/assets/2026-04-05-vnext-02-vnext-03-round-01/duplicate.png`
- `docs/test-reports/assets/2026-04-05-vnext-02-vnext-03-round-01/delete-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-02-vnext-03-round-01/cross-slide-paste.png`

## 未覆盖范围

- 本轮未覆盖 `Ctrl` 组合键在 Windows / Linux 环境下的等价行为
- 本轮未覆盖多选状态下的复制 / 粘贴 / 重复
- 本轮未覆盖 `Text` 与 `Image` 在同页重复后的更多样式组合验证
- 本轮未覆盖框选、多选、批量移动与对齐分布；这些属于 `VNext-04`

## 剩余风险

- 当前覆盖证明 `VNext-02` 与 `VNext-03` 的基础闭环已可用，但更复杂的多选剪贴板与跨平台快捷键兼容性仍需后续补测
- 如果后续继续调整历史栈、节点克隆逻辑或快捷键监听范围，建议优先回归本轮这 5 条路径
