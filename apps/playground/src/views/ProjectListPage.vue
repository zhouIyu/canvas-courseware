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

/** 项目列表支持的排序模式。 */
type ProjectSortMode =
  | "updated-desc"
  | "updated-asc"
  | "created-desc"
  | "created-asc"
  | "slide-count-desc"
  | "slide-count-asc";

/** 项目列表排序偏好的本地存储键名。 */
const PROJECT_LIST_SORT_STORAGE_KEY = "canvas-courseware.project-list.sort-mode";

/** 项目搜索关键字。 */
const searchQuery = ref("");

/** 当前项目摘要列表。 */
const projectSummaries = ref<ProjectSummary[]>([]);

/** 当前项目排序模式。 */
const projectSortMode = ref<ProjectSortMode>("updated-desc");

/** 当前是否展示新建项目弹窗。 */
const isCreateProjectModalVisible = ref(false);

/** 当前是否正在创建项目。 */
const isCreatingProject = ref(false);

/** 当前路由实例，用于跳转到工作台页。 */
const router = useRouter();

/** 项目列表完整时间使用的格式化器。 */
const detailedUpdatedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** 项目列表短时间使用的格式化器。 */
const shortUpdatedAtTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

/** 同年份日期时间使用的格式化器。 */
const sameYearUpdatedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** 项目标题比较使用的本地化排序器。 */
const projectTitleCollator = new Intl.Collator("zh-CN");

/** 项目列表排序选项。 */
const projectSortOptions = [
  {
    label: "最近编辑优先",
    value: "updated-desc",
  },
  {
    label: "较早编辑优先",
    value: "updated-asc",
  },
  {
    label: "最新创建优先",
    value: "created-desc",
  },
  {
    label: "最早创建优先",
    value: "created-asc",
  },
  {
    label: "页数最多优先",
    value: "slide-count-desc",
  },
  {
    label: "页数最少优先",
    value: "slide-count-asc",
  },
] satisfies Array<{ label: string; value: ProjectSortMode }>;

/** 项目列表排序模式对应的人类可读说明。 */
const projectSortLabelMap: Record<ProjectSortMode, string> = {
  "updated-desc": "按最近编辑优先排序",
  "updated-asc": "按较早编辑优先排序",
  "created-desc": "按最新创建优先排序",
  "created-asc": "按最早创建优先排序",
  "slide-count-desc": "按页数最多优先排序",
  "slide-count-asc": "按页数最少优先排序",
};

/** 刷新项目列表页的数据源。 */
const refreshProjectSummaries = () => {
  projectSummaries.value = projectRepository.list();
};

/** 判断两个时间是否处于同一自然日。 */
const isSameCalendarDay = (sourceDate: Date, targetDate: Date): boolean =>
  sourceDate.getFullYear() === targetDate.getFullYear()
  && sourceDate.getMonth() === targetDate.getMonth()
  && sourceDate.getDate() === targetDate.getDate();

/** 读取项目时间字符串对应的时间戳，异常值统一回退为 0。 */
const resolveProjectTimestamp = (dateValue: string): number => {
  const parsedTimestamp = Date.parse(dateValue);
  return Number.isNaN(parsedTimestamp) ? 0 : parsedTimestamp;
};

/** 生成项目卡片中更易扫读的时间摘要。 */
const formatProjectDateSummary = (dateValue: string): string => {
  const targetDate = new Date(dateValue);
  if (Number.isNaN(targetDate.getTime())) {
    return "时间未知";
  }

  const currentDate = new Date();
  if (isSameCalendarDay(targetDate, currentDate)) {
    return `今天 ${shortUpdatedAtTimeFormatter.format(targetDate)}`;
  }

  const yesterday = new Date(currentDate);
  yesterday.setDate(currentDate.getDate() - 1);
  if (isSameCalendarDay(targetDate, yesterday)) {
    return `昨天 ${shortUpdatedAtTimeFormatter.format(targetDate)}`;
  }

  if (targetDate.getFullYear() === currentDate.getFullYear()) {
    return sameYearUpdatedAtFormatter.format(targetDate);
  }

  return detailedUpdatedAtFormatter.format(targetDate);
};

/** 生成项目标题首字母占位。 */
const resolveProjectInitial = (projectTitle: string): string =>
  projectTitle.trim().slice(0, 1) || "课";

/** 生成项目卡片封面样式，优先展示真实截图。 */
const resolveProjectThumbnailStyle = (thumbnail: string | null) =>
  createProjectThumbnailStyle(thumbnail);

/** 判断项目封面当前是否已经有真实截图。 */
const hasProjectThumbnailImage = (thumbnail: string | null) => isImageThumbnailSource(thumbnail);

