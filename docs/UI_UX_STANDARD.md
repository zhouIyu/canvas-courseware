# Canvas Courseware UI/UX 设计标准

## 1. 文档目的

本文档定义 `Canvas Courseware SDK MVP` 的 UI/UX 设计标准，作为以下模块的统一依据：

- `packages/vue`
- `apps/playground`
- 后续扩展的编辑器壳层、预览器壳层、图层面板、属性面板、timeline 配置面板

本文档解决两个问题：

- 统一当前项目的视觉语言与交互规则，避免页面风格漂移
- 为后续 UI 开发提供可执行标准，而不是只停留在“看起来不错”

## 2. 设计结论

### 2.1 产品类型判断

结合当前 PRD，本项目属于以下两类产品的混合体：

- 主类型：`Productivity Tool`
- 次类型：`Educational App`

原因：

- 它本质上是一个“课件编辑器 / 播放器工作台”，编辑效率和信息层级优先级高于装饰性
- 它服务于教学内容生产与播放场景，因此需要兼顾教育属性和可理解性

### 2.2 采用的设计方向

基于 `ui-ux-pro-max` 的检索结果，本项目采用以下组合：

- 主风格：`Flat Design + Micro-interactions`
- 辅助风格：`Inclusive Design`
- 页面模式：`Workbench / Editor Shell`

不采用以下方向作为默认主风格：

- 默认深色工作台
  原因：当前产品是内容编辑型工作台，画布和内容查看更适合高亮、浅底、弱噪音环境
- Claymorphism / 儿童教育风格
  原因：当前产品更偏“专业课件生产工具”，不是儿童启蒙应用
- 过强的玻璃拟态 / 拟物风
  原因：会降低信息密度管理能力，并增加维护成本

### 2.3 设计关键词

本项目统一使用以下关键词描述视觉气质：

- 清晰
- 可控
- 教学友好
- 专业但不冰冷
- 高信息密度下仍然可读
- 适度动效，而不是动效堆叠

## 3. 设计系统来源

本标准基于 `ui-ux-pro-max` 技能的以下检索结果整理，并结合当前项目场景做了人工取舍：

```bash
python3 /Users/admin/.agents/skills/ui-ux-pro-max/scripts/search.py \
  "education courseware editor productivity canvas slide presentation" \
  --design-system --format markdown --project-name "Canvas Courseware"

python3 /Users/admin/.agents/skills/ui-ux-pro-max/scripts/search.py \
  "education productivity" --domain color -n 8

python3 /Users/admin/.agents/skills/ui-ux-pro-max/scripts/search.py \
  "editor modern readable" --domain typography -n 8

python3 /Users/admin/.agents/skills/ui-ux-pro-max/scripts/search.py \
  "editor workspace education productivity" --domain style -n 8

python3 /Users/admin/.agents/skills/ui-ux-pro-max/scripts/search.py \
  "editor accessibility animation loading spacing hierarchy" --domain ux -n 12
```

采纳逻辑如下：

- 颜色系统主要采用 `Productivity Tool` 的 teal + orange 方案
- 字体优先采用适合简体中文的 `Noto Sans SC`
- 交互标准采用 `Inclusive Design` 与 `Micro-interactions` 规则
- 设计系统中出现的“Dark Mode (OLED)”和儿童化字体建议，不作为默认方案

## 4. 信息架构标准

### 4.1 编辑器壳层

编辑器页面必须遵循以下结构：

1. 顶部状态条
2. 左侧 slide 列表
3. 中央 canvas 工作区
4. 右侧管理区

右侧管理区后续应包含：

- 图层列表
- 属性面板
- timeline 配置区

禁止把所有能力都堆在顶部工具栏。

### 4.2 预览器壳层

预览器页面必须遵循以下结构：

1. 顶部播放控制区
2. 当前 slide 画布区
3. 步骤状态区
4. slide 快速切换区

预览器不应复用编辑器的“编辑语义控件”。

### 4.3 正式应用页

`apps/playground` 在当前阶段作为正式应用壳层，推荐使用：

- 首页：项目列表
- 工作台页：顶部主状态条 + 模式切换
- 编辑模式：左侧 slide rail + 中央 canvas + 右侧标签管理区
- 预览模式：在同一项目页内切换到预览工作区

目标是让使用者能直接完成：

- 进入项目
- 编辑课件
- 切换预览
- 保存并恢复本地项目

## 5. 视觉 Token 标准

### 5.1 颜色系统

默认色板如下：

