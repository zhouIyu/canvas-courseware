# VNext-37-F 收紧预览页中央区域的辅助信息

## 优化目标

将画布下方的状态卡片改为画布右上角的浮动 Badge，释放约 120px 垂直空间。

## 当前问题

- 画布下方有大面积的状态卡片区域：
  - 橙色"等待继续"标签 + "第 1/4 页" + "点击页面继续"
  - 白色进度卡片："已完成 0/4 页" + "第 1/4 页 · 课程封面 · 0/1 步" + "下一步：第 1 步 · 展示诗句内容"
- 这些信息占用了约 120px 的垂直空间，压缩了画布显示区域

## 设计方案

### 1. 状态信息收敛到画布右上角

#### 浮动 Badge 组件结构

```vue
<template>
  <div 
    class="preview-status-badge" 
    :class="{ 'is-expanded': isExpanded }"
    @click="toggleExpand"
  >
    <!-- 紧凑态（默认） -->
    <template v-if="!isExpanded">
      <a-tag :color="statusTagColor" size="small">
        {{ playbackStatusLabel }}
      </a-tag>
      <div class="status-summary">
        <span class="page-position">{{ slidePositionLabel }}</span>
        <span class="step-position">{{ stepPositionLabel }}</span>
      </div>
    </template>
    
    <!-- 展开态（点击后） -->
    <template v-else>
      <div class="status-header">
        <a-tag :color="statusTagColor" size="small">
          {{ playbackStatusLabel }}
        </a-tag>
        <a-button 
          class="collapse-button" 
          type="text" 
          size="mini"
          @click.stop="collapse"
        >
          <template #icon><icon-close /></template>
        </a-button>
      </div>
      
      <div class="status-detail">
        <div class="progress-row">
          <span class="progress-label">课件进度</span>
          <strong class="progress-value">{{ coursewareProgressLabel }}</strong>
        </div>
        <div class="progress-row">
          <span class="progress-label">当前页</span>
          <strong class="progress-value">{{ activeSlide?.name }} · {{ stepPositionLabel }}</strong>
        </div>
        <div class="next-hint">
          <span class="hint-label">下一步</span>
          <small class="hint-text">{{ nextStepHint }}</small>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.preview-status-badge {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  
  cursor: pointer;
  transition: all 0.3s ease;
  max-width: 240px;
}

.preview-status-badge:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
}

/* 紧凑态 */
.preview-status-badge:not(.is-expanded) {
  padding: 8px 12px;
}

.status-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-2);
}

.page-position {
  font-weight: 500;
}

.step-position {
  font-size: 12px;
  color: var(--color-text-3);
}

/* 展开态 */
.preview-status-badge.is-expanded {
  padding: 12px;
  cursor: default;
}

.status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.collapse-button {
  width: 20px;
  height: 20px;
  padding: 0;
}

.status-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.progress-label {
  color: var(--color-text-3);
}

.progress-value {
  color: var(--color-text-1);
  font-weight: 500;
}

.next-hint {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-2);
}

.hint-label {
  display: block;
  font-size: 12px;
  color: var(--color-text-3);
  margin-bottom: 4px;
}

.hint-text {
  display: block;
  font-size: 12px;
  color: var(--color-text-2);
  line-height: 1.5;
}
</style>
```

#### 交互逻辑

```typescript
const isExpanded = ref(false);

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

const collapse = () => {
  isExpanded.value = false;
};

// 下一步提示文案
const nextStepHint = computed(() => {
  if (isCoursewareCompleted.value) {
    return '课件已播放完成';
  }
  
  const nextStep = getNextStep();
  if (!nextStep) {
    return '点击页面继续';
  }
  
  return `第 ${nextStep.index + 1} 步 · ${nextStep.name}`;
});
```

### 2. 课件级进度移到右侧步骤栏

#### 右侧步骤栏顶部增加进度摘要