/** 生成项目卡片中的完整时间文案。 */
const formatProjectDateDetail = (dateValue: string): string => {
  const targetDate = new Date(dateValue);
  return Number.isNaN(targetDate.getTime())
    ? dateValue
    : detailedUpdatedAtFormatter.format(targetDate);
};

/** 生成项目最近编辑状态，便于在卡片摘要中快速识别活跃度。 */
const resolveProjectActivityStatus = (updatedAt: string): string => {
  const updatedTimestamp = resolveProjectTimestamp(updatedAt);
  if (updatedTimestamp <= 0) {
    return "状态未知";
  }

  const updatedDate = new Date(updatedTimestamp);
  const currentDate = new Date();
  if (isSameCalendarDay(updatedDate, currentDate)) {
    return "今天更新";
  }

  const yesterday = new Date(currentDate);
  yesterday.setDate(currentDate.getDate() - 1);
  if (isSameCalendarDay(updatedDate, yesterday)) {
    return "昨天更新";
  }

  const diffDays = Math.floor((currentDate.getTime() - updatedTimestamp) / (1000 * 60 * 60 * 24));
  return diffDays <= 7 ? "近 7 日更新" : "待继续";
};

/** 读取项目列表排序偏好，异常或非法值统一回退到默认排序。 */
const restoreProjectSortModePreference = (): ProjectSortMode => {
  if (typeof window === "undefined") {
    return "updated-desc";
  }

  const storedSortMode = window.localStorage.getItem(PROJECT_LIST_SORT_STORAGE_KEY);
  return isProjectSortMode(storedSortMode) ? storedSortMode : "updated-desc";
};

/** 持久化当前排序偏好，确保刷新后仍回显最近一次选择。 */
const persistProjectSortModePreference = (sortMode: ProjectSortMode) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PROJECT_LIST_SORT_STORAGE_KEY, sortMode);
};

/** 当前规整后的搜索关键字。 */
const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase());

/** 当前是否处于搜索态。 */
const hasSearchQuery = computed(() => normalizedSearchQuery.value.length > 0);

/** 当前搜索命中的项目。 */
const matchedProjects = computed(() => {
  const keyword = normalizedSearchQuery.value;
  if (!keyword) {
    return projectSummaries.value;
  }

  return projectSummaries.value.filter((project) =>
    project.title.toLowerCase().includes(keyword),
  );
});

/** 比较两个项目标题，供排序并列时稳定回退。 */
const compareProjectTitle = (leftProject: ProjectSummary, rightProject: ProjectSummary): number =>
  projectTitleCollator.compare(leftProject.title, rightProject.title);

/** 按某个时间字段比较两个项目，并在并列时回退到标题排序。 */
const compareProjectsByTimestamp = (
  leftProject: ProjectSummary,
  rightProject: ProjectSummary,
  direction: 1 | -1,
  field: "createdAt" | "updatedAt",
): number => {
  const leftTimestamp = resolveProjectTimestamp(leftProject[field]);
  const rightTimestamp = resolveProjectTimestamp(rightProject[field]);
  if (leftTimestamp === rightTimestamp) {
    return compareProjectTitle(leftProject, rightProject);
  }

  return (leftTimestamp - rightTimestamp) * direction;
};

/** 按页数比较两个项目，并在并列时回退到最近编辑时间排序。 */
const compareProjectsBySlideCount = (
  leftProject: ProjectSummary,
  rightProject: ProjectSummary,
  direction: 1 | -1,
): number => {
  if (leftProject.slideCount === rightProject.slideCount) {
    return compareProjectsByTimestamp(leftProject, rightProject, -1, "updatedAt");
  }

  return (leftProject.slideCount - rightProject.slideCount) * direction;
};

/** 按当前选择的排序模式整理项目列表。 */
const sortProjectsByMode = (
  projects: ProjectSummary[],
  sortMode: ProjectSortMode,
): ProjectSummary[] => {
  const sortedProjects = [...projects];
  sortedProjects.sort((leftProject, rightProject) => {
    switch (sortMode) {
      case "updated-asc":
        return compareProjectsByTimestamp(leftProject, rightProject, 1, "updatedAt");
      case "created-desc":
        return compareProjectsByTimestamp(leftProject, rightProject, -1, "createdAt");
      case "created-asc":
        return compareProjectsByTimestamp(leftProject, rightProject, 1, "createdAt");
      case "slide-count-desc":
        return compareProjectsBySlideCount(leftProject, rightProject, -1);
      case "slide-count-asc":
        return compareProjectsBySlideCount(leftProject, rightProject, 1);
      case "updated-desc":
      default:
        return compareProjectsByTimestamp(leftProject, rightProject, -1, "updatedAt");
    }
  });

  return sortedProjects;
};

