import type { CoursewareDocument } from "@canvas-courseware/core";

/** 时间轴步骤折叠态的 slide 级映射。 */
export type TimelineCollapsedStepIdsBySlideId = Record<string, string[]>;

/** 项目本地工作区状态。 */
export interface ProjectWorkspaceState {
  /** 按 slide 维度记录时间轴当前处于折叠态的步骤 id。 */
  timelineCollapsedStepIdsBySlideId: TimelineCollapsedStepIdsBySlideId;
}

/** 时间轴折叠态变更时的标准载荷。 */
export interface TimelineCollapsedStepIdsChangePayload {
  /** 当前被更新的 slide id。 */
  slideId: string;
  /** 该 slide 下最新的折叠步骤 id 列表。 */
  stepIds: string[];
}

/** 创建一份默认的项目工作区状态。 */
export function createDefaultProjectWorkspaceState(): ProjectWorkspaceState {
  return {
    timelineCollapsedStepIdsBySlideId: {},
  };
}

/** 过滤并去重一组步骤 id，只保留当前 slide 中仍然存在的项。 */
function sanitizeCollapsedStepIds(
  value: unknown,
  validStepIdSet: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedStepIds: string[] = [];
  const seenStepIds = new Set<string>();

  value.forEach((stepId) => {
    if (
      typeof stepId !== "string" ||
      seenStepIds.has(stepId) ||
      !validStepIdSet.has(stepId)
    ) {
      return;
    }

    seenStepIds.add(stepId);
    normalizedStepIds.push(stepId);
  });

  return normalizedStepIds;
}

/** 基于当前文档过滤失效的工作区状态，避免引用已删除的 slide 或步骤。 */
export function sanitizeProjectWorkspaceState(
  document: CoursewareDocument,
  workspaceState: ProjectWorkspaceState | null | undefined,
): ProjectWorkspaceState {
  const collapsedStepIdsBySlideId =
    workspaceState?.timelineCollapsedStepIdsBySlideId ?? {};
  const normalizedCollapsedStepIdsBySlideId: TimelineCollapsedStepIdsBySlideId =
    {};

  document.slides.forEach((slide) => {
    const validStepIdSet = new Set(slide.timeline.steps.map((step) => step.id));
    const normalizedStepIds = sanitizeCollapsedStepIds(
      collapsedStepIdsBySlideId[slide.id],
      validStepIdSet,
    );

    if (normalizedStepIds.length > 0) {
      normalizedCollapsedStepIdsBySlideId[slide.id] = normalizedStepIds;
    }
  });

  return {
    timelineCollapsedStepIdsBySlideId: normalizedCollapsedStepIdsBySlideId,
  };
}

/** 判断两组步骤 id 是否保持相同顺序与内容。 */
function isSameStepIdList(
  leftStepIds: readonly string[],
  rightStepIds: readonly string[],
): boolean {
  return (
    leftStepIds.length === rightStepIds.length &&
    leftStepIds.every((stepId, stepIndex) => stepId === rightStepIds[stepIndex])
  );
}

/** 更新某个 slide 的时间轴折叠态，并在无实际变化时复用旧引用。 */
export function updateTimelineCollapsedStepIds(
  workspaceState: ProjectWorkspaceState,
  payload: TimelineCollapsedStepIdsChangePayload,
): ProjectWorkspaceState {
  const nextStepIds = payload.stepIds.filter(
    (stepId, stepIndex, stepIds) =>
      typeof stepId === "string" &&
      stepId.length > 0 &&
      stepIds.indexOf(stepId) === stepIndex,
  );
  const currentStepIds =
    workspaceState.timelineCollapsedStepIdsBySlideId[payload.slideId] ?? [];

  if (isSameStepIdList(currentStepIds, nextStepIds)) {
    return workspaceState;
  }

  const nextCollapsedStepIdsBySlideId = {
    ...workspaceState.timelineCollapsedStepIdsBySlideId,
  };

  if (nextStepIds.length === 0) {
    delete nextCollapsedStepIdsBySlideId[payload.slideId];
  } else {
    nextCollapsedStepIdsBySlideId[payload.slideId] = nextStepIds;
  }

  return {
    timelineCollapsedStepIdsBySlideId: nextCollapsedStepIdsBySlideId,
  };
}
