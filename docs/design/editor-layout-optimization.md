# 编辑器布局优化方案

## 文档信息
- **创建日期**: 2026-05-11
- **文档类型**: 设计方案
- **目标版本**: VNext-37
- **状态**: 待评审

---

## 一、问题背景

### 1.1 当前问题
编辑器采用三栏固定布局：
- 左侧时间轴面板：固定 280px
- 中央画布区域：flex-grow 自适应
- 右侧设置面板：固定 360px

**存在的问题**：
1. 右侧固定 360px 在中小屏幕上占用过多空间
2. 设置面板内容拥挤，表单控件、下拉框显示不佳
3. 中央画布可用空间被压缩，影响编辑体验
4. 布局缺乏弹性，无法根据屏幕尺寸自适应

### 1.2 用户反馈
- "编辑模式的右侧太窄了，都挤在一起了"
- 设置面板中的表单控件、下拉选择器显示局促

---

## 二、优化目标

### 2.1 核心目标
1. **释放画布空间**：移除固定右侧栏，让中央画布获得更多编辑空间
2. **改善设置体验**：通过浮动抽屉提供更宽敞的设置界面
3. **提升交互流畅度**：按需显示设置面板，减少视觉干扰
4. **保持功能完整性**：所有现有设置功能不减少

### 2.2 非功能目标
- 响应式适配：支持不同屏幕尺寸
- 动画流畅：抽屉打开/关闭有平滑过渡
- 键盘友好：支持 ESC 关闭抽屉

---

## 三、解决方案

### 3.1 方案概述
**采用"浮动抽屉"模式替代固定右侧栏**

- 移除 `CoursewareEditor.vue` 中的固定右侧 `<aside>` 区域
- 在时间轴步骤卡片上添加"设置"入口按钮
- 点击后从右侧滑入浮动抽屉，展示步骤设置面板
- 抽屉带半透明遮罩层，点击遮罩或 ESC 键可关闭

### 3.2 布局变化对比

#### 当前布局
```
┌─────────────────────────────────────────────────┐
│  顶栏（工具栏）                                    │
├──────────┬─────────────────────┬─────────────────┤
│          │                     │                 │
│  时间轴  │    中央画布区域      │   右侧设置面板   │
│  280px   │    flex-grow        │     360px       │
│          │                     │                 │
└──────────┴─────────────────────┴─────────────────┘
```

#### 优化后布局
```
┌─────────────────────────────────────────────────┐
│  顶栏（工具栏）                                    │
├──────────┬─────────────────────────────────────┤
│          │                                     │
│  时间轴  │         中央画布区域（扩展）          │
│  280px   │         flex-grow                   │
│          │                                     │
└──────────┴─────────────────────────────────────┘

点击步骤卡片"设置"按钮后：
┌─────────────────────────────────────────────────┐
│  顶栏（工具栏）                                    │
├──────────┬──────────────────┬──────────────────┤
│          │                  │ ┌──────────────┐ │
│  时间轴  │   中央画布区域    │ │  浮动抽屉    │ │
│  280px   │   (半透明遮罩)   │ │  400px       │ │
│          │                  │ │  步骤设置    │ │
└──────────┴──────────────────┴─┴──────────────┴─┘
```

### 3.3 交互流程

#### 3.3.1 打开设置抽屉
1. 用户在时间轴面板中点击某个步骤卡片的"设置"按钮
2. 触发事件：`openStepSettings(stepId)`
3. 系统行为：
   - 记录当前选中的步骤 ID
   - 显示半透明遮罩层（z-index: 1000）
   - 从右侧滑入抽屉面板（z-index: 1001，宽度 400px）
   - 加载该步骤的设置内容
4. 动画效果：抽屉从右侧滑入，耗时 300ms，使用 ease-out 缓动

#### 3.3.2 关闭设置抽屉
触发方式：
- 点击遮罩层
- 点击抽屉内的"关闭"按钮
- 按下 ESC 键
- 切换到其他步骤（可选：关闭当前抽屉并打开新步骤的抽屉）

系统行为：
- 抽屉向右滑出（300ms）
- 遮罩层淡出
- 清除选中步骤状态

#### 3.3.3 保存设置
- 抽屉内的设置表单实时同步到数据模型
- 无需显式"保存"按钮（即改即存）
- 关闭抽屉时自动触发自动保存机制

---

## 四、技术实现要点

### 4.1 组件结构调整

#### 4.1.1 CoursewareEditor.vue
**移除内容**：
- 删除右侧 `<aside class="editor-settings-panel">` 区域
- 删除相关 CSS 样式（`.editor-settings-panel`）

**新增内容**：
- 添加抽屉状态管理：
  ```typescript
  const drawerVisible = ref(false)
  const drawerStepId = ref<string | null>(null)
  ```
