# 通用 JSON 设计说明

这份文档用于说明 Canvas Courseware SDK MVP 的通用 JSON 结构。  
目标是让文档模型独立于 Vue、Fabric 等具体实现，供编辑态和播放态共享。

## 设计原则

- 不包含 Fabric、Konva、Pixi 等引擎专有字段
- 一份 JSON 同时服务编辑器和播放器
- `slides[].nodes[]` 的数组顺序即图层顺序
- `timeline.steps[]` 负责定义播放步骤
- `timeline.animations[]` 负责定义动画资源
- `steps` 与 `animations` 通过 `targetId` 和 `animationId` 关联

## 顶层结构

```jsonc
{
  // schema 版本，后续升级时用来做兼容处理
  "version": "1.0.0",

  // 文档元信息
  "meta": {
    // 文档唯一 ID
    "id": "courseware-demo",
    // 文档标题
    "title": "Canvas Courseware Demo"
  },

  // slide 列表，一个课件由多个 slide 组成
  "slides": []
}
```

## 完整示例

```jsonc
{
  "version": "1.0.0",
  "meta": {
    "id": "courseware-demo",
    "title": "Canvas Courseware Demo"
  },
  "slides": [
    {
      // 当前 slide 的唯一 ID
      "id": "slide-1",

      // slide 名称，供左侧缩略图或目录展示
      "name": "Intro",

      // 画布尺寸，每个 slide 对应一个独立 canvas
      "size": {
        "width": 1280,
        "height": 720
      },

      // 背景配置，MVP 先支持纯色
      "background": {
        "fill": "#F5F7FB"
      },

      // 元素列表，数组顺序即图层顺序
      "nodes": [
        {
          // 元素唯一 ID
          "id": "node-title",
          // 元素类型，MVP 支持 text / image / rect
          "type": "text",
          // 元素名称，供图层面板展示
          "name": "Title",
          // 左上角坐标
          "x": 96,
          "y": 80,
          // 元素尺寸
          "width": 640,
          "height": 72,
          // 旋转角度
          "rotation": 0,
          // 透明度，范围 0 ~ 1
          "opacity": 1,
          // 是否可见，通常作为初始显示状态
          "visible": true,
          // 是否锁定，锁定后编辑态不可拖拽
          "locked": false,
          // 各类型自己的属性
          "props": {
            "text": "Fabric MVP",
            "fontSize": 48,
            "color": "#172033",
            "fontWeight": 700,
            "textAlign": "left"
          }
        },
        {
          "id": "node-accent",
          "type": "rect",
          "name": "Accent Card",
          "x": 96,
          "y": 190,
          "width": 420,
          "height": 180,
          "rotation": 0,
          "opacity": 1,
          // 初始隐藏，等待 timeline step 触发显示
          "visible": false,
          "locked": false,
          "props": {
            "fill": "#DCE8FF",
            "stroke": "#4B7BE5",
            "strokeWidth": 2,
            "radius": 20
          }
        },
        {
          "id": "node-cover",
          "type": "image",
          "name": "Cover Image",
          "x": 780,
          "y": 140,
          "width": 320,
          "height": 320,
          "rotation": 0,
          "opacity": 1,
          "visible": false,
          "locked": false,
          "props": {
            "src": "https://example.com/demo-cover.png",
            "alt": "Demo cover",
            "objectFit": "cover"
          }
        }
      ],

      // 时间线定义
      "timeline": {
        // 播放步骤列表，按顺序执行
        "steps": [
          {
            "id": "step-1",
            "name": "Show accent",
            // page-click 表示等待用户点击页面再进入下一步
            "trigger": {
              "type": "page-click"
            },
            // 当前步骤执行的动作列表
            "actions": [
              {
                "id": "action-1",
                "type": "show-node",
                "targetId": "node-accent",
                // 关联动画资源
                "animationId": "animation-fade-accent"
              }
            ]
          },
          {
            "id": "step-2",
            "name": "Show cover",
            // auto 表示自动触发，delayMs 为延迟时间
            "trigger": {
              "type": "auto",
              "delayMs": 400
            },
            "actions": [
              {
                "id": "action-2",
                "type": "show-node",
                "targetId": "node-cover",
                "animationId": "animation-slide-cover"
              }
            ]
          }
        ],

        // 动画资源列表
        "animations": [
          {
            "id": "animation-fade-accent",
            // 当前动画作用的目标节点
            "targetId": "node-accent",
            // MVP 支持 appear / fade / slide-up
            "kind": "fade",
            "durationMs": 300,
            "easing": "ease-out"
          },
          {
            "id": "animation-slide-cover",
            "targetId": "node-cover",
            "kind": "slide-up",
            "durationMs": 450,
            "easing": "ease-out",
            // slide-up 的起始偏移量
            "offsetY": 32
          }
        ]
      }
    }
  ]
}
```

## 字段说明

### `document`

- `version`: schema 版本号
- `meta`: 文档元数据
- `slides`: slide 列表

### `slide`

- `id`: slide 唯一标识
- `name`: slide 名称
- `size`: 画布尺寸
- `background`: 背景配置
- `nodes`: 元素数组，顺序即图层顺序
- `timeline`: 播放时间线

### `node`

所有节点共享以下公共字段：

- `id`: 元素唯一标识
- `type`: 元素类型
- `name`: 元素名称
- `x`, `y`: 位置
- `width`, `height`: 尺寸
- `rotation`: 旋转角度
- `opacity`: 透明度
- `visible`: 初始是否可见
- `locked`: 是否锁定
- `props`: 类型专属属性

各节点类型的 `props`：

- `text`
  - `text`
  - `fontSize`
  - `color`
  - `fontFamily`
  - `fontWeight`
  - `lineHeight`
  - `textAlign`
- `image`
  - `src`
  - `alt`
  - `objectFit`
- `rect`
  - `fill`
  - `stroke`
  - `strokeWidth`
  - `radius`

### `timeline`

- `steps`: 播放步骤
- `animations`: 动画资源

### `step`

- `id`: 步骤 ID
- `name`: 步骤名称
- `trigger.type`
  - `page-click`: 点击页面后触发
  - `auto`: 自动触发
  - `node-click`: 点击指定对象后触发
- `trigger.delayMs`: 自动触发延迟，仅 `auto` 使用
- `trigger.targetId`: 触发对象 ID，仅 `node-click` 使用
- `actions`: 当前步骤动作列表

### `action`

MVP 先支持以下动作：

- `show-node`: 显示一个节点
- `hide-node`: 隐藏一个节点
- `play-animation`: 播放一个动画

### `animation`

- `id`: 动画 ID
- `targetId`: 目标节点 ID
- `kind`: 动画类型
- `durationMs`: 动画时长
- `delayMs`: 动画延迟
- `easing`: 缓动函数
- `offsetX`, `offsetY`: 位移类动画的偏移量

## 与事件层的关系

- UI 层不直接操作底层引擎对象
- UI 层只发出用户意图，例如“新增节点”“调整层级”“选中元素”
- 事件层接收标准命令并更新文档状态
- 渲染适配层把底层引擎事件归一化后回传给事件层

## 当前 MVP 约束

- 仅支持 `text`、`image`、`rect`
- 仅支持 `appear`、`fade`、`slide-up`
- 每个 slide 对应一个独立 canvas
- 暂不包含协同、撤销重做、富文本、组合节点
