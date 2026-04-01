<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { projectRepository } from "../projects/project-repository";
import type { ProjectSummary } from "../projects/types";

/** 项目搜索关键字。 */
const searchQuery = ref("");

/** 当前项目摘要列表。 */
const projectSummaries = ref<ProjectSummary[]>([]);

/** 当前路由实例，用于跳转到工作台页。 */
const router = useRouter();

/** 刷新项目列表页的数据源。 */
const refreshProjectSummaries = () => {
  projectSummaries.value = projectRepository.list();
};

/** 使用更易读的格式展示更新时间。 */
const formatUpdatedAt = (updatedAt: string): string =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(updatedAt));

/** 当前搜索结果。 */
const filteredProjects = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase();
  if (!keyword) {
    return projectSummaries.value;
  }

  return projectSummaries.value.filter((project) =>
    project.title.toLowerCase().includes(keyword),
  );
});

/** 当前项目总数。 */
const projectCountLabel = computed(() => `${projectSummaries.value.length} 个项目`);

/** 创建一个新项目并进入工作台。 */
const createProject = async () => {
  const nextProject = projectRepository.create();
  refreshProjectSummaries();
  await router.push({
    name: "project-workspace",
    params: {
      projectId: nextProject.id,
    },
    query: {
      mode: "edit",
    },
  });
};

/** 打开某个项目。 */
const openProject = async (projectId: string) => {
  await router.push({
    name: "project-workspace",
    params: {
      projectId,
    },
    query: {
      mode: "edit",
    },
  });
};

/** 删除某个项目并刷新列表。 */
const removeProject = (projectId: string) => {
  const targetProject = projectSummaries.value.find((project) => project.id === projectId);
  if (!targetProject) {
    return;
  }

  const confirmed = window.confirm(`确认删除项目「${targetProject.title}」吗？`);
  if (!confirmed) {
    return;
  }

  projectRepository.remove(projectId);
  refreshProjectSummaries();
};

/** 首屏进入时确保至少有一个示例项目。 */
onMounted(() => {
  projectRepository.ensureSeededProjects();
  refreshProjectSummaries();
});
</script>

<template>
  <main class="project-list-page">
    <section class="hero-shell">
      <div class="hero-copy">
        <p class="hero-kicker">Canvas Courseware</p>
        <h1>面向真实创作流程的课件项目工作台</h1>
        <p class="hero-text">
          从项目列表进入课件工作台，在同一套产品壳层里完成编辑、预览和保存，不再停留在开发联调视角。
        </p>
      </div>

      <div class="hero-actions">
        <button class="primary-button" type="button" @click="createProject">新建项目</button>
        <span class="project-count">{{ projectCountLabel }}</span>
      </div>
    </section>

    <section class="library-shell">
      <header class="section-head">
        <div>
          <p class="section-kicker">Project Library</p>
          <h2>项目列表</h2>
        </div>

        <label class="search-field">
          <span class="sr-only">搜索项目</span>
          <input
            v-model="searchQuery"
            class="search-input"
            type="search"
            placeholder="搜索项目标题..."
          />
        </label>
      </header>

      <div v-if="filteredProjects.length > 0" class="project-grid">
        <article
          v-for="project in filteredProjects"
          :key="project.id"
          class="project-card"
        >
          <div
            class="project-thumbnail"
            :style="{ background: project.thumbnail ?? 'linear-gradient(135deg, #CCFBF1, #FFFFFF)' }"
          >
            <span>{{ project.title.slice(0, 1) }}</span>
          </div>

          <div class="project-copy">
            <div class="project-meta">
              <span>{{ formatUpdatedAt(project.updatedAt) }}</span>
              <span>{{ project.slideCount }} 页</span>
            </div>
            <h3>{{ project.title }}</h3>
            <p>继续在正式工作台中编辑课件内容、切换模式并保存项目。</p>
          </div>

          <div class="project-actions">
            <button class="secondary-button" type="button" @click="openProject(project.id)">
              打开
            </button>
            <button class="danger-button" type="button" @click="removeProject(project.id)">
              删除
            </button>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">
        <strong>没有匹配的项目</strong>
        <p>换个关键词试试，或者直接创建一个新的课件项目。</p>
        <button class="primary-button" type="button" @click="createProject">创建项目</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.project-list-page {
  display: grid;
  gap: var(--cw-space-6);
  max-width: 1520px;
  margin: 0 auto;
  padding: 40px 24px 72px;
}