- 添加抽屉控制方法：
  ```typescript
  function openStepSettings(stepId: string) {
    drawerStepId.value = stepId
    drawerVisible.value = true
  }
  
  function closeStepSettings() {
    drawerVisible.value = false
    drawerStepId.value = null
  }
  ```
- 添加键盘事件监听（ESC 关闭）

#### 4.1.2 TimelinePanel.vue
**调整内容**：
- 在步骤卡片上添加"设置"按钮（图标：齿轮或三点菜单）
- 点击按钮触发 `emit('open-step-settings', stepId)`
- 按钮位置：步骤卡片右上角，与现有的播放、删除按钮并列

#### 4.1.3 新建组件：StepSettingsDrawer.vue
**职责**：
- 承载步骤设置表单内容
- 管理抽屉的显示/隐藏动画
- 处理遮罩层点击事件

**Props**：
```typescript
interface Props {
  visible: boolean          // 是否显示抽屉
  stepId: string | null     // 当前编辑的步骤 ID
}
```

**Emits**：
```typescript
const emit = defineEmits<{
  close: []                 // 关闭抽屉
}>()
```

**结构**：
```vue
<template>
  <Teleport to="body">
    <Transition name="drawer-fade">
      <div v-if="visible" class="drawer-overlay" @click="emit('close')">
        <Transition name="drawer-slide">
          <aside 
            v-if="visible" 
            class="step-settings-drawer"
            @click.stop
          >
            <header class="drawer-header">
              <h3>步骤设置</h3>
              <button @click="emit('close')" class="close-btn">×</button>
            </header>
            <div class="drawer-content">
              <!-- 复用现有的步骤设置表单组件 -->
              <StepSettingsForm :step-id="stepId" />
            </div>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
```

### 4.2 样式规范

#### 4.2.1 抽屉尺寸
```css
.step-settings-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;              /* 比原右侧栏宽 40px */
  height: 100vh;
  background: #ffffff;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  z-index: 1001;
  display: flex;
  flex-direction: column;
}
```

#### 4.2.2 遮罩层
```css
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
}
```

#### 4.2.3 动画效果
```css
/* 遮罩淡入淡出 */
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 300ms ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

/* 抽屉滑入滑出 */
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 300ms ease-out;
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}
```

### 4.3 状态管理

#### 4.3.1 抽屉状态
在 `CoursewareEditor.vue` 中维护：
```typescript
const drawerState = reactive({
  visible: false,
  stepId: null as string | null,
})
```

#### 4.3.2 事件流
```
TimelinePanel (步骤卡片)
  ↓ emit('open-step-settings', stepId)
CoursewareEditor
  ↓ 更新 drawerState
StepSettingsDrawer
  ↓ 显示抽屉，加载设置表单
  ↓ 用户编辑
  ↓ emit('close')
CoursewareEditor
  ↓ 更新 drawerState.visible = false
StepSettingsDrawer
  ↓ 播放关闭动画，隐藏
```

---

## 五、影响范围分析

### 5.1 文件变更清单

| 文件路径 | 变更类型 | 变更内容 |
|---------|---------|---------|
| `packages/vue/src/editor/CoursewareEditor.vue` | 修改 | 移除右侧栏，添加抽屉状态管理 |
| `packages/vue/src/editor/CoursewareEditor.css` | 修改 | 删除 `.editor-settings-panel` 样式 |
| `packages/vue/src/editor/TimelinePanel.vue` | 修改 | 步骤卡片添加"设置"按钮 |
| `packages/vue/src/editor/StepSettingsDrawer.vue` | 新建 | 浮动抽屉组件 |
| `packages/vue/src/editor/StepSettingsDrawer.css` | 新建 | 抽屉样式 |
| `packages/vue/src/editor/StepSettingsForm.vue` | 新建（或重构） | 步骤设置表单（从原右侧栏内容提取） |

### 5.2 兼容性影响
- **向后兼容**：数据模型不变，仅 UI 交互调整
- **现有功能**：所有步骤设置功能保持不变
- **测试范围**：需重点测试抽屉打开/关闭、设置保存、键盘交互

### 5.3 性能影响
- **正面影响**：
  - 减少 DOM 节点（右侧栏默认不渲染）
  - 按需加载设置表单
- **注意事项**：
  - 使用 `Teleport` 避免 z-index 冲突
  - 抽屉关闭后及时销毁内容，避免内存泄漏

---

## 六、验收标准

### 6.1 功能验收
- [ ] 点击时间轴步骤卡片的"设置"按钮，抽屉从右侧滑入
- [ ] 抽屉宽度 400px，显示完整的步骤设置表单
- [ ] 点击遮罩层，抽屉关闭
- [ ] 按下 ESC 键，抽屉关闭
- [ ] 点击抽屉内"关闭"按钮，抽屉关闭
- [ ] 在抽屉中修改设置，实时同步到数据模型
- [ ] 关闭抽屉后，设置已保存（触发自动保存）

