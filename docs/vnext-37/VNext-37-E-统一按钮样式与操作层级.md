# VNext-37-E 统一按钮样式与操作层级

## 优化目标

重构预览页顶部操作按钮布局，按主次层级分组，突出主操作。

## 当前问题

- 预览页顶部操作按钮过多：上一页、上一步、重播当前页、下一页、重新开始课件、沉浸播放、播放下一步（7 个）
- 所有按钮视觉权重相同，无法快速识别主操作
- 按钮平铺排列，占用 2 行空间

## 设计方案

### 1. 按钮层级划分

#### 主操作（1 个）

```vue
<a-button type="primary" size="large" @click="playNextStep">
  播放下一步
</a-button>
```

**特征：**
- 蓝色填充按钮（Primary）
- 尺寸：Large
- 位置：最右侧

#### 次要操作（4 个）

```vue
<a-button-group>
  <a-button @click="activatePreviousSlide">
    <template #icon><icon-left /></template>
    上一页
  </a-button>
  <a-button @click="stepBackward">
    <template #icon><icon-arrow-left /></template>
    上一步
  </a-button>
  <a-button @click="replayCurrentSlide">
    <template #icon><icon-refresh /></template>
    重播
  </a-button>
  <a-button @click="activateNextSlide">
    <template #icon><icon-right /></template>
    下一页
  </a-button>
</a-button-group>
```

**特征：**
- Ghost 按钮（无背景，仅边框）
- 尺寸：Default
- 位置：中间区域
- 使用 ButtonGroup 组合

#### 低频操作（2 个）

```vue
<a-dropdown @select="handleMoreAction">
  <a-button>
    更多
    <template #icon><icon-down /></template>
  </a-button>
  <template #content>
    <a-doption value="restart">
      <template #icon><icon-refresh /></template>
      重新开始课件
    </a-doption>
    <a-doption value="immersive">
      <template #icon><icon-fullscreen /></template>
      沉浸播放 (F)
    </a-doption>
    <a-divider :margin="4" />
    <a-doption value="shortcuts">
      <template #icon><icon-keyboard /></template>
      键盘快捷键说明
    </a-doption>
  </template>
</a-dropdown>
```

**特征：**
- 收敛到"更多"下拉菜单
- 位置：次要操作右侧

### 2. 布局重构

#### 当前布局（平铺）

```vue
<div class="preview-playback-controls">
  <a-button>上一页</a-button>
  <a-button>上一步</a-button>
  <a-button>重播当前页</a-button>
  <a-button>下一页</a-button>
  <a-button>重新开始课件</a-button>
  <a-button>沉浸播放</a-button>
  <a-button type="primary">播放下一步</a-button>
</div>
```

#### 优化布局（分组）

```vue
<template>
  <div class="preview-playback-controls">
    <!-- 左侧：页面/步骤导航 -->
    <div class="playback-navigation">
      <a-button-group>
        <a-button 
          :disabled="!canActivatePreviousSlide"
          @click="activatePreviousSlide"
        >
          <template #icon><icon-left /></template>
          上一页
        </a-button>
        <a-button 
          :disabled="!canStepBackward"
          @click="stepBackward"
        >
          <template #icon><icon-arrow-left /></template>
          上一步
        </a-button>
        <a-button 
          :disabled="!hasActiveSlide"
          @click="replayCurrentSlide"
        >
          <template #icon><icon-refresh /></template>
          重播
        </a-button>
        <a-button 
          :disabled="!canActivateNextSlide"
          @click="activateNextSlide"
        >
          <template #icon><icon-right /></template>
          下一页
        </a-button>
      </a-button-group>
    </div>
    
    <!-- 分隔线 -->
    <a-divider direction="vertical" />
    
    <!-- 右侧：更多操作 + 主操作 -->
    <div class="playback-primary-actions">
      <a-dropdown @select="handleMoreAction">
        <a-button>
          更多
          <template #icon><icon-down /></template>
        </a-button>
        <template #content>
          <a-doption value="restart">
            <template #icon><icon-refresh /></template>
            重新开始课件
          </a-doption>
          <a-doption value="immersive">
            <template #icon><icon-fullscreen /></template>
            沉浸播放 (F)
          </a-doption>
          <a-divider :margin="4" />
          <a-doption value="shortcuts">
            <template #icon><icon-keyboard /></template>
            键盘快捷键说明
          </a-doption>
        </template>
      </a-dropdown>
      
      <a-button 
        type="primary" 
        size="large"
        :disabled="!canPlayNextStep && !isCoursewareCompleted"
        @click="playNextStep"
      >
        {{ isCoursewareCompleted ? '已完成' : '播放下一步' }}
      </a-button>
    </div>
  </div>
</template>

<style scoped>
.preview-playback-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--color-bg-1);
  border-bottom: 1px solid var(--color-border-2);
}

.playback-navigation {
  flex: 1;
}

.playback-primary-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
```