| Token | Value | 用途 |
|------|------|------|
| `--cw-color-primary` | `#0D9488` | 主品牌色、主操作强调 |
| `--cw-color-primary-2` | `#14B8A6` | 次级高亮、状态辅助 |
| `--cw-color-accent` | `#EA580C` | CTA、重要动作、步骤强调 |
| `--cw-color-bg` | `#F0FDFA` | 页面浅背景 |
| `--cw-color-surface` | `#FFFFFF` | 卡片、工作区、面板背景 |
| `--cw-color-text` | `#134E4A` | 主文本 |
| `--cw-color-muted` | `#64748B` | 次级文本 |
| `--cw-color-border` | `#99F6E4` | 边框与弱分隔线 |
| `--cw-color-danger` | `#DC2626` | 危险操作 |

补充规则：

- 组件内部禁止直接写零散 hex 颜色，必须优先映射到语义 token
- `accent` 只用于高价值动作，不用于日常说明文字
- 画布工作区背景与页面背景必须有清晰分层，不能融成一片

### 5.2 字体系统

默认字体标准：

- 中文主字体：`Noto Sans SC`
- 英文与数字辅助字体：`Noto Sans SC` 同体系优先
- 若后续需要做英文营销页，可局部引入 `Outfit` 作为英文标题辅助字体

文字层级建议：

| 场景 | 字号 | 字重 | 行高 |
|------|------|------|------|
| 页面主标题 | 32-44px | 600-700 | 1.1 |
| 区块标题 | 20-28px | 600 | 1.2 |
| 工具栏标签 | 12-14px | 500 | 1.4 |
| 正文 | 14-16px | 400-500 | 1.6 |
| 辅助说明 | 12-14px | 400 | 1.5 |

补充规则：

- 正文不得小于 `14px`
- body 默认行高不低于 `1.5`
- 中文场景不建议使用过度装饰型标题字体

### 5.3 间距系统

采用 4pt 基础网格，主间距节奏如下：

- `4`
- `8`
- `12`
- `16`
- `24`
- `32`
- `40`
- `48`

强制规则：

- 组件内部 padding 优先使用 `12 / 16 / 24`
- 区块之间垂直间距优先使用 `24 / 32`
- 触控按钮之间至少 `8px` 间距

### 5.4 圆角系统

统一圆角尺度：

| Token | Value | 场景 |
|------|------|------|
| `--cw-radius-sm` | `12px` | 小按钮、小标签 |
| `--cw-radius-md` | `18px` | 卡片、输入区 |
| `--cw-radius-lg` | `24px` | 面板、工作区壳层 |
| `--cw-radius-xl` | `28px` | 主容器 |
| `--cw-radius-pill` | `999px` | Chip、胶囊按钮 |

### 5.5 阴影系统

统一阴影尺度：

- 弱阴影：用于次级卡片
- 中阴影：用于主卡片、状态卡
- 强阴影：用于 canvas stage 或悬浮层

禁止每个组件自定义一套完全不同的阴影参数。

## 6. 组件标准

### 6.1 顶部状态条

必须包含：

- 页面标题
- 当前模式说明
- 核心统计信息
- 保存状态与保存入口

不应包含：

- 过多次要按钮
- 与当前页面无关的全局管理项

### 6.2 Toolbar

Toolbar 应遵循：

- 按能力分组
- 每组前有文本标签
- 主动作与危险动作视觉区分明确

当前 MVP toolbar 至少包括：

- `Insert`
- `Selection`

### 6.3 Slide Rail

Slide 列表必须具备：

- 页码
- 名称
- 节点数量
- 缩略图占位
- 激活状态

激活态必须明显区别于普通态，不能只靠轻微背景变化。

### 6.4 Canvas Stage

Canvas 容器必须包含两层：

- 外层工作区背景
- 内层真实画布区域

标准要求：

- 画布必须居中
- 画布四周保留滚动安全空间
- 画布阴影应明显但不抢内容

### 6.5 图层面板

图层面板在后续实现时必须支持：

- 节点名称
- 类型标识
- 当前选中高亮
- 层级操作入口

图层顺序必须与文档 `nodes[]` 顺序一致。

### 6.6 属性面板

属性面板后续必须遵循：

- 按属性分组展示
- 使用标签 + 值的清晰结构
- 错误与限制信息就近出现

首版建议分组：

- 基础：位置、尺寸、旋转、透明度
- 文本：内容、字号、颜色
- 矩形：填充、描边、圆角
- 图片：地址、适配方式

### 6.6.1 正式工作台右侧标签

正式工作台首版固定为以下标签：

- 页面设置
- 组件属性
- 组件列表

`时间轴` 作为下一阶段独立标签，不应临时混入组件属性区。

### 6.7 预览器控制区

