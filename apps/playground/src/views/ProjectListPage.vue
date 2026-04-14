<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import ProjectCreateModal from "../components/ProjectCreateModal.vue";
import { collectProjectAssetIdsFromDocument, removeProjectAssets } from "../projects/project-assets";
import {
  formatProjectCanvasSize,
  type ProjectCreateOptions,
} from "../projects/project-creation";
import { projectRepository } from "../projects/project-repository";
import {
  createProjectThumbnailStyle,
  isImageThumbnailSource,
} from "../projects/project-thumbnails";
import type { ProjectSummary } from "../projects/types";

/** 项目搜索关键字。 */
const searchQuery = ref("");

/** 当前项目摘要列表。 */
const projectSummaries = ref<ProjectSummary[]>([]);

/** 当前是否展示新建项目弹窗。 */
const isCreateProjectModalVisible = ref(false);

/** 当前是否正在创建项目。 */
const isCreatingProject = ref(false);

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

/** 生成项目卡片封面样式，优先展示真实截图。 */
const resolveProjectThumbnailStyle = (thumbnail: string | null) =>
  createProjectThumbnailStyle(thumbnail);

/** 判断项目封面当前是否已经有真实截图。 */
const hasProjectThumbnailImage = (thumbnail: string | null) => isImageThumbnailSource(thumbnail);

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

/** 打开新建项目弹窗。 */
const openCreateProjectModal = () => {
  isCreateProjectModalVisible.value = true;
};

/** 关闭新建项目弹窗。 */
const closeCreateProjectModal = () => {
  if (isCreatingProject.value) {
    return;
  }

  isCreateProjectModalVisible.value = false;
};

/** 提交新建项目并进入工作台。 */
const handleProjectCreate = async (options: ProjectCreateOptions) => {
  isCreatingProject.value = true;

  try {
    const nextProject = projectRepository.create(options);
    refreshProjectSummaries();
    isCreateProjectModalVisible.value = false;

    await router.push({
      name: "project-workspace",
      params: {
        projectId: nextProject.id,
      },
      query: {
        mode: "edit",
      },
    });
  } finally {
    isCreatingProject.value = false;
  }
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
const removeProject = async (projectId: string) => {
  const projectRecord = projectRepository.get(projectId);
  const assetIds = projectRecord
    ? collectProjectAssetIdsFromDocument(projectRecord.document)
    : [];

  projectRepository.remove(projectId);
  try {
    await removeProjectAssets(assetIds);
  } catch {
    // 删除项目时优先保证列表与本地仓库状态一致，资产清理由后台存储兜底重试。
  } finally {
    refreshProjectSummaries();
  }
};

/** 首屏进入时确保至少有一个示例项目。 */
onMounted(() => {
  projectRepository.ensureSeededProjects();
  refreshProjectSummaries();
});
</script>

<template>
  <main class="project-list-page">
    <section class="library-shell">
      <header class="section-head">
        <div class="section-copy">
          <h2>最近项目</h2>
          <p>{{ projectCountLabel }}</p>
        </div>

        <div class="section-actions">
          <a-input-search
            v-model="searchQuery"
            allow-clear
            class="search-input"
            placeholder="搜索项目名称..."
          />
          <a-button type="primary" @click="openCreateProjectModal">新建项目</a-button>
        </div>
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
              :style="resolveProjectThumbnailStyle(project.thumbnail)"
            >
              <span v-if="!hasProjectThumbnailImage(project.thumbnail)">
                {{ resolveProjectInitial(project.title) }}
              </span>
            </div>
          </template>

          <div class="project-copy">
            <div class="project-meta">
              <span>{{ formatUpdatedAt(project.updatedAt) }}</span>
              <span>{{ project.slideCount }} 页</span>
              <span>{{ formatProjectCanvasSize(project.canvasSize) }}</span>
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
        <a-button type="primary" @click="openCreateProjectModal">创建项目</a-button>
      </a-empty>
    </section>

    <ProjectCreateModal
      :visible="isCreateProjectModalVisible"
      :confirm-loading="isCreatingProject"
      @cancel="closeCreateProjectModal"
      @confirm="handleProjectCreate"
    />
  </main>
</template>

<style scoped>
.project-list-page {
  display: grid;
  max-width: 1440px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.library-shell {
  border: 1px solid color-mix(in srgb, var(--cw-color-border) 68%, #ffffff);
  border-radius: var(--cw-radius-xl);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.92)),
    var(--cw-color-surface);
  box-shadow: var(--cw-shadow-medium);
}

.section-copy h2 {
  margin: 0;
  line-height: 1.08;
}

.library-shell {
  display: grid;
  gap: var(--cw-space-5);
  padding: 24px 28px 28px;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cw-space-4);
}

.section-copy {
  display: grid;
  gap: var(--cw-space-1);
  min-width: 0;
}

.section-copy h2 {
  font-size: clamp(26px, 4vw, 34px);
}

.section-copy p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--cw-color-muted);
}

.section-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--cw-space-3);
}

.search-input {
  width: min(320px, 100%);
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
  min-height: 172px;
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
  border: 1px dashed rgba(22, 93, 255, 0.2);
  border-radius: var(--cw-radius-lg);
  background: rgba(255, 255, 255, 0.8);
}

@media (max-width: 1180px) {
  .project-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .project-grid {
    grid-template-columns: 1fr;
  }

  .section-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .section-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 680px) {
  .project-list-page {
    padding: 24px 16px 48px;
  }

  .library-shell {
    padding: 20px;
  }

  .section-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input {
    width: 100%;
  }

  .project-grid {
    grid-template-columns: 1fr;
  }

  .project-actions {
    flex-wrap: wrap;
  }
}
</style>