/** 按当前排序模式重新整理项目列表。 */
const displayedProjects = computed(() =>
  sortProjectsByMode(matchedProjects.value, projectSortMode.value),
);

/** 当前排序模式的人类可读说明。 */
const projectSortLabel = computed(() => projectSortLabelMap[projectSortMode.value]);

/** 当前项目总数与筛选结果说明。 */
const projectCountLabel = computed(() => {
  const totalProjectCount = projectSummaries.value.length;
  if (!hasSearchQuery.value) {
    return `共 ${totalProjectCount} 个项目，${projectSortLabel.value}`;
  }

  return `共 ${totalProjectCount} 个项目，匹配 ${matchedProjects.value.length} 个，${projectSortLabel.value}`;
});

/** 当前空状态文案。 */
const emptyStateDescription = computed(() =>
  hasSearchQuery.value ? `没有匹配“${searchQuery.value.trim()}”的项目` : "还没有项目，先创建一个吧",
);

/** 打开新建项目弹窗。 */
const openCreateProjectModal = () => {
  isCreateProjectModalVisible.value = true;
};

/** 判断外部值是否为受支持的项目排序模式。 */
const isProjectSortMode = (value: unknown): value is ProjectSortMode =>
  value === "updated-desc"
  || value === "updated-asc"
  || value === "created-desc"
  || value === "created-asc"
  || value === "slide-count-desc"
  || value === "slide-count-asc";

/** 根据选择器结果切换当前排序模式。 */
const handleProjectSortModeChange = (value: unknown) => {
  if (!isProjectSortMode(value)) {
    return;
  }

  projectSortMode.value = value;
  persistProjectSortModePreference(value);
};

/** 清空当前搜索关键字并回到完整项目列表。 */
const clearSearchQuery = () => {
  searchQuery.value = "";
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
  projectSortMode.value = restoreProjectSortModePreference();
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
          <a-select
            class="sort-select"
            :model-value="projectSortMode"
            popup-container="body"
            @change="handleProjectSortModeChange"
          >
            <a-option
              v-for="option in projectSortOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </a-option>
          </a-select>
          <a-button type="primary" @click="openCreateProjectModal">新建项目</a-button>
        </div>
      </header>

      <div v-if="displayedProjects.length > 0" class="project-grid">
        <a-card
          v-for="project in displayedProjects"
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
            <h3>{{ project.title }}</h3>
            <div class="project-meta">
              <span>{{ project.slideCount }} 页</span>
              <span>{{ formatProjectCanvasSize(project.canvasSize) }}</span>
              <span class="project-activity-status">
                {{ resolveProjectActivityStatus(project.updatedAt) }}
              </span>
            </div>
            <div class="project-updated">
              <span class="project-updated-label">最后编辑</span>
              <strong>{{ formatProjectDateSummary(project.updatedAt) }}</strong>
              <span class="project-updated-detail">
                {{ formatProjectDateDetail(project.updatedAt) }}
              </span>
            </div>
            <div class="project-created">
              <span class="project-created-label">创建时间</span>
              <strong>{{ formatProjectDateSummary(project.createdAt) }}</strong>
              <span class="project-created-detail">
                {{ formatProjectDateDetail(project.createdAt) }}
              </span>
            </div>
            <p>可直接恢复最近一次工作区内容，继续在正式工作台中编辑与预览。</p>
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

      <a-empty v-else class="empty-state" :description="emptyStateDescription">
        <a-button
          v-if="hasSearchQuery"
          type="outline"
          @click="clearSearchQuery"
        >
          清空搜索
        </a-button>
        <a-button
          v-else
          type="primary"
          @click="openCreateProjectModal"
        >
          创建项目
        </a-button>
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

.sort-select {
  width: 172px;
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

.project-copy h3 {
  margin: 0;
  font-size: 22px;
  line-height: 1.3;
}

.project-updated {
  display: grid;
  gap: 2px;
}

.project-created {
  display: grid;
  gap: 2px;
}

.project-updated-label,
.project-created-label {
  font-size: 12px;
  line-height: 1.5;
  color: var(--cw-color-muted);
}

.project-updated strong,
.project-created strong {
  font-size: 18px;
  line-height: 1.3;
  color: var(--cw-color-text);
}

.project-updated-detail,
.project-created-detail {
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--cw-color-muted) 88%, #ffffff);
}

.project-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cw-space-3);
}

.project-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--cw-color-muted);
  background: color-mix(in srgb, var(--cw-color-primary-soft) 65%, #ffffff);
}

.project-activity-status {
  color: var(--cw-color-primary-strong);
  background: color-mix(in srgb, var(--cw-color-primary-soft) 92%, #ffffff);
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

  .sort-select {
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
