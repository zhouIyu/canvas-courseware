import { computed, type Ref } from "vue";

/** 工作台保存状态。 */
export type WorkspaceSaveStatus = "saved" | "saving" | "dirty" | "error";

/** 组合工作台顶栏需要的保存状态文案。 */
export function useWorkspaceSaveStatus(
  saveStatus: Ref<WorkspaceSaveStatus>,
  lastSavedAt: Ref<string | null>,
  lastSaveErrorMessage: Ref<string | null>,
) {
  /** 当前保存状态的用户可读标签。 */
  const saveStatusLabel = computed(() => {
    switch (saveStatus.value) {
      case "saving":
        return "保存中";
      case "dirty":
        return "未保存";
      case "error":
        return "保存失败";
      case "saved":
      default:
        return "已保存";
      }
  });

  /** 保存状态指示器展开时的辅助说明。 */
  const saveStatusDetail = computed(() => {
    if (saveStatus.value === "error" && lastSaveErrorMessage.value) {
      return lastSaveErrorMessage.value;
    }

    if (!lastSavedAt.value) {
      return "本地项目会自动持久化";
    }

    return `最近保存：${new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(lastSavedAt.value))}`;
  });

  return {
    saveStatusDetail,
    saveStatusLabel,
  };
}
