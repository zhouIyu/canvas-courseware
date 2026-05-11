# VNext-37-H 统一空态与辅助文案的表达方式

## 优化目标

移除技术说明文案，优化空态文案为操作指引，控制文案长度。

## 当前问题

- 编辑器顶部有技术说明："当前壳层只消费标准 snapshot，并把所有操作继续下沉为 controller 命令，保持 UI 与事件层解耦"
- 这类技术文案对用户无意义，占用空间
- 部分空态文案过长或不够友好

## 设计方案

### 1. 移除技术说明文案

#### 当前结构

```vue
<header v-if="showHeader" class="editor-topbar">
  <div class="editor-heading">
    <div class="title-row">
      <h2>{{ title }}</h2>
      <span class="mode-pill">编辑模式</span>
    </div>
    <p class="editor-copy">
      当前壳层只消费标准 snapshot，并把所有操作继续下沉为 controller 命令，保持 UI 与事件层解耦。
    </p>
  </div>
  <!-- ... -->
</header>
```

#### 优化结构

```vue
<header v-if="showHeader" class="editor-topbar">
  <div class="editor-heading">
    <h2>{{ title }}</h2>
    <span class="mode-pill">编辑模式</span>
  </div>
  <!-- ... -->
</header>
```

**高度对比：**

```css
/* 当前 */
.editor-topbar {
  padding: 16px 20px;
  /* 包含标题 + 说明文案，约 80px */
}

/* 优化后 */
.editor-topbar {
  padding: 12px 20px;
  /* 只包含标题，约 56px */
}
```

### 2. 空态文案优化规则

#### 规则 1：移除技术实现细节

```
❌ "当前壳层只消费标准 snapshot..."
✅ 直接移除
```

#### 规则 2：操作指引优先

```
❌ "编辑器新增页面后，这里会自动同步同一份文档内容"
✅ "在编辑模式中创建页面后即可预览"
```

#### 规则 3：控制文案长度

```
❌ 超过 2 行的说明文字
✅ 标题 1 行 + 描述 1-2 行
```

#### 规则 4：避免重复表达

```
❌ "当前页面还没有配置播放步骤。点击新建步骤按钮可以开始配置。"
✅ "当前页面还没有播放步骤<br>点击"新建步骤"开始配置"
```

### 3. 空态文案对照表

| 场景 | 当前文案 | 优化文案 |
|------|---------|---------|
| 编辑器无页面 | 还没有可编辑的页面。编辑器新增页面后，这里会自动同步同一份文档内容。 | 还没有页面<br>点击"新建页面"开始创建 |
| 预览器无页面 | 还没有可预览的页面。编辑器新增页面后，这里会自动同步同一份文档内容。 | 还没有页面<br>在编辑模式中创建页面后即可预览 |
| 时间轴无步骤 | 当前页面还没有配置播放步骤。 | 当前页面还没有播放步骤<br>点击"新建步骤"开始配置 |
| 图层列表无对象 | 当前页面还没有任何对象。 | 当前页面还没有对象<br>从工具栏插入文本、矩形或图片 |
| 属性面板无选中 | 请先选中一个对象。 | 未选中对象<br>点击画布中的对象查看属性 |
| 项目列表为空 | 还没有创建任何项目。 | 还没有项目<br>点击"新建项目"开始创建 |

### 4. 统一空态组件

#### EmptyState 组件

```vue
<template>
  <div class="empty-state">
    <div v-if="$slots.icon || icon" class="empty-state-icon">
      <slot name="icon">
        <component :is="icon" :size="48" />
      </slot>
    </div>
    
    <div class="empty-state-content">
      <strong class="empty-state-title">{{ title }}</strong>
      <p v-if="description" class="empty-state-description">
        {{ description }}
      </p>
      <a-button 
        v-if="actionText" 
        type="primary" 
        @click="$emit('action')"
      >
        {{ actionText }}
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  icon?: Component;
  title: string;
  description?: string;
  actionText?: string;
}>();

defineEmits<{
  action: [];
}>();
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-state-icon {
  font-size: 48px;
  color: var(--color-text-4);
  margin-bottom: 16px;
}

.empty-state-content {
  max-width: 320px;
}

.empty-state-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-2);
  margin-bottom: 8px;
}

.empty-state-description {
  font-size: 13px;
  color: var(--color-text-3);
  line-height: 1.6;
  margin: 0 0 16px 0;
}
</style>
```

#### 使用示例

