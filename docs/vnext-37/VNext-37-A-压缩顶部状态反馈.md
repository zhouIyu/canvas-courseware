# VNext-37-A 压缩顶部状态反馈的视觉权重

## 优化目标

将当前绿色横幅保存提示改为轻量 Toast 或顶栏状态图标，释放画布垂直空间。

## 当前问题

- 绿色横幅提示"项目已保存，1 个本地图片资源已本地化后加载"持续占据顶部，抢占画布空间
- 用户在编辑过程中不需要持续看到保存成功的反馈
- 顶部区域高度约 80px，压缩了中央画布可用空间

## 设计方案

### 1. 保存状态收敛到顶栏右侧

**位置：** 顶栏右上角增加状态图标区域

**状态展示：**

```vue
<!-- 保存成功 -->
<div class="save-status-indicator success">
  <icon-check-circle-fill :style="{ color: 'rgb(var(--green-6))' }" />
  <span class="status-text">已保存</span>
</div>

<!-- 保存中 -->
<div class="save-status-indicator saving">
  <icon-loading />
  <span class="status-text">保存中</span>
</div>

<!-- 保存失败 -->
<div class="save-status-indicator error">
  <icon-exclamation-circle-fill :style="{ color: 'rgb(var(--red-6))' }" />
  <span class="status-text">保存失败</span>
</div>
```

**交互规则：**
- 保存成功：显示绿色勾选图标 + "已保存" 文字，3 秒后淡出文字，只保留图标
- 保存中：显示旋转加载图标 + "保存中"
- 保存失败：显示红色警告图标 + "保存失败"，点击展开详情

**样式规范：**

```css
.save-status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  transition: all 0.3s ease;
}

.save-status-indicator.success {
  background: rgb(var(--green-1));
}

.save-status-indicator.saving {
  background: rgb(var(--blue-1));
}

.save-status-indicator.error {
  background: rgb(var(--red-1));
  cursor: pointer;
}

.save-status-indicator .status-text {
  animation: fadeOut 0.3s ease 3s forwards;
}

@keyframes fadeOut {
  to {
    opacity: 0;
    width: 0;
    margin: 0;
  }
}
```

### 2. 资源加载警告改为轻量 Toast

**使用 Arco Design 的 Message 组件：**

```typescript
import { Message } from '@arco-design/web-vue';

// 资源加载成功
Message.success({
  content: '项目已保存，1 个本地图片资源已本地化后加载',
  duration: 3000,
});

// 资源加载警告
Message.warning({
  content: '部分资源加载失败，请检查网络连接',
  duration: 5000,
  closable: true,
});

// 资源加载失败
Message.error({
  content: '资源加载失败，请重试',
  duration: 5000,
  closable: true,
});
```

**配置位置：**

```typescript
// 在 App.vue 或主入口配置全局 Message 位置
Message.config({
  top: '64px', // 距离顶部 64px，避免遮挡顶栏
  duration: 3000,
  maxCount: 3, // 最多同时显示 3 条
});
```

### 3. 顶部区域高度优化

**当前结构：**

```vue
<header class="workspace-topbar">
  <!-- 绿色横幅提示 -->
  <div class="save-notification-banner">
    项目已保存，1 个本地图片资源已本地化后加载
  </div>
  
  <!-- 顶栏内容 -->
  <div class="topbar-content">
    <!-- ... -->
  </div>
</header>
```

**优化结构：**

```vue
<header class="workspace-topbar">
  <div class="topbar-content">
    <div class="topbar-left">
      <!-- 返回按钮、项目标题等 -->
    </div>
    
    <div class="topbar-right">
      <!-- 保存状态指示器 -->
      <div class="save-status-indicator">
        <icon-check-circle-fill />
        <span class="status-text">已保存</span>
      </div>
      
      <!-- 其他操作按钮 -->
    </div>
  </div>
</header>
```

**高度对比：**

```css
/* 当前 */
.workspace-topbar {
  height: auto; /* 约 80px，包含横幅 */
}

/* 优化后 */
.workspace-topbar {
  height: 56px; /* 固定高度 */
}
```

## 实施边界

### 修改文件

1. **`apps/playground/src/workspace/WorkspaceTopbar.vue`**
   - 移除绿色横幅提示区域
   - 在右上角增加保存状态指示器
   - 调整顶栏高度为固定 56px

2. **`apps/playground/src/workspace/useProjectWorkspacePersistence.ts`**
   - 保存成功后调用 Message.success() 而不是更新横幅状态
   - 资源加载警告调用 Message.warning()
   - 保存失败调用 Message.error()

3. **`apps/playground/src/App.vue`**
   - 配置全局 Message 组件位置和样式

### 保持不变

- 自动保存逻辑
- 保存触发时机
- 资源加载流程
- 诊断日志记录

## 验收标准

1. 顶部横幅提示已移除
2. 保存状态在顶栏右上角显示，3 秒后文字淡出
3. 资源加载警告以 Toast 形式展示，3 秒后自动消失
4. 顶部区域高度从约 80px 压缩到 56px
5. 中央画布可用高度增加约 24px
6. 保存失败时点击状态图标可展开详情

## 预期效果

- 顶部区域减少 24px
- 画布可用空间增加
- 状态反馈更轻量，不抢占注意力
- 用户体验更简洁
