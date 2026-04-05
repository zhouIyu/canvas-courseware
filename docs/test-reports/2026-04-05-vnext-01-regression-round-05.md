# 2026-04-05 VNext-01 扩展回归测试报告 Round 05

## 测试状态

- 测试状态：通过
- 测试结论：在 `docs/test-reports/2026-04-05-vnext-01-regression-round-04.md` 已确认基础入口恢复后，本轮继续对 `VNext-01` 做更完整的撤销 / 重做扩展回归。当前覆盖的 5 类代表性场景均通过：属性修改、画布拖拽、画布缩放、图层顺序调整、时间轴动作编辑都能在真实页面里完成撤销 / 重做闭环。
- 关联基础回归报告：`docs/test-reports/2026-04-05-vnext-01-regression-round-04.md`
- 关联修复文档：`docs/test-reports/2026-04-05-vnext-01-bugfix-round-02.md`

## 测试范围

- `VNext-01` 撤销 / 重做扩展覆盖：
  - `Text` 内容属性修改
  - `Rectangle` 画布拖拽
  - `Rectangle` 画布缩放
  - 图层顺序调整
  - 时间轴步骤与动作编辑
- 本轮目标：
  - 在真实页面验证“执行操作 -> 自动保存 -> 撤销 -> 重做”的完整闭环
  - 补足 Round 04 仅覆盖“新增对象 / 新增页面”的范围缺口

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

## 测试结果

### 场景 1：`Text` 内容属性修改

- 状态：通过
- 执行路径：
  1. 新建项目
  2. 新增 `Text`
  3. 在右侧“组件属性”中把文本内容改为 `扩展回归属性修改`
  4. 等待自动保存
  5. 执行一次 `撤销`
  6. 再执行一次 `重做`
- 结果：
  - 修改后文本内容：`扩展回归属性修改`
  - 撤销后文本内容：`新建文本`
  - 重做后文本内容：`扩展回归属性修改`

### 场景 2：`Rectangle` 画布拖拽

- 状态：通过
- 执行路径：
  1. 新建项目
  2. 新增 `Rectangle`
  3. 在画布中直接拖拽矩形
  4. 等待自动保存
  5. 执行一次 `撤销`
  6. 再执行一次 `重做`
- 结果：
  - 拖拽前坐标：`x=160, y=180`
  - 拖拽后坐标：`x=352.965, y=308.643`
  - 撤销后坐标：`x=160, y=180`
  - 重做后坐标：`x=352.965, y=308.643`

### 场景 3：`Rectangle` 画布缩放

- 状态：通过
- 执行路径：
  1. 新建项目
  2. 新增 `Rectangle`
  3. 在画布中拖动右下角控制点进行缩放
  4. 等待自动保存
  5. 执行一次 `撤销`
  6. 再执行一次 `重做`
- 结果：
  - 缩放前尺寸：`280 x 180`
  - 缩放后尺寸：`417.866 x 269.159`
  - 撤销后尺寸：`280 x 180`
  - 重做后尺寸：`417.866 x 269.159`

### 场景 4：图层顺序调整

- 状态：通过
- 执行路径：
  1. 新建项目
  2. 新增 `Text`
  3. 新增 `Rectangle`
  4. 进入右侧“组件列表”
  5. 选中 `Text` 并执行 `置顶`
  6. 等待自动保存
  7. 执行一次 `撤销`
  8. 再执行一次 `重做`
- 结果：
  - 调整前顺序：`["Text", "Rectangle"]`
  - 调整后顺序：`["Rectangle", "Text"]`
  - 撤销后顺序：`["Text", "Rectangle"]`
  - 重做后顺序：`["Rectangle", "Text"]`

### 场景 5：时间轴步骤与动作编辑

- 状态：通过
- 执行路径：
  1. 新建项目
  2. 新增 `Text`
  3. 进入右侧“时间轴”
  4. 点击“新建步骤”
  5. 点击“添加动作”
  6. 等待自动保存
  7. 执行一次 `撤销`
  8. 再执行一次 `重做`
- 结果：
  - 新建步骤后：`1` 个步骤，`1` 个动作
  - 添加动作后：`1` 个步骤，`2` 个动作
  - 撤销后：`1` 个步骤，`1` 个动作
  - 重做后：`1` 个步骤，`2` 个动作

## 证据文件

- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/property-after.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/property-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/property-redo.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/drag-after.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/drag-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/drag-redo.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/resize-after.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/resize-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/resize-redo.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/layer-after.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/layer-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/layer-redo.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/timeline-after.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/timeline-undo.png`
- `docs/test-reports/assets/2026-04-05-vnext-01-regression-round-05/timeline-redo.png`

## 未覆盖范围

- `node.delete` 当前没有直接暴露在本轮使用的显式页面入口，本轮未覆盖“删除对象”的撤销 / 重做
- `Slide` 删除、复制、排序与命名增强属于 `VNext-05` 范围，不在本轮覆盖范围内
- `Text` 画布缩放仍对应已挂起的 `BUG-05`，本轮只回归了 `Rectangle` 的画布缩放
- 快捷键撤销 / 重做未测试；该项属于 `VNext-02` 范围，不在本轮测试范围内
- 跨多个连续历史步骤的大规模回退，以及多 slide 混合编辑下的复杂历史链路未在本轮继续展开

## 剩余风险

- 本轮扩展回归证明 `VNext-01` 已不只恢复“基础入口”，在当前覆盖的代表性场景里也能稳定完成撤销 / 重做闭环。
- 但这仍不能替代所有组合场景的全量验证；如果后续继续调整历史栈、文档回写、画布变换同步或时间轴命令链路，建议优先回归本轮这 5 条代表性路径。
