# VNext-37-C 重构右侧工具区的视觉层级

## 优化目标

放大核心图标、重构缩放控制、统一状态标签样式，提升右侧工具区的操作清晰度。

## 当前问题

- 图层、设置等核心图标过小（约 16px），不够突出
- 缩放控制是纯文字链接（"缩小 适配 100% 放大"），不够清晰
- 状态标签（"微图"、"适配 100%"）样式不统一

## 设计方案

### 1. 核心图标放大

#### 图标按钮规范

```vue
<template>
  <div class="editor-stage-toolbar">
    <!-- 图层浮层入口 -->
    <a-button 
      class="tool-icon-button" 
      type="text"
      @click="toggleLayerPanel"
    >
      <template #icon>
        <icon-layers :size="24" />
      </template>
    </a-button>
    
    <!-- 页面设置入口 -->
    <a-button 
      class="tool-icon-button" 
      type="text"
      @click="openSlideSettings"
    >
      <template #icon>
        <icon-settings :size="24" />
      </template>
    </a-button>
  </div>
</template>

<style scoped>
.editor-stage-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-icon-button {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.tool-icon-button:hover {
  background: var(--color-fill-2);
}

.tool-icon-button:active {
  background: var(--color-fill-3);
}

.tool-icon-button.is-active {
  background: rgb(var(--primary-1));
  color: rgb(var(--primary-6));
}
</style>
```

### 2. 缩放控制重构

#### 当前结构

```vue
<!-- 纯文字链接 -->
<div class="zoom-controls">
  <a @click="zoomOut">缩小</a>
  <span>适配 100%</span>
  <a @click="zoomIn">放大</a>
  <a @click="zoomToFit">适配</a>
  <a @click="zoomToActualSize">100%</a>
</div>
```

#### 优化结构

```vue
<template>
  <div class="stage-viewport-controls">
    <!-- 缩小按钮 -->
    <a-button 
      size="small" 
      :disabled="!canZoomOut"
      @click="zoomOut"
    >
      <template #icon>
        <icon-minus />
      </template>
    </a-button>
    
    <!-- 当前缩放比例 -->
    <a-tag 
      class="zoom-level-tag" 
      color="arcoblue"
      bordered
    >
      {{ zoomLabel }}
    </a-tag>
    
    <!-- 放大按钮 -->
    <a-button 
      size="small" 
      :disabled="!canZoomIn"
      @click="zoomIn"
    >
      <template #icon>
        <icon-plus />
      </template>
    </a-button>
    
    <!-- 恢复 100% -->
    <a-button 
      size="small" 
      :type="isActualSizeZoom ? 'primary' : 'default'"
      @click="zoomToActualSize"
    >
      100%
    </a-button>
    
    <!-- 适配画布 -->
    <a-button 
      size="small" 
      :type="isFitZoom ? 'primary' : 'default'"
      @click="zoomToFit"
    >
      <template #icon>
        <icon-fullscreen />
      </template>
    </a-button>
  </div>
</template>

<style scoped>
.stage-viewport-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.zoom-level-tag {
  min-width: 72px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  cursor: default;
  user-select: none;
}
</style>
```

#### 缩放标签显示逻辑

```typescript
const zoomLabel = computed(() => {
  if (isFitZoom.value) {
    return `适配 ${scalePercent.value}%`;
  }
  return `${scalePercent.value}%`;
});
```

### 3. 状态标签统一

#### 标签类型定义

```typescript
// 主状态标签（编辑模式、播放状态）
type PrimaryStatusTag = {
  color: 'blue' | 'green' | 'orange';
  text: string;
};

// 位置信息标签（第 1/4 页）
type PositionTag = {
  color: 'default';
  text: string;
};

// 缩放信息标签（适配 62%）
type ZoomTag = {
  color: 'arcoblue';
  text: string;
};
```

#### 统一使用 Arco Tag