```vue
<template>
  <!-- 编辑器无页面 -->
  <EmptyState
    :icon="IconFile"
    title="还没有页面"
    description="点击"新建页面"开始创建"
    action-text="新建页面"
    @action="handleCreateSlide"
  />
  
  <!-- 预览器无页面 -->
  <EmptyState
    :icon="IconEye"
    title="还没有页面"
    description="在编辑模式中创建页面后即可预览"
  />
  
  <!-- 时间轴无步骤 -->
  <EmptyState
    :icon="IconPlayCircle"
    title="当前页面还没有播放步骤"
    description="点击"新建步骤"开始配置"
    action-text="新建步骤"
    @action="handleCreateStep"
  />
  
  <!-- 图层列表无对象 -->
  <EmptyState
    :icon="IconLayers"
    title="当前页面还没有对象"
    description="从工具栏插入文本、矩形或图片"
  />
  
  <!-- 属性面板无选中 -->
  <EmptyState
    :icon="IconSettings"
    title="未选中对象"
    description="点击画布中的对象查看属性"
  />
</template>
```

### 5. 提示文案统一 Tone

#### 当前 Tone：技术说明 + 被动描述

```
❌ "还没有可编辑的页面。编辑器新增页面后，这里会自动同步同一份文档内容。"
   → 被动、技术化、冗长
```

#### 优化 Tone：操作引导 + 主动邀请

```
✅ "还没有页面<br>点击"新建页面"开始创建"
   → 主动、友好、简洁
```

#### Tone 对比

| 维度 | 当前 Tone | 优化 Tone |
|------|----------|----------|
| 视角 | 系统视角 | 用户视角 |
| 语态 | 被动描述 | 主动引导 |
| 长度 | 2-3 行 | 1-2 行 |
| 重点 | 解释原理 | 指引操作 |
| 情感 | 中性冷淡 | 友好邀请 |

### 6. 辅助文案简化示例

#### 示例 1：编辑器顶部

```vue
<!-- 当前 -->
<div class="editor-heading">
  <div class="title-row">
    <h2>课件编辑工作台</h2>
    <span class="mode-pill">编辑模式</span>
  </div>
  <p class="editor-copy">
    当前壳层只消费标准 snapshot，并把所有操作继续下沉为 controller 命令，保持 UI 与事件层解耦。
  </p>
</div>

<!-- 优化 -->
<div class="editor-heading">
  <h2>课件编辑工作台</h2>
  <span class="mode-pill">编辑模式</span>
</div>
```

#### 示例 2：预览器空态

```vue
<!-- 当前 -->
<div class="empty-state">
  <strong>还没有可预览的页面</strong>
  <p>编辑器新增页面后，这里会自动同步同一份文档内容。</p>
</div>

<!-- 优化 -->
<EmptyState
  :icon="IconEye"
  title="还没有页面"
  description="在编辑模式中创建页面后即可预览"
/>
```

#### 示例 3：时间轴空态

```vue
<!-- 当前 -->
<div class="empty-state">
  <p>当前页面还没有配置播放步骤。</p>
</div>

<!-- 优化 -->
<EmptyState
  :icon="IconPlayCircle"
  title="当前页面还没有播放步骤"
  description="点击"新建步骤"开始配置"
  action-text="新建步骤"
  @action="handleCreateStep"
/>
```

## 实施边界

### 修改文件

1. **`packages/vue/src/editor/CoursewareEditor.vue`**
   - 移除顶部技术说明文案
   - 调整顶部高度和间距

2. **`packages/vue/src/shared/EmptyState.vue`**（新建）
   - 创建统一空态组件
   - 实现图标、标题、描述、操作按钮布局

3. **`packages/vue/src/editor/EditorCanvasWorkspace.vue`**
   - 替换编辑器空态文案

4. **`packages/vue/src/preview/CoursewarePreview.vue`**
   - 替换预览器空态文案

5. **`packages/vue/src/editor/TimelinePanel.vue`**
   - 替换时间轴空态文案

6. **`packages/vue/src/editor/InspectorPanel.vue`**
   - 替换属性面板空态文案

7. **`apps/playground/src/views/ProjectListPage.vue`**
   - 替换项目列表空态文案

### 保持不变

- 空态判断逻辑
- 操作按钮功能
- 组件交互逻辑

## 验收标准

1. 编辑器顶部的技术说明文案已移除
2. 顶部高度从约 80px 压缩到约 56px
3. 所有空态使用统一的 EmptyState 组件
4. 空态文案控制在标题 1 行 + 描述 1-2 行
5. 空态文案采用操作指引 Tone
6. 空态图标、标题、描述、操作按钮布局统一

## 预期效果

- 编辑器顶部减少 24px
- 空态文案量减少约 30%
- 操作指引更清晰
- 界面更简洁友好
- 用户更容易理解下一步操作