预览器控制区应包含：

- Reset
- Next Step
- 当前播放状态
- 当前 trigger 类型

播放控制文案必须避免技术实现词汇，优先用户可理解语言。

## 7. 交互标准

### 7.1 点击与触控

- 所有按钮最小可点击区域不小于 `44x44`
- 相邻操作按钮间距不小于 `8px`
- 不允许依赖 hover 才能完成核心操作

### 7.2 选中与反馈

- 当前选中对象必须有清晰视觉反馈
- 删除、切页、重置等行为需要即时视觉回馈
- 异步或耗时操作超过 `300ms` 必须展示 loading 状态

### 7.3 动效标准

采用“有意义的动效”，而不是装饰动效。

推荐时长：

- 微交互：`150-220ms`
- 面板切换：`180-260ms`
- 步骤播放动画：`200-450ms`

规则：

- enter 优先 `ease-out`
- exit 优先 `ease-in`
- 连续无限动画只允许用于 loading
- 必须支持 `prefers-reduced-motion`

### 7.4 预览步骤交互

点击触发与自动触发必须在 UI 上可见：

- 当前下一步是 `click` 还是 `auto`
- 当前步骤序号
- 总步骤数

不能让用户“猜”现在为什么没有继续播放。

## 8. 可访问性标准

### 8.1 对比度

- 普通文本对比度至少 `4.5:1`
- 大文本至少 `3:1`
- 关键状态尽量达到 `7:1` 水平

### 8.2 焦点与键盘

- 所有可交互元素必须保留清晰的 focus ring
- Tab 顺序必须和视觉顺序一致
- 不能为了“好看”移除 focus 样式

### 8.3 语义结构

- 标题层级必须顺序使用
- 图标按钮必须有文本或 aria-label
- 状态不能只用颜色表达，需配合文本或图标

### 8.4 动效与阅读

- 必须尊重 `prefers-reduced-motion`
- 字体缩放后界面不能明显崩坏
- 长文与说明文字不能挤压成不可读密度

## 9. 响应式标准

首版响应式断点：

- `375`
- `768`
- `1024`
- `1440`

规则：

- 移动端优先保证可读和可操作，不强求桌面工作台完整复制
- 小屏下右侧面板可以折叠或下沉，但不能丢失核心控制能力
- 禁止出现横向滚动页面

### 9.1 项目列表页

项目列表页必须具备：

- 顶部品牌区与产品说明
- 项目搜索输入
- 项目卡片网格
- 新建项目入口

项目卡片必须具备：

- 项目标题
- 最近更新时间
- slide 数
- 缩略图占位

## 10. 实施约束

后续 UI 实现必须遵循以下约束：

- Vue 组件不能直接操作 Fabric 对象
- UI 层只读取标准 snapshot / state
- Fabric 相关逻辑只能存在于 `packages/fabric`
- `packages/vue` 内部必须按 `editor / preview / shared` 组织
- 新增组件时优先复用共享 token 与格式化方法

## 11. 代码层面的落地建议

### 11.1 目录建议

`packages/vue` 统一使用以下结构：

```text
src/
  editor/
  preview/
  shared/
  index.ts
```

### 11.2 样式建议

- 全局 token 用 `--cw-*`
- editor token 用 `--cw-editor-*`
- preview token 用 `--cw-preview-*`

### 11.3 组件命名建议

- 编辑器壳层：`CoursewareEditor`
- 预览器壳层：`CoursewarePreview`
- 图层面板：`LayerPanel`
- 属性面板：`InspectorPanel`
- 时间线面板：`TimelinePanel`

## 12. 当前阶段的 UI 验收清单

在当前 MVP 阶段，任何新增 UI 合并前都应检查：

- [ ] 是否符合 `editor / preview / shared` 分层
- [ ] 是否使用统一语义 token，而不是散落的颜色值
- [ ] 是否保留了 focus、loading、disabled 等状态
- [ ] 是否满足 44x44 点击区域要求
- [ ] 是否在 375 / 768 / 1024 / 1440 下没有明显结构崩坏
- [ ] 是否没有把 Fabric 逻辑直接写进 Vue 组件
- [ ] 是否可以通过同一份 JSON 驱动编辑和预览
- [ ] 是否已经从“联调页”切换为“正式应用页”语义

## 13. 当前结论

对本项目来说，最佳默认方向不是“炫技型编辑器”，而是：

- `Productivity Tool` 的清晰层级
- `Educational App` 的友好可理解性
- `Flat Design + Micro-interactions + Inclusive Design`

后续所有 UI 迭代，都应以这份文档为准，而不是按单页面临时发挥。
