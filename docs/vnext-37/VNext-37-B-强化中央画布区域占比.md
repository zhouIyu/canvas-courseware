# VNext-37-B 强化中央画布区域占比

## 优化目标

压缩左右侧栏固定宽度，让中央画布在 1440px 视口下至少占 72% 宽度。

## 当前问题

- 左侧页面栏约 200px，右侧工具区约 280px，在 1440px 视口下中央画布只有约 960px
- 中央画布占比仅 66.7%，视觉权重不够突出
- 左右侧栏占用过多空间，压缩了核心编辑区域

## 设计方案

### 1. 左侧页面栏压缩（200px → 160px）

#### 缩略图尺寸调整

**当前：**
```css
.slide-thumbnail {
  height: 80px;
  aspect-ratio: 16 / 9;
}
```

**优化：**
```css
.slide-thumbnail {
  height: 64px;
  aspect-ratio: 16 / 9;
}
```

#### 页面卡片内边距收紧

**当前：**
```css
.slide-card {
  padding: 16px;
  gap: 12px;
}
```

**优化：**
```css
.slide-card {
  padding: 12px;
  gap: 8px;
}
```

#### 页面卡片完整结构

```vue
<template>
  <div class="slide-card">
    <div class="slide-card-header">
      <span class="slide-index">01</span>
      <a-tag v-if="isActive" color="blue" size="small">当前页</a-tag>
      <span class="slide-drag-hint">拖拽排序</span>
    </div>
    
    <div class="slide-thumbnail" :style="thumbnailStyle">
      <!-- 缩略图内容 -->
    </div>
    
    <div class="slide-meta">
      <strong class="slide-name">{{ slide.name }}</strong>
      <div class="slide-stats">
        <span>{{ nodeCount }} 个对象</span>
        <span class="stat-separator">·</span>
        <span>{{ stepCount }} 步</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-card {
  padding: 12px;
  border-radius: 8px;
  background: var(--color-bg-1);
  border: 1px solid var(--color-border-2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.slide-card:hover {
  border-color: var(--color-border-3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.slide-card.is-active {
  border-color: rgb(var(--primary-6));
  background: rgb(var(--primary-1));
}

.slide-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.slide-index {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
}

.slide-drag-hint {
  font-size: 11px;
  color: var(--color-text-4);
  margin-left: auto;
}

.slide-thumbnail {
  height: 64px;
  border-radius: 4px;
  background: var(--color-fill-2);
  margin-bottom: 8px;
  overflow: hidden;
}

.slide-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slide-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slide-stats {
  font-size: 12px;
  color: var(--color-text-3);
}

.stat-separator {
  margin: 0 4px;
}
</style>
```

### 2. 右侧工具区优化（280px → 240px）

#### 核心图标放大

**当前：**
```vue
<icon-layers :size="16" />
<icon-settings :size="16" />
```

**优化：**
```vue
<a-button class="tool-icon-button" type="text">
  <icon-layers :size="24" />
</a-button>
<a-button class="tool-icon-button" type="text">
  <icon-settings :size="24" />
</a-button>
```

**样式：**
```css
.tool-icon-button {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-icon-button:hover {
  background: var(--color-fill-2);
}
```

#### 右侧管理栏宽度调整

**当前：**
```css
.editor-side {
  width: 280px;
  min-width: 280px;
}
```

**优化：**
```css
.editor-side {
  width: 240px;
  min-width: 240px;
}
```

### 3. 三栏宽度分配

#### CSS 变量定义

```css
:root {
  /* 左侧页面栏 */
  --cw-slide-rail-width: 160px;
  
  /* 右侧管理栏 */
  --cw-editor-side-width: 240px;
  
  /* 中央画布区（自适应） */
  --cw-editor-stage-width: calc(
    100vw - var(--cw-slide-rail-width) - var(--cw-editor-side-width)
  );
}
```

#### 三栏布局结构

```vue
<template>
  <div class="editor-layout" :class="layoutClass">
    <!-- 左侧页面栏 -->
    <aside 
      v-show="!isSlideRailCollapsed" 
      class="slide-rail"
      :style="{ width: 'var(--cw-slide-rail-width)' }"
    >
      <!-- 页面列表 -->
    </aside>
    
    <!-- 中央画布区 -->
    <section class="editor-stage">
      <!-- 画布内容 -->
    </section>
    
    <!-- 右侧管理栏 -->
    <aside 
      v-show="!isEditorSideCollapsed" 
      class="editor-side"
      :style="{ width: 'var(--cw-editor-side-width)' }"
    >
      <!-- 属性面板、时间轴等 -->
    </aside>
  </div>
</template>

<style scoped>
.editor-layout {
  display: flex;
  gap: 12px;
  height: 100%;
}

.slide-rail {
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.editor-stage {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.editor-side {
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 收起态 */
.editor-layout.is-left-collapsed .slide-rail {
  display: none;
}

.editor-layout.is-right-collapsed .editor-side {
  display: none;
}
</style>
```

#### 宽度分配对比

**1440px 视口：**

```
当前：
├─ 左侧页面栏：200px (13.9%)
├─ 中央画布：960px (66.7%)
└─ 右侧工具区：280px (19.4%)

优化后：
├─ 左侧页面栏：160px (11.1%)
├─ 中央画布：1040px (72.2%)
└─ 右侧工具区：240px (16.7%)

提升：中央画布占比 +5.5%，宽度 +80px
```

**1920px 视口：**

```
当前：
├─ 左侧页面栏：200px (10.4%)
├─ 中央画布：1440px (75.0%)
└─ 右侧工具区：280px (14.6%)

优化后：
├─ 左侧页面栏：160px (8.3%)
├─ 中央画布：1520px (79.2%)
└─ 右侧工具区：240px (12.5%)

提升：中央画布占比 +4.2%，宽度 +80px
```

## 实施边界

### 修改文件

1. **`packages/vue/src/editor/CoursewareEditor.css`**
   - 更新三栏宽度 CSS 变量
   - 调整 `.slide-rail` 宽度为 160px
   - 调整 `.editor-side` 宽度为 240px

2. **`packages/vue/src/editor/SlideRailPanel.vue`**
   - 压缩页面卡片内边距
   - 调整缩略图高度为 64px
   - 优化卡片内元素间距

3. **`packages/vue/src/preview/CoursewarePreview.css`**
   - 同步调整预览页的三栏宽度
   - 保持编辑页与预览页布局一致

### 保持不变

- 三栏布局逻辑
- 侧栏收起/展开功能
- 响应式断点规则
- 画布缩放逻辑

## 验收标准

1. 左侧页面栏宽度从 200px 压缩到 160px
2. 右侧工具区宽度从 280px 压缩到 240px
3. 1440px 视口下中央画布宽度达到 1040px
4. 中央画布占比从 66.7% 提升到 72.2%
5. 页面卡片缩略图高度从 80px 压缩到 64px
6. 核心图标从 16px 放大到 24px
7. 三栏布局在不同视口下保持比例协调

## 预期效果

- 中央画布宽度增加 80px
- 画布视觉权重明显提升
- 左右侧栏虽然变窄，但核心操作更清晰
- 整体布局更聚焦于内容编辑