### 6.2 视觉验收
- [ ] 抽屉滑入/滑出动画流畅（300ms，ease-out）
- [ ] 遮罩层半透明（rgba(0, 0, 0, 0.4)）
- [ ] 抽屉阴影效果清晰（-2px 0 8px rgba(0, 0, 0, 0.15)）
- [ ] 中央画布区域扩展，占据原右侧栏空间
- [ ] 步骤卡片上的"设置"按钮位置合理，不遮挡其他内容

### 6.3 交互验收
- [ ] 打开抽屉时，焦点自动进入抽屉内
- [ ] 抽屉打开时，遮罩层下方的内容不可交互
- [ ] 快速连续点击"设置"按钮，不会出现多个抽屉
- [ ] 切换步骤时，抽屉内容正确更新

### 6.4 响应式验收
- [ ] 在 1920x1080 分辨率下，抽屉显示正常
- [ ] 在 1366x768 分辨率下，抽屉显示正常
- [ ] 在 1280x720 分辨率下，抽屉显示正常
- [ ] 抽屉宽度固定 400px，不随屏幕尺寸变化

---

## 七、实施计划

### 7.1 开发阶段
1. **阶段一：组件拆分**（预计 2 小时）
   - 从 `CoursewareEditor.vue` 中提取步骤设置表单逻辑
   - 创建 `StepSettingsForm.vue` 组件
   - 确保表单功能独立可用

2. **阶段二：抽屉组件开发**（预计 3 小时）
   - 创建 `StepSettingsDrawer.vue` 组件
   - 实现抽屉显示/隐藏逻辑
   - 实现遮罩层和动画效果
   - 添加键盘事件监听（ESC）

3. **阶段三：集成与调整**（预计 2 小时）
   - 在 `CoursewareEditor.vue` 中集成抽屉组件
   - 移除原右侧栏代码
   - 在 `TimelinePanel.vue` 中添加"设置"按钮
   - 调整布局样式

4. **阶段四：测试与优化**（预计 2 小时）
   - 功能测试（打开/关闭、设置保存）
   - 视觉测试（动画、样式）
   - 响应式测试（不同分辨率）
   - 性能测试（内存泄漏检查）

**总预计工时**：9 小时

### 7.2 测试阶段
- 执行验收标准中的所有测试项
- 回归测试：确保现有编辑功能不受影响
- 边界测试：快速点击、网络延迟、大量步骤等场景

### 7.3 发布计划
- 目标版本：VNext-38
- 发布方式：与其他 VNext-38 功能一起发布
- 回滚方案：保留原右侧栏代码的 Git 提交，必要时可快速回滚

---

## 八、风险与应对

### 8.1 潜在风险

| 风险项 | 影响程度 | 应对措施 |
|-------|---------|---------|
| 用户不习惯新交互方式 | 中 | 提供操作引导提示，保留明显的"设置"入口 |
| 抽屉动画性能问题 | 低 | 使用 CSS transform 而非 left/right，启用硬件加速 |
| 移动端适配问题 | 低 | 当前项目主要面向桌面端，移动端暂不考虑 |
| 设置表单拆分遗漏功能 | 中 | 详细对比原右侧栏功能清单，逐项迁移 |

### 8.2 回滚条件
如果出现以下情况，考虑回滚：
- 抽屉无法正常打开/关闭
- 设置保存失败或数据丢失
- 严重的性能问题（卡顿、内存泄漏）
- 用户反馈强烈负面

---

## 九、后续优化方向

### 9.1 短期优化（VNext-39）
- 支持抽屉宽度拖拽调整
- 支持抽屉位置记忆（用户偏好）
- 添加快捷键打开设置（如选中步骤后按 S 键）

### 9.2 长期优化（VNext-40+）
- 支持多步骤设置对比（并排显示多个步骤的设置）
- 支持设置模板（快速应用预设配置）
- 支持设置历史记录（撤销/重做）

---

## 十、附录

### 10.1 参考资料
- Figma 设计稿：（待补充）
- 用户反馈截图：已提供
- 竞品分析：
  - Keynote：侧边栏可折叠，检查器面板浮动
  - Canva：右侧面板固定，但宽度更大（450px+）
  - Figma：右侧面板固定，支持折叠

### 10.2 术语表
- **抽屉（Drawer）**：从屏幕边缘滑入的浮动面板
- **遮罩层（Overlay）**：半透明背景层，用于聚焦抽屉内容
- **步骤设置（Step Settings）**：针对单个步骤的配置项（名称、触发、动作等）

---

## 文档变更记录

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|---------|------|
| 2026-05-11 | v1.0 | 初始版本 | Claude (产品和项目 Owner) |
