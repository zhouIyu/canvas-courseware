# 2026-04-01 MVP 主流程测试报告 Round 12

## 测试状态

- 测试状态：已回测失败
- 测试结论：本轮已完成 `拖拽 / 缩放` 专项补测，并先后在 Round 13、Round 14、Round 15 基于三轮修复文档完成回归。当前 `BUG-05` 仍未关闭：`Rectangle` 与 `Image` 缩放通过，但 `Text` 缩放在第三轮修复后仍失败，MVP 主流程仍未收口。
- 本轮是否存在待复测修复文档：是，`docs/test-reports/2026-04-01-bugfix-round-14.md`

## 测试范围

- 编辑态 `Text` 节点拖拽
- 编辑态 `Rect` 节点拖拽
- 编辑态对象缩放控制点交互
- 拖拽 / 缩放后的本地落盘结果观察

## 测试环境

- 测试日期：2026-04-01
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 操作系统：`Darwin 25.3.0 arm64`
- 浏览器执行环境：`Playwright 1.58.0`
- Python：`3.13.12`
- Node.js：`v24.14.0`
- pnpm：`10.30.3`
- 说明：按当前 `AGENTS.md` 约定，本轮测试未执行 `typecheck` / `build`

## 已验证通过

- 新建项目后，点击 `文本` 与 `矩形` 可以成功创建对象。
- 画布中拖拽 `Text` 对象后，节点坐标可发生变化，并写入本地存储：
  - 拖拽前：`x=110, y=110`
  - 拖拽后：`x=290, y=267.156`
- 画布中拖拽 `Rectangle` 对象后，节点坐标可发生变化，并写入本地存储：
  - 拖拽前：`x=160, y=180`
  - 拖拽后：`x=300, y=264`
- 拖拽完成后，顶部保存状态可恢复为 `已保存`，说明拖拽后的编辑结果能进入当前自动保存链路。

## 缺陷明细

### BUG-05 编辑态对象缩放交互未生效

- 状态：已挂起（2026-04-02 按用户决定暂时关闭）
- 严重级别：高
- 影响范围：编辑态对象缩放能力；直接影响 PRD 中“支持选中、拖拽、缩放”的验收要求，MVP 主流程无法按预期闭环。
- 前置条件：本地服务已启动，可访问 `http://127.0.0.1:32173/projects`；进入新建项目工作台，当前对象未锁定。
- 复现频率：2/2（两轮独立 Playwright 专项脚本均稳定复现；其中一轮包含多组缩放句柄偏移尝试）

#### 复现步骤

1. 进入项目列表页。
2. 点击“新建项目”，进入编辑模式工作台。
3. 点击“矩形”，在当前页面新增一个矩形对象。
4. 保持矩形处于选中状态，尝试拖动右下角缩放控制点向外扩展。
5. 观察画布对象尺寸、右侧属性面板中的“宽度 / 高度”，以及本地存储中的节点数据。

#### 期望结果

1. 拖动缩放控制点后，矩形宽高应立即发生变化。
2. 右侧属性面板中的“宽度 / 高度”应同步更新。
3. 自动保存完成后，本地存储中的节点 `width / height` 应为最新值。

#### 实际结果

1. 多次尝试拖动缩放控制点后，矩形宽高没有发生变化。
2. 右侧属性面板中的“宽度 / 高度”仍保持初始值 `280 / 180`。
3. 本地存储中节点尺寸也未发生变化。
4. 某些尝试下，画布会直接丢失当前选中态，而不是进入缩放过程。

#### 补充观察

- 拖拽能力本身已经通过：本轮同样的 Playwright 指针交互可以稳定把 `Text` 与 `Rectangle` 移动到新坐标，说明问题更像是“缩放控制点 / 缩放路径”失效，而不是通用鼠标交互全部异常。
- 专项取证脚本中，矩形节点在缩放尝试前后保持完全一致：
  - 尝试前：`x=160, y=180, width=280, height=180`
  - 尝试后：`x=160, y=180, width=280, height=180`
- 在另一轮“先拖拽再缩放”的补测中，矩形拖拽后坐标已更新为 `x=300, y=264`，但后续多组缩放句柄偏移尝试仍未让 `width / height` 发生变化。

#### 证据

- 拖拽前基线截图：`docs/test-reports/assets/2026-04-01-mvp-main-flow-round-12/before-transform.png`
- 拖拽通过截图：`docs/test-reports/assets/2026-04-01-mvp-main-flow-round-12/after-drag.png`
- 缩放尝试后截图：`docs/test-reports/assets/2026-04-01-mvp-main-flow-round-12/after-resize-attempt.png`

#### 排查线索

- 测试侧观察到：对象已开启控制点、拖拽可正常落盘，但缩放路径没有产出尺寸更新结果。
- 建议开发优先检查编辑态 Fabric 适配器中的对象变换处理和缩放事件落盘逻辑，以及对象控制点命中区域是否存在问题：
  - [editor-adapter.ts](/Users/admin/MyDemo/canvas-courseware/packages/fabric/src/editor-adapter.ts)
  - [object-factory.ts](/Users/admin/MyDemo/canvas-courseware/packages/fabric/src/object-factory.ts)

#### 回测结果

- 回测轮次：Round 15
- 回测状态：复测失败
- 回测结论：
  - `Text` 单项缩放：Round 13、Round 14、Round 15 均复测失败，尺寸仍保持 `width=420, height=72`
  - `Rectangle` 缩放、拖拽后再缩放、自动保存与刷新恢复：复测通过
  - `Image` 单项缩放：复测通过
- 回测证据：
  - `docs/test-reports/assets/2026-04-01-regression-round-15/text-scale-still-fails.png`
  - `docs/test-reports/assets/2026-04-01-regression-round-15/rect-scale-pass.png`
  - `docs/test-reports/assets/2026-04-01-regression-round-15/image-scale-pass.png`

## 未覆盖范围

- `Image` 对象的拖拽与缩放未在本轮单独验证
- 修复 `BUG-05` 后的回归测试尚未执行
- 拖拽 / 缩放与图层顺序、时间轴配置混合操作的组合场景未在本轮继续扩展

## 剩余风险

- 在 `BUG-05` 修复前，MVP 编辑态“缩放”验收项仍不满足。
- 后续修复后，建议优先回归 `Text / Rect / Image` 三类对象的缩放、拖拽后再缩放、缩放后保存与刷新恢复。
