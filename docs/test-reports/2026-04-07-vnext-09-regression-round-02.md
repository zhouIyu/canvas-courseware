# 2026-04-07 VNext-09 回归测试报告 Round 02

## 回测状态

- 回测状态：失败
- 回测结论：`VNext-09` 本轮修复只完成了数据初始化层的收敛，新建页面与“后插入”页面的 `background.image` 已不再写入上一页背景图；但编辑画布在切到这些新页面后，仍持续显示上一页背景图残影，直到用户再次修改背景配置才会恢复正常。因此页面背景配置主链路仍未通过复测。
- 对应初测报告：`docs/test-reports/2026-04-07-vnext-09-round-01.md`
- 对应修复文档：`docs/test-reports/2026-04-07-vnext-09-bugfix-round-01.md`

## 回测范围

- 顶部“新建页面”入口的背景初始化行为
- 页面卡片“后插入”入口的背景初始化行为
- 复制页面的背景继承边界
- 背景色修改后的编辑态恢复
- 缩略页背景 UI 一致性
- 刷新恢复与预览态背景渲染

## 回测环境

- 回测日期：2026-04-07
- 仓库路径：`/Users/admin/MyDemo/canvas-courseware`
- 本地访问地址：`http://127.0.0.1:32173/projects`
- 浏览器执行环境：`Playwright 1.58.0`（Python chromium）
- 说明：按当前 `AGENTS.md` 约定，本轮回测未执行 `pnpm typecheck` / `pnpm build`
- 说明：开发侧已在修复文档中记录 `pnpm typecheck` 与 `pnpm build` 通过，本轮测试侧仅执行真实页面回归
- 测试输入：`docs/test-reports/assets/2026-04-07-vnext-09-regression-round-02/vnext09-bg-portrait.png`

## 回测结果

### 回测 1：顶部“新建页面”入口

- 回测状态：复测失败
- 执行路径：
  1. 新建空白项目
  2. 在第 1 页设置背景色 `#D9FBEA`
  3. 导入本地背景图，并设置填充方式为“拉伸铺满”
  4. 点击顶部工具栏“新建页面”
- 回测结果：
  - 当前激活页名称已切换为 `第2页`
  - 右侧页面设置 UI 显示为：
    - `field_note = 未配置`
    - `preview_chip = 仅使用纯色背景`
    - “清空背景图”按钮为禁用态
  - 但编辑画布像素仍为上一页背景图内容：
    - `(100, 100) = [255, 107, 107, 255]`
    - `(640, 360) = [255, 255, 255, 255]`
  - 额外确认：等待 `2` 秒后，画布仍未自动清除残留背景图
  - `storage-toolbar-new-stale.json` 显示第 2 页 `background.image = null`
- 结论：
  - 数据层已修正，但编辑画布未在切页时同步清空上一页背景图，复测失败

### 回测 2：“后插入”入口

- 回测状态：复测失败
- 执行路径：
  1. 在第 1 页保持同样的背景图配置
  2. 点击第 1 页卡片操作中的“后插入”
- 回测结果：
  - 右侧页面设置同样显示“未配置”，说明新页状态并未携带背景图
  - 但编辑画布 `(100, 100)` 像素仍为 `[255, 107, 107, 255]`
  - `storage-create-after-stale.json` 显示新页 `background.image = null`
- 结论：
  - “后插入”与顶部“新建页面”存在相同的编辑画布残影问题，说明本轮修复未覆盖渲染层切页清理逻辑

### 回测 3：复制页面边界、刷新恢复与预览态

- 回测状态：部分通过
- 执行路径：
  1. 在失败场景外，继续将第 2 页背景色改为 `#FFE7C2`
  2. 再从第 2 页“后插入”生成第 3 页
  3. 复制第 1 页，生成 `第1页 副本`
  4. 保存后刷新页面，并切换到预览模式回归
- 回测结果：
  - 第 2 页与第 3 页在显式修改后，编辑画布像素均恢复为纯色：
    - `(100, 100) = [255, 231, 194, 255]`
  - `第1页 副本` 继续完整继承背景图，像素保持：
    - `(100, 80) = [255, 107, 107, 255]`
    - `(100, 640) = [77, 150, 255, 255]`
  - 刷新后第 2 页纯色背景保持稳定，`第1页 副本` 的背景图也能恢复
  - 预览态下：
    - 第 2 页 `(100, 100) = [255, 231, 194, 255]`
    - `第1页 副本` `(100, 80) = [255, 107, 107, 255]`
  - 编辑态与预览态缩略页样式一致：
    - 第 1 页与 `第1页 副本` `backgroundImage != none`
    - 第 2 页与第 3 页 `backgroundImage = none`
- 结论：
  - 复制页面边界、数据持久化、缩略页 UI 和预览态链路基本正常
  - 当前阻塞点集中在“新建页面 / 后插入”后的编辑画布首帧残影

## 关键观察

- 本轮修复把问题从“新页面状态错误”缩小到了“编辑画布渲染未及时清理旧背景图”。
- 复测中，页面设置 UI、存储快照和缩略页样式都能正确反映“新页未配置背景图”，但中央编辑画布仍显示旧图，说明 UI 状态与画布渲染状态已经出现不一致。
- 从测试现象推断，风险点更接近切换到 `background.image = null` 的 slide 时，编辑画布没有立即清掉上一页背景图对象。

## 证据文件

- `docs/test-reports/assets/2026-04-07-vnext-09-regression-round-02/toolbar-new-stale.png`
- `docs/test-reports/assets/2026-04-07-vnext-09-regression-round-02/storage-toolbar-new-stale.json`
- `docs/test-reports/assets/2026-04-07-vnext-09-regression-round-02/create-after-stale.png`
- `docs/test-reports/assets/2026-04-07-vnext-09-regression-round-02/storage-create-after-stale.json`
- `docs/test-reports/assets/2026-04-07-vnext-09-regression-round-02/edit-overview.png`
- `docs/test-reports/assets/2026-04-07-vnext-09-regression-round-02/preview-overview.png`
- `docs/test-reports/assets/2026-04-07-vnext-09-regression-round-02/storage-after-regression.json`
- `docs/test-reports/assets/2026-04-07-vnext-09-regression-round-02/run-summary.json`

## 未覆盖范围

- 远程 URL 背景图地址链路
- `cover` 模式在预览态下的独立像素验证
- 页面尺寸变化与背景图适配联动
- JSON 导出后再导入背景图项目

## 剩余风险

- 在编辑画布切页清理逻辑修复前，用户会看到“状态说未配置，但画面仍有背景图”的混乱反馈，这会直接降低页面背景配置的可用性与可理解性。
- 即便后续修复了首帧残影，仍建议继续回归：
  - 顶部“新建页面”
  - 页面卡片“后插入”
  - 复制页面
  - 刷新恢复
  - 预览态与缩略页的一致性
