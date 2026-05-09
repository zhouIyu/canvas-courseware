import { ref } from "vue";
import type { ProjectRecord } from "../projects/types";
import {
  createDefaultProjectWorkspaceState,
  updateTimelineCollapsedStepIds,
  type ProjectWorkspaceState,
  type TimelineCollapsedStepIdsChangePayload,
} from "../projects/project-workspace-state";

/** 收敛工作台里的项目级时间轴 UI 状态。 */
export function useProjectWorkspaceTimelineState() {
  /** 当前项目的本地工作区状态。 */
  const workspaceState = ref<ProjectWorkspaceState>(
    createDefaultProjectWorkspaceState(),
  );

  /** 用仓库记录里的工作区状态覆盖当前内存值。 */
  const hydrateWorkspaceState = (projectRecord: ProjectRecord) => {
    workspaceState.value = projectRecord.workspaceState;
  };

  /** 在导入新文档或重置场景时清空旧工作区状态。 */
  const resetWorkspaceState = () => {
    workspaceState.value = createDefaultProjectWorkspaceState();
  };

  /** 应用一条时间轴折叠态变更，并返回本次是否真的发生了更新。 */
  const handleTimelineCollapsedStepIdsChange = (
    payload: TimelineCollapsedStepIdsChangePayload,
  ): boolean => {
    const nextWorkspaceState = updateTimelineCollapsedStepIds(
      workspaceState.value,
      payload,
    );
    if (nextWorkspaceState === workspaceState.value) {
      return false;
    }

    workspaceState.value = nextWorkspaceState;
    return true;
  };

  return {
    handleTimelineCollapsedStepIdsChange,
    hydrateWorkspaceState,
    resetWorkspaceState,
    workspaceState,
  };
}
