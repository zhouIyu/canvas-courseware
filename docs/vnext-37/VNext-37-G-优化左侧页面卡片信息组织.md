# VNext-37-G 优化左侧页面卡片的信息组织

## 优化目标

移除常驻操作提示，优化信息层级，减少页面卡片高度。

## 当前问题

- 页面卡片底部有"双击命名"和"右键更多"的常驻提示
- 这些提示占用空间，且对熟悉操作的用户是视觉噪音
- 页码、标题、统计信息的层级不够清晰
- 页面卡片高度约 140px

## 设计方案

### 1. 移除常驻操作提示

#### 当前结构

```vue
<div class="slide-card">
  <div class="slide-card-header">
    <span class="slide-index">01</span>
    <a-tag v-if="isActive">当前页</a-tag>
    <span class="drag-hint">拖拽排序</span>
  </div>
  
  <div class="slide-thumbnail">
    <!-- 缩略图 -->
  </div>
  
  <div class="slide-meta">
    <strong class="slide-name">课程封面</strong>
    <div class="slide-stats">
      <span>6 个对象</span>
      <span>1 步</span>
    </div>
  </div>
  
  <!-- 常驻提示（移除） -->
  <div class="slide-hints">
    <span>双击命名</span>
    <span>右键更多</span>
  </div>
</div>
```

#### 优化结构

