import "./shared/tokens.css";

export * from "./editor";
export * from "./preview";
export * from "./shared";
export { default as EmptyState } from "./shared/EmptyState.vue";

export type CoursewareViewMode = "editor" | "preview";
export const VUE_SHELL_STATUS = "editor-ready";
