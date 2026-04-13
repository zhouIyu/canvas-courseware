import { computed, type Ref } from "vue";

/** 工作台保存状态。 */
export type WorkspaceSaveStatus = "saved" | "saving" | "dirty" | "error";

/** 组合工作台顶栏需要的保存状态文案。 */
export function useWorkspaceSaveStatus(
  saveStatus: Ref<WorkspaceSaveStatus>,
  lastSavedAt: Ref<string | null>,
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

  /** 保存状态对应的标签色值。 */
  const saveStatusTagColor = computed(() => {
    switch (saveStatus.value) {
      case "saving":
        return "#165dff";
      case "dirty":
        return "#ff7d00";
      case "error":
        return "#f53f3f";
      case "saved":
      default:
        return "#00b42a";
    }
  });

  /** 最近保存时间的辅助文案。 */
  const saveStatusHint = computed(() => {
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
    saveStatusHint,
    saveStatusLabel,
    saveStatusTagColor,
  };
}
