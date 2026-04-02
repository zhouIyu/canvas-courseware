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

/** 生成项目标题首字母占位。 */
const resolveProjectInitial = (projectTitle: string): string =>
  projectTitle.trim().slice(0, 1) || "课";

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
        <a-button size="large" type="primary" @click="createProject">新建项目</a-button>
        <a-tag color="arcoblue">{{ projectCountLabel }}</a-tag>
      </div>
    </section>

    <section class="library-shell">
      <header class="section-head">
        <div class="section-copy">
          <p class="section-kicker">Project Library</p>
          <h2>项目列表</h2>
        </div>

        <a-input-search
          v-model="searchQuery"
          allow-clear
          class="search-input"
          placeholder="搜索项目标题..."
        />
      </header>

      <div v-if="filteredProjects.length > 0" class="project-grid">
        <a-card
          v-for="project in filteredProjects"
          :key="project.id"
          :bordered="false"
          class="project-card"
          hoverable
        >
          <template #cover>
            <div
              class="project-thumbnail"
              :style="{ background: project.thumbnail ?? 'linear-gradient(135deg, #CCFBF1, #FFFFFF)' }"
            >
              <span>{{ resolveProjectInitial(project.title) }}</span>
            </div>
          </template>

          <div class="project-copy">
            <div class="project-meta">
              <span>{{ formatUpdatedAt(project.updatedAt) }}</span>
              <span>{{ project.slideCount }} 页</span>
            </div>
            <h3>{{ project.title }}</h3>
            <p>继续在正式工作台中编辑课件内容、切换模式并保存项目。</p>
          </div>

          <div class="project-actions">
            <a-button type="primary" @click="openProject(project.id)">打开</a-button>
            <a-popconfirm
              :content="`确认删除项目「${project.title}」吗？`"
              position="top"
              @ok="removeProject(project.id)"
            >
              <a-button status="danger" type="outline">删除</a-button>
            </a-popconfirm>
          </div>
        </a-card>
      </div>

      <a-empty v-else class="empty-state" description="没有匹配的项目">
        <a-button type="primary" @click="createProject">创建项目</a-button>
      </a-empty>
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
  border: 1px solid color-mix(in srgb, var(--cw-color-border) 68%, #ffffff);
  border-radius: var(--cw-radius-xl);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.9)),
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
.section-copy h2 {
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
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: var(--cw-space-3);
}

.library-shell {
  display: grid;
  gap: var(--cw-space-5);
  padding: 28px;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cw-space-4);
}

.section-copy h2 {
  font-size: clamp(28px, 4vw, 36px);
}

.search-input {
  width: min(360px, 100%);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cw-space-5);
}

.project-card :deep(.arco-card-body) {
  display: grid;
  gap: var(--cw-space-4);
}

.project-card :deep(.arco-card-cover) {
  margin-bottom: 0;
}

.project-thumbnail {
  display: grid;
  place-items: center;
  min-height: 180px;
  border-radius: calc(var(--cw-radius-lg) - 8px);
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

.project-copy p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--cw-color-muted);
}

.project-actions {
  display: flex;
  gap: var(--cw-space-2);
}

.empty-state {
  padding: 56px 24px;
  border: 1px dashed rgba(13, 148, 136, 0.2);
  border-radius: var(--cw-radius-lg);
  background: rgba(255, 255, 255, 0.8);
}

@media (max-width: 1180px) {
  .project-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .hero-shell,
  .project-grid {
    grid-template-columns: 1fr;
  }

  .hero-actions {
    align-items: flex-start;
    justify-content: flex-start;
  }

  .section-head {
    flex-direction: column;
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

  .project-actions {
    flex-wrap: wrap;
  }
}
</style>