```vue
<template>
  <div 
    class="slide-card" 
    :class="{ 'is-active': isActive, 'is-hovered': isHovered }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @click="handleActivate"
    @dblclick="handleRename"
    @contextmenu.prevent="handleContextMenu"
  >
    <div class="slide-card-header">
      <span class="slide-index">{{ String(index + 1).padStart(2, '0') }}</span>
      <a-tag v-if="isActive" color="blue" size="small">当前页</a-tag>
      <span class="drag-hint">拖拽排序</span>
    </div>
    
    <div class="slide-thumbnail" :style="thumbnailStyle">
      <template v-if="!hasThumbnail">
        <div class="thumbnail-placeholder">
          <icon-file :size="24" />
          <span class="placeholder-text">暂无预览</span>
        </div>
      </template>
    </div>
    
    <div class="slide-meta">
      <strong class="slide-name">{{ slide.name }}</strong>
      <div class="slide-stats">
        <span class="stat-item">{{ nodeCount }} 个对象</span>
        <span class="stat-separator">·</span>
        <span class="stat-item">{{ stepCount }} 步</span>
      </div>
    </div>
    
    <!-- Hover 时显示的操作提示 -->
    <transition name="fade">
      <div v-if="isHovered" class="slide-card-hint">
        <small>双击重命名 · 右键更多操作</small>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.slide-card {
  position: relative;
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

/* Hover 提示 */
.slide-card-hint {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  font-size: 11px;
  border-radius: 4px;
  
  text-align: center;
  pointer-events: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

### 2. 信息层级优化

#### 页码样式

```css
.slide-index {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
  font-variant-numeric: tabular-nums;
}
```

#### 标题样式

```css
.slide-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-1);
  line-height: 1.4;
  
  /* 单行截断 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

#### 统计信息样式

```css
.slide-stats {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--color-text-3);
  margin-top: 4px;
}

.stat-item {
  display: inline;
}

.stat-separator {
  margin: 0 4px;
  color: var(--color-text-4);
}
```

### 3. 缩略图占位优化

#### 当前占位（无缩略图时）

```vue
<div class="slide-thumbnail">
  <span class="thumb-line long" />
  <span class="thumb-line short" />
  <span class="thumb-dots">
    <i />
    <i />
    <i />
  </span>
</div>
```

#### 优化占位

```vue
<template>
  <div class="slide-thumbnail">
    <div class="thumbnail-placeholder">
      <icon-file :size="24" />
      <span class="placeholder-text">暂无预览</span>
    </div>
  </div>
</template>

<style scoped>
.slide-thumbnail {
  height: 64px;
  border-radius: 4px;
  background: var(--color-fill-2);
  margin-bottom: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumbnail-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--color-text-4);
}

.placeholder-text {
  font-size: 11px;
}
</style>
```

### 4. 完整卡片结构

```vue
<template>
  <div 
    class="slide-card" 
    :class="cardClass"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @click="handleActivate"
    @dblclick="handleRename"
    @contextmenu.prevent="handleContextMenu"
  >
    <!-- 头部：页码 + 状态标签 + 拖拽提示 -->
    <div class="slide-card-header">
      <span class="slide-index">{{ formattedIndex }}</span>
      <a-tag v-if="isActive" color="blue" size="small">当前页</a-tag>
      <span class="drag-hint">拖拽排序</span>
    </div>
    
    <!-- 缩略图 -->
    <div class="slide-thumbnail" :style="thumbnailStyle">
      <template v-if="!hasThumbnail">
        <div class="thumbnail-placeholder">
          <icon-file :size="24" />
          <span class="placeholder-text">暂无预览</span>
        </div>
      </template>
    </div>
    
    <!-- 元信息：标题 + 统计 -->
    <div class="slide-meta">
      <strong class="slide-name" :title="slide.name">
        {{ slide.name }}
      </strong>
      <div class="slide-stats">
        <span class="stat-item">{{ nodeCount }} 个对象</span>
        <span class="stat-separator">·</span>
        <span class="stat-item">{{ stepCount }} 步</span>
      </div>
    </div>
    
    <!-- Hover 提示 -->
    <transition name="fade">
      <div v-if="isHovered && !isActive" class="slide-card-hint">
        <small>双击重命名 · 右键更多操作</small>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Slide } from '@canvas-courseware/core';

const props = defineProps<{
  slide: Slide;
  index: number;
  isActive: boolean;
  hasThumbnail: boolean;
  thumbnailStyle: Record<string, string>;
}>();

const emit = defineEmits<{
  activate: [];
  rename: [];
  contextmenu: [event: MouseEvent];
}>();

const isHovered = ref(false);

const formattedIndex = computed(() => 
  String(props.index + 1).padStart(2, '0')
);

const nodeCount = computed(() => 
  props.slide.nodes?.length ?? 0
);

const stepCount = computed(() => 
  props.slide.timeline?.steps?.length ?? 0
);

const cardClass = computed(() => ({
  'is-active': props.isActive,
  'is-hovered': isHovered.value,
}));

const handleMouseEnter = () => {
  isHovered.value = true;
};

const handleMouseLeave = () => {
  isHovered.value = false;
};

const handleActivate = () => {
  emit('activate');
};

const handleRename = () => {
  emit('rename');
};

const handleContextMenu = (event: MouseEvent) => {
  emit('contextmenu', event);
};
</script>

<style scoped>
.slide-card {
  position: relative;
  padding: 12px;
  border-radius: 8px;
  background: var(--color-bg-1);
  border: 1px solid var(--color-border-2);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
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
  font-variant-numeric: tabular-nums;
}

.drag-hint {
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumbnail-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--color-text-4);
}

.placeholder-text {
  font-size: 11px;
}

.slide-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slide-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-1);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slide-stats {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--color-text-3);
}

.stat-separator {
  margin: 0 4px;
  color: var(--color-text-4);
}

.slide-card-hint {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  font-size: 11px;
  border-radius: 4px;
  text-align: center;
  pointer-events: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

### 5. 高度对比

```
当前结构：
┌─────────────────────┐
│ 01  当前页  拖拽排序  │  ← 24px
│ ┌─────────────────┐ │
│ │   [缩略图]      │ │  ← 80px
│ └─────────────────┘ │
│ 课程封面            │  ← 20px
│ 6 个对象  1 步      │  ← 16px
│ 双击命名  右键更多   │  ← 20px (移除)
└─────────────────────┘
总高度：约 140px（含 padding）

优化结构：
┌─────────────────────┐
│ 01  当前页  拖拽排序  │  ← 24px
│ ┌─────────────────┐ │
│ │   [缩略图]      │ │  ← 64px
│ └─────────────────┘ │
│ 课程封面            │  ← 20px
│ 6 个对象 · 1 步     │  ← 16px
└─────────────────────┘
总高度：约 120px（含 padding）

减少：20px
```

## 实施边界

### 修改文件

1. **`packages/vue/src/editor/SlideRailPanel.vue`**
   - 移除底部常驻提示文案
   - 增加 hover 态提示逻辑
   - 优化统计信息分隔符

2. **`packages/vue/src/editor/SlideCard.vue`**（可选，抽离为独立组件）
   - 封装页面卡片逻辑
   - 实现 hover 提示动画
   - 优化缩略图占位

### 保持不变

- 页面卡片交互逻辑
- 双击重命名功能
- 右键菜单功能
- 拖拽排序功能

## 验收标准

1. 页面卡片底部的"双击命名"和"右键更多"常驻提示已移除
2. Hover 时显示操作提示，离开后自动隐藏
3. 统计信息用中点分隔（6 个对象 · 1 步）
4. 页面卡片高度从约 140px 压缩到 120px
5. 缩略图占位显示文件图标 + "暂无预览"文字
6. 页码、标题、统计信息的字号和颜色层级清晰

## 预期效果

- 页面卡片高度减少 20px
- 左侧页面栏可以在同一屏展示更多页面
- 界面更简洁，操作提示按需显示
- 信息层级更清晰