```vue
<template>
  <div class="status-badges">
    <!-- 主状态 -->
    <a-tag color="blue" bordered>
      编辑模式
    </a-tag>
    
    <!-- 位置信息 -->
    <a-tag bordered>
      第 1/4 页
    </a-tag>
    
    <!-- 缩放信息 -->
    <a-tag color="arcoblue" bordered>
      适配 62%
    </a-tag>
  </div>
</template>

<style scoped>
.status-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
```

#### 标签颜色规范

| 标签类型 | Arco Color | 使用场景 |
|---------|-----------|---------|
| 主状态 | `blue` | 编辑模式、预览模式 |
| 播放状态 | `green` | 播放中 |
| 等待状态 | `orange` | 等待继续 |
| 位置信息 | `default` (灰色) | 第 1/4 页、0/1 步 |
| 缩放信息 | `arcoblue` | 适配 62%、100% |
| 错误状态 | `red` | 保存失败、加载失败 |

### 4. 完整工具区布局

```vue
<template>
  <div class="editor-stage-header">
    <!-- 左侧：核心工具 -->
    <div class="stage-header-left">
      <a-button class="tool-icon-button" type="text">
        <template #icon>
          <icon-layers :size="24" />
        </template>
      </a-button>
      <a-button class="tool-icon-button" type="text">
        <template #icon>
          <icon-settings :size="24" />
        </template>
      </a-button>
    </div>
    
    <!-- 中间：缩放控制 -->
    <div class="stage-header-center">
      <div class="stage-viewport-controls">
        <a-button size="small" :disabled="!canZoomOut" @click="zoomOut">
          <template #icon><icon-minus /></template>
        </a-button>
        <a-tag color="arcoblue" bordered>{{ zoomLabel }}</a-tag>
        <a-button size="small" :disabled="!canZoomIn" @click="zoomIn">
          <template #icon><icon-plus /></template>
        </a-button>
        <a-button size="small" :type="isActualSizeZoom ? 'primary' : 'default'" @click="zoomToActualSize">
          100%
        </a-button>
        <a-button size="small" :type="isFitZoom ? 'primary' : 'default'" @click="zoomToFit">
          <template #icon><icon-fullscreen /></template>
        </a-button>
      </div>
    </div>
    
    <!-- 右侧：状态标签 -->
    <div class="stage-header-right">
      <div class="status-badges">
        <a-tag color="blue" bordered>编辑模式</a-tag>
        <a-tag bordered>第 1/4 页</a-tag>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-stage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--color-bg-1);
  border-bottom: 1px solid var(--color-border-2);
}

.stage-header-left,
.stage-header-center,
.stage-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage-header-center {
  flex: 1;
  justify-content: center;
}
</style>
```

## 实施边界

### 修改文件

1. **`packages/vue/src/shared/StageViewportControls.vue`**
   - 重构缩放控制为按钮组
   - 使用 Arco Button 和 Tag 组件
   - 增加图标支持

2. **`packages/vue/src/editor/EditorCanvasWorkspace.vue`**
   - 放大核心工具图标到 24px
   - 统一图标按钮样式
   - 调整工具栏布局

3. **`packages/vue/src/preview/CoursewarePreview.vue`**
   - 同步优化预览页的工具区
   - 统一状态标签样式

### 保持不变

- 缩放逻辑
- 工具功能
- 状态计算
- 事件处理

## 验收标准

1. 核心图标从 16px 放大到 24px
2. 图标按钮可点击区域为 32x32
3. 缩放控制改为按钮组，包含 [−] [适配 62%] [+] [100%] [⊡]
4. 所有状态标签使用 Arco Tag 组件
5. 主状态用蓝色、位置信息用灰色、缩放信息用浅蓝色
6. 工具区布局清晰，左中右三区分明

## 预期效果

- 核心操作更容易点击
- 缩放控制更直观
- 状态标签风格统一
- 整体视觉层级更清晰
