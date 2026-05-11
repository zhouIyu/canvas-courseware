# VNext-37-D 简化时间轴面板的信息密度

## 优化目标

重构步骤卡片信息层级，收敛操作按钮到下拉菜单，降低时间轴面板的视觉复杂度。

## 当前问题

- 步骤卡片内信息平铺：步骤 01、展示诗句内容、页面点击、显示对象、名称、触发等
- 操作按钮过多：收起、上移、下移、后插一步、复制、从此预览、删除（7 个）
- 缺少视觉分组，难以快速扫描
- 步骤卡片高度约 180px，占用空间过大

## 设计方案

### 1. 步骤卡片信息重构

#### 当前结构

```vue
<div class="timeline-step-card">
  <div class="step-header">
    <span>步骤 01</span>
    <a-button @click="collapse">收起</a-button>
    <a-button @click="moveUp">上移</a-button>
  </div>
  <div class="step-title">展示诗句内容</div>
  <div class="step-trigger">
    <a-tag>页面点击</a-tag>
  </div>
  <div class="step-actions">
    <div class="action-item">
      <span>显示对象 · Poem Body · 淡入</span>
    </div>
  </div>
  <div class="step-meta">
    <span>名称：展示诗句内容</span>
    <span>触发：页面点击</span>
  </div>
  <div class="step-operations">
    <a-button @click="moveDown">下移</a-button>
    <a-button @click="insertAfter">后插一步</a-button>
    <a-button @click="duplicate">复制</a-button>
    <a-button @click="preview">从此预览</a-button>
    <a-button @click="remove">删除</a-button>
  </div>
</div>
```

#### 优化结构（折叠态）

```vue
<template>
  <div class="timeline-step-card" :class="{ 'is-expanded': isExpanded }">
    <!-- 第一行：步骤序号 + 名称 + 折叠按钮 + 预览按钮 -->
    <div class="step-header">
      <span class="step-index">步骤 {{ stepIndex + 1 }}</span>
      <span class="step-name">{{ step.name || '未命名步骤' }}</span>
      
      <div class="step-header-actions">
        <a-button 
          class="step-action-button" 
          type="text" 
          size="mini"
          @click="toggleExpand"
        >
          <template #icon>
            <icon-down v-if="!isExpanded" />
            <icon-up v-else />
          </template>
        </a-button>
        
        <a-button 
          class="step-action-button" 
          type="text" 
          size="mini"
          @click="previewFromStep"
        >
          <template #icon>
            <icon-play-arrow />
          </template>
        </a-button>
        
        <a-dropdown @select="handleMenuSelect">
          <a-button class="step-action-button" type="text" size="mini">
            <template #icon>
              <icon-more-vertical />
            </template>
          </a-button>
          <template #content>
            <a-doption value="move-up">
              <template #icon><icon-arrow-up /></template>
              上移
            </a-doption>
            <a-doption value="move-down">
              <template #icon><icon-arrow-down /></template>
              下移
            </a-doption>
            <a-doption value="insert-after">
              <template #icon><icon-plus /></template>
              后插一步
            </a-doption>
            <a-doption value="duplicate">
              <template #icon><icon-copy /></template>
              复制
            </a-doption>
            <a-divider :margin="4" />
            <a-doption value="delete" class="danger-option">
              <template #icon><icon-delete /></template>
              删除
            </a-doption>
          </template>
        </a-dropdown>
      </div>
    </div>
    
    <!-- 第二行：触发方式摘要 + 动作数量 -->
    <div class="step-summary">
      <span class="step-trigger-summary">{{ triggerSummary }}</span>
      <span class="step-action-count">{{ actionCount }} 个动作</span>
    </div>
    
    <!-- 展开后显示动作详情 -->
    <div v-if="isExpanded" class="step-actions">
      <div 
        v-for="(action, index) in step.actions" 
        :key="index"
        class="action-card"
      >
        <div class="action-header">
          <span class="action-label">动作 {{ index + 1 }}</span>
        </div>
        <div class="action-body">
          <span class="action-target">{{ action.targetName }}</span>
          <span class="action-separator">·</span>
          <span class="action-type">{{ action.type }}</span>
        </div>
        <div class="action-meta">
          <span>延迟 {{ action.delay }}ms</span>
          <span class="action-separator">·</span>
          <span>时长 {{ action.duration }}ms</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-step-card {
  padding: 12px;
  border: 1px solid var(--color-border-2);
  border-radius: 8px;
  background: var(--color-bg-1);
  transition: all 0.2s ease;
}

.timeline-step-card:hover {
  border-color: var(--color-border-3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* 第一行：步骤头部 */
.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.step-index {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-2);
}

.step-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.step-action-button {
  width: 24px;
  height: 24px;
  padding: 0;
}

/* 第二行：触发摘要 */
.step-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-3);
}

.step-trigger-summary {
  flex: 1;
}

.step-action-count {
  color: var(--color-text-4);
}

/* 展开后的动作详情 */
.step-actions {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-card {
  padding: 10px;
  border-left: 3px solid rgb(var(--primary-6));
  background: var(--color-fill-2);
  border-radius: 4px;
}

.action-header {
  margin-bottom: 6px;
}

.action-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-2);
}

.action-body {
  font-size: 13px;
  color: var(--color-text-1);
  margin-bottom: 4px;
}

.action-target {
  font-weight: 500;
}

.action-separator {
  margin: 0 4px;
  color: var(--color-text-4);
}

.action-meta {
  font-size: 12px;
  color: var(--color-text-3);
}

/* 下拉菜单危险项 */
.danger-option {
  color: rgb(var(--red-6));
}
</style>
```