### 3. 视图控制与播放控制分离

#### 完整顶部布局

```vue
<template>
  <header class="preview-topbar">
    <div class="topbar-content">
      <!-- 左侧：视图控制 -->
      <div class="topbar-left">
        <div class="stage-viewport-controls">
          <a-button size="small" :disabled="!canZoomOut" @click="zoomOut">
            <template #icon><icon-minus /></template>
          </a-button>
          <a-tag color="arcoblue" bordered>{{ zoomLabel }}</a-tag>
          <a-button size="small" :disabled="!canZoomIn" @click="zoomIn">
            <template #icon><icon-plus /></template>
          </a-button>
          <a-button size="small" @click="zoomToActualSize">100%</a-button>
          <a-button size="small" @click="zoomToFit">
            <template #icon><icon-fullscreen /></template>
          </a-button>
        </div>
      </div>
      
      <!-- 分隔线 -->
      <a-divider direction="vertical" />
      
      <!-- 右侧：播放控制 -->
      <div class="topbar-right">
        <div class="preview-playback-controls">
          <!-- 播放控制按钮组 -->
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.preview-topbar {
  background: var(--color-bg-1);
  border-bottom: 1px solid var(--color-border-2);
}

.topbar-content {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 16px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-right {
  flex: 1;
  display: flex;
  justify-content: flex-end;
}
</style>
```

### 4. 按钮状态管理

```typescript
// 主操作按钮文案
const primaryActionLabel = computed(() => {
  if (isCoursewareCompleted.value) {
    return '已完成';
  }
  return '播放下一步';
});

// 主操作按钮禁用状态
const isPrimaryActionDisabled = computed(() => {
  return !canPlayNextStep.value && !isCoursewareCompleted.value;
});

// 更多操作菜单处理
const handleMoreAction = (value: string) => {
  switch (value) {
    case 'restart':
      emit('restart-courseware');
      break;
    case 'immersive':
      emit('toggle-immersive-playback');
      break;
    case 'shortcuts':
      showShortcutsModal();
      break;
  }
};
```

## 实施边界

### 修改文件

1. **`packages/vue/src/preview/PreviewPlaybackControls.vue`**
   - 重构按钮布局为分组结构
   - 引入 Arco ButtonGroup 和 Dropdown 组件
   - 调整按钮样式和尺寸

2. **`packages/vue/src/preview/CoursewarePreview.vue`**
   - 调整顶部布局，分离视图控制和播放控制
   - 优化顶部高度和间距

### 保持不变

- 播放控制逻辑
- 键盘快捷键
- 状态计算
- 事件处理

## 验收标准

1. 主操作（播放下一步）使用蓝色填充按钮，尺寸为 Large
2. 次要操作（上一页/上一步/重播/下一页）使用 Ghost 按钮，组合为 ButtonGroup
3. 低频操作（重新开始课件/沉浸播放）收敛到"更多"下拉菜单
4. 视图控制（缩放）与播放控制用分隔线区分
5. 顶部操作区从 2 行压缩到 1 行
6. 主操作在视觉上明显突出

## 预期效果

- 主操作更容易识别和点击
- 次要操作分组清晰
- 低频操作不占用首屏空间
- 顶部区域更紧凑
- 操作层级一目了然