.hero-shell,
.library-shell {
  border: 1px solid var(--cw-color-border);
  border-radius: var(--cw-radius-xl);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.86)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-medium);
}

.hero-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--cw-space-5);
  padding: 32px;
}

.hero-kicker,
.section-kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--cw-color-primary);
}

.hero-copy h1,
.section-head h2 {
  margin: 14px 0 0;
  line-height: 1.08;
}

.hero-copy h1 {
  max-width: 11ch;
  font-size: clamp(40px, 6vw, 62px);
}

.hero-text {
  max-width: 58ch;
  margin: 18px 0 0;
  font-size: 15px;
  line-height: 1.8;
  color: var(--cw-color-muted);
}

.hero-actions {
  display: grid;
  gap: var(--cw-space-3);
  align-content: end;
  justify-items: start;
}

.library-shell {
  display: grid;
  gap: var(--cw-space-5);
  padding: 28px;
}

.section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--cw-space-4);
}

.section-head h2 {
  font-size: clamp(28px, 4vw, 36px);
}

.search-field {
  width: min(360px, 100%);
}

.search-input {
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid rgba(19, 78, 74, 0.12);
  border-radius: var(--cw-radius-pill);
  color: var(--cw-color-text);
  background: #ffffff;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cw-space-5);
}

.project-card {
  display: grid;
  gap: var(--cw-space-4);
  padding: 18px;
  border: 1px solid rgba(19, 78, 74, 0.08);
  border-radius: var(--cw-radius-lg);
  background:
    linear-gradient(180deg, rgba(240, 253, 250, 0.74), rgba(255, 255, 255, 0.94)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-weak);
}

.project-thumbnail {
  display: grid;
  place-items: center;
  min-height: 180px;
  border-radius: calc(var(--cw-radius-lg) - 6px);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.64);
}

.project-thumbnail span {
  display: inline-grid;
  place-items: center;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  font-size: 30px;
  font-weight: 700;
  color: #ffffff;
  background: rgba(19, 78, 74, 0.34);
}

.project-copy {
  display: grid;
  gap: var(--cw-space-2);
}

.project-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cw-space-3);
  font-size: 13px;
  color: var(--cw-color-muted);
}

.project-copy h3 {
  margin: 0;
  font-size: 22px;
  line-height: 1.3;
}

.project-copy p,
.empty-state p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--cw-color-muted);
}

.project-actions {
  display: flex;
  gap: var(--cw-space-2);
}

.project-count {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 var(--cw-space-4);
  border-radius: var(--cw-radius-pill);
  font-size: 14px;
  color: var(--cw-color-primary);
  background: rgba(13, 148, 136, 0.12);
}

.primary-button,
.secondary-button,
.danger-button {
  min-height: 44px;
  padding: 0 var(--cw-space-4);
  border-radius: var(--cw-radius-pill);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform var(--cw-duration-fast) var(--cw-ease-standard),
    background var(--cw-duration-fast) var(--cw-ease-standard),
    border-color var(--cw-duration-fast) var(--cw-ease-standard);
}

.primary-button {
  border: 1px solid transparent;
  color: #ffffff;
  background: linear-gradient(135deg, var(--cw-color-primary), var(--cw-color-primary-2));
}

.secondary-button {
  border: 1px solid rgba(13, 148, 136, 0.18);
  color: var(--cw-color-text);
  background: rgba(255, 255, 255, 0.92);
}

.danger-button {
  border: 1px solid rgba(220, 38, 38, 0.16);
  color: var(--cw-color-danger);
  background: var(--cw-color-danger-soft);
}

.primary-button:hover,
.secondary-button:hover,
.danger-button:hover {
  transform: translateY(-1px);
}

.empty-state {
  display: grid;
  gap: var(--cw-space-3);
  justify-items: center;
  padding: 56px 24px;
  border: 1px dashed rgba(13, 148, 136, 0.18);
  border-radius: var(--cw-radius-lg);
  text-align: center;
  background: rgba(255, 255, 255, 0.72);
}

.empty-state strong {
  font-size: 20px;
  color: var(--cw-color-text);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1180px) {
  .project-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .hero-shell,
  .section-head,
  .project-grid {
    grid-template-columns: 1fr;
  }

  .section-head {
    align-items: flex-start;
  }
}

@media (max-width: 680px) {
  .project-list-page {
    padding: 24px 16px 48px;
  }

  .hero-shell,
  .library-shell {
    padding: 20px;
  }

  .project-grid {
    grid-template-columns: 1fr;
  }
}
</style>