### 2. 触发方式摘要生成

```typescript
const triggerSummary = computed(() => {
  const trigger = step.trigger;
  
  switch (trigger.type) {
    case 'page-click':
      return '页面点击';
    case 'auto':
      return `自动触发（${trigger.delay}ms 后）`;
    case 'node-click':
      return `点击 ${trigger.targetName || '对象'}`;
    default:
      return '未设置触发';
  }
});

const actionCount = computed(() => {
  return step.actions?.length ?? 0;
});
```

### 3. 操作按钮收敛规则

#### 常驻操作（2 个）

```vue
<!-- 折叠/展开 -->
<a-button type="text" size="mini" @click="toggleExpand">
  <template #icon>
    <icon-down v-if="!isExpanded" />
    <icon-up v-else />
  </template>
</a-button>

<!-- 预览 -->
<a-button type="text" size="mini" @click="previewFromStep">
  <template #icon>
    <icon-play-arrow />
  </template>
</a-button>
```

#### 下拉菜单操作（5 个）

```vue
<a-dropdown @select="handleMenuSelect">
  <a-button type="text" size="mini">
    <template #icon>
      <icon-more-vertical />
    </template>
  </a-button>
  <template #content>
    <a-doption value="move-up">上移</a-doption>
    <a-doption value="move-down">下移</a-doption>
    <a-doption value="insert-after">后插一步</a-doption>
    <a-doption value="duplicate">复制</a-doption>
    <a-divider :margin="4" />
    <a-doption value="delete" class="danger-option">删除</a-doption>
  </template>
</a-dropdown>
```

#### 菜单操作处理

```typescript
const handleMenuSelect = (value: string) => {
  switch (value) {
    case 'move-up':
      emit('reorder-step', { stepId: step.id, direction: 'up' });
      break;
    case 'move-down':
      emit('reorder-step', { stepId: step.id, direction: 'down' });
      break;
    case 'insert-after':
      emit('insert-step-after', step.id);
      break;
    case 'duplicate':
      emit('duplicate-step', step.id);
      break;
    case 'delete':
      emit('remove-step', step.id);
      break;
  }
};
```

### 4. 高度对比

```
折叠态：
┌─────────────────────────────────┐
│ 步骤 01 · 展示诗句内容    [▼] [▶] [⋮] │  ← 32px
│ 页面点击 → 1 个动作              │  ← 20px
└─────────────────────────────────┘
总高度：约 64px（含 padding）

展开态：
┌─────────────────────────────────┐
│ 步骤 01 · 展示诗句内容    [▲] [▶] [⋮] │  ← 32px
│ 页面点击 → 1 个动作              │  ← 20px
│ ┌─ 动作 1 ─────────────────┐   │
│ │ Poem Body · 淡入         │   │  ← 60px
│ │ 延迟 0ms · 时长 300ms    │   │
│ └──────────────────────────┘   │
└─────────────────────────────────┘
总高度：约 124px（含 padding）

当前态（未优化）：
总高度：约 180px
```

## 实施边界

### 修改文件

1. **`packages/vue/src/editor/TimelinePanel.vue`**
   - 重构步骤卡片结构
   - 引入 Arco Dropdown 组件
   - 实现折叠/展开逻辑

2. **`packages/vue/src/editor/TimelineStepCard.vue`**（新建）
   - 抽离步骤卡片为独立组件
   - 封装触发摘要生成逻辑
   - 封装菜单操作处理

### 保持不变

- 时间轴数据模型
- 步骤操作命令
- 折叠态持久化逻辑
- 预览跳转功能

## 验收标准

1. 步骤卡片折叠态高度从 180px 压缩到 64px
2. 操作按钮从 7 个平铺收敛为 2 个常驻 + 1 个下拉菜单
3. 第一行显示"步骤序号 + 名称 + 折叠按钮 + 预览按钮 + 更多操作"
4. 第二行显示"触发方式摘要 + 动作数量"
5. 展开后才显示动作详情卡片
6. 下拉菜单包含上移/下移/后插一步/复制/删除
7. 删除操作显示为红色文字

## 预期效果

- 时间轴面板可以在同一屏展示更多步骤
- 步骤信息层级更清晰
- 操作按钮不再抢占视觉空间
- 折叠态下信息密度降低约 60%