```vue
<template>
  <aside class="preview-timeline-sidebar">
    <!-- 进度摘要区 -->
    <div class="timeline-progress-summary">
      <div class="summary-header">
        <h4>步骤状态</h4>
      </div>
      
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-label">课件进度</span>
          <strong class="stat-value">{{ coursewareProgressLabel }}</strong>
        </div>
        <div class="stat-item">
          <span class="stat-label">当前页</span>
          <strong class="stat-value">{{ slideProgressLabel }}</strong>
        </div>
      </div>
      
      <a-divider :margin="12" />
    </div>
    
    <!-- 步骤列表 -->
    <div class="timeline-step-list">
      <!-- 步骤卡片 -->
    </div>
  </aside>
</template>

<style scoped>
.preview-timeline-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.timeline-progress-summary {
  flex-shrink: 0;
  padding: 12px;
  background: var(--color-bg-1);
}

.summary-header h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
  margin: 0 0 12px 0;
}

.summary-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-3);
}

.stat-value {
  font-size: 13px;
  color: var(--color-text-1);
  font-weight: 500;
}

.timeline-step-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
</style>
```

### 3. 画布区域布局优化

#### 当前结构

```vue
<section class="preview-stage-shell">
  <!-- 画布头部 -->
  <header class="stage-head">
    <!-- 标题、缩放控制等 -->
  </header>
  
  <!-- 状态卡片区（占用约 120px） -->
  <div class="playback-insight-strip">
    <article class="playback-insight-card">
      <!-- 课件进度 -->
    </article>
    <article class="playback-insight-card">
      <!-- 步骤进度 -->
    </article>
    <article class="playback-insight-card">
      <!-- 当前提示 -->
    </article>
  </div>
  
  <!-- 画布区域 -->
  <div class="preview-stage">
    <canvas />
  </div>
</section>
```

#### 优化结构

```vue
<section class="preview-stage-shell">
  <!-- 画布头部 -->
  <header class="stage-head">
    <!-- 标题、缩放控制等 -->
  </header>
  
  <!-- 画布区域（移除状态卡片区） -->
  <div class="preview-stage">
    <div class="preview-stage-viewport">
      <div class="preview-stage-scroll">
        <div class="preview-stage-frame">
          <div class="preview-stage-surface">
            <canvas />
          </div>
        </div>
        
        <!-- 浮动状态 Badge -->
        <PreviewStatusBadge
          :playback-status-label="playbackStatusLabel"
          :slide-position-label="slidePositionLabel"
          :step-position-label="stepPositionLabel"
          :courseware-progress-label="coursewareProgressLabel"
          :active-slide="activeSlide"
          :next-step-hint="nextStepHint"
          :status-tag-color="statusTagColor"
        />
      </div>
    </div>
  </div>
</section>
```

### 4. 高度对比

```
当前布局：
┌─────────────────────────────────┐
│ 画布头部                    56px │
├─────────────────────────────────┤
│ 状态卡片区                 120px │  ← 移除
├─────────────────────────────────┤
│                                 │
│ 画布区域                   524px │
│                                 │
└─────────────────────────────────┘
总高度：700px

优化布局：
┌─────────────────────────────────┐
│ 画布头部                    56px │
├─────────────────────────────────┤
│                    ┌──────────┐ │
│                    │ Badge    │ │  ← 浮动，不占用空间
│                    └──────────┘ │
│ 画布区域                   644px │  ← 增加 120px
│                                 │
│                                 │
└─────────────────────────────────┘
总高度：700px
```

## 实施边界

### 修改文件

1. **`packages/vue/src/preview/CoursewarePreview.vue`**
   - 移除 `.playback-insight-strip` 区域
   - 新增 `PreviewStatusBadge` 组件引用
   - 调整画布区域高度计算

2. **`packages/vue/src/preview/PreviewStatusBadge.vue`**（新建）
   - 实现浮动状态 Badge 组件
   - 实现展开/收起交互
   - 实现状态信息展示

3. **`packages/vue/src/preview/PreviewTimelineSidebar.vue`**
   - 在顶部增加进度摘要区
   - 调整步骤列表布局

### 保持不变

- 播放状态计算
- 进度计算逻辑
- 步骤列表功能
- 画布渲染逻辑

## 验收标准

1. 画布下方的状态卡片区域已移除
2. 状态信息收敛到画布右上角的浮动 Badge
3. Badge 默认显示"等待继续 + 第 1/4 页 + 0/1 步"
4. 点击 Badge 后展开详细进度信息
5. 课件级进度信息移到右侧步骤栏顶部
6. 画布可用高度增加约 120px
7. 浮动 Badge 不遮挡画布核心内容

## 预期效果

- 画布区域释放 120px 垂直空间
- 画布内容更完整
- 状态信息仍然可见，但不抢占主视觉区域
- 用户可按需展开查看详细进度
