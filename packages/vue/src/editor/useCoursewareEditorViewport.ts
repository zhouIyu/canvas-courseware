import { computed, type Ref } from "vue";
import {
  resolveWorkspaceViewportDensity,
  type WorkspaceViewportDensity,
} from "../shared";

/** 编辑器视口布局组合式函数的输入参数。 */
export interface UseCoursewareEditorViewportOptions {
  /** 编辑器外部传入的总高度。 */
  height: Ref<number>;
  /** 当前工具条实际高度。 */
  toolbarHeight: Ref<number>;
  /** 左侧页面栏是否已收起。 */
  isSlideRailCollapsed: Ref<boolean>;
  /** 右侧管理栏是否已收起。 */
  isEditorSideCollapsed: Ref<boolean>;
  /** 当前是否渲染为内嵌工作台。 */
  isEmbedded: Ref<boolean>;
}

/** 按当前高度密度返回编辑态共用布局变量。 */
function resolveEditorViewportVariables(
  density: WorkspaceViewportDensity,
): Record<string, string> {
  if (density === "dense") {
    return {
      "--cw-slide-rail-width": "188px",
      "--cw-editor-side-width": "250px",
      "--cw-editor-layout-gap": "8px",
      "--cw-editor-layout-padding": "8px",
      "--cw-editor-stage-padding-block-start": "8px",
      "--cw-editor-stage-padding-inline": "8px",
      "--cw-editor-stage-padding-block-end": "10px",
      "--cw-editor-fit-padding-block-start": "6px",
      "--cw-editor-fit-padding-inline": "6px",
      "--cw-editor-fit-padding-block-end": "8px",
      "--cw-editor-toolbar-padding-block": "8px",
      "--cw-editor-toolbar-padding-inline": "12px",
      "--cw-editor-toolbar-group-padding": "3px 5px",
      "--cw-slide-list-gap": "7px",
      "--cw-slide-card-shell-padding": "5px",
      "--cw-slide-thumbnail-min-height": "56px",
      "--cw-slide-card-hint-display": "none",
    };
  }

  if (density === "compact") {
    return {
      "--cw-slide-rail-width": "194px",
      "--cw-editor-side-width": "258px",
      "--cw-editor-layout-gap": "8px",
      "--cw-editor-layout-padding": "9px",
      "--cw-editor-stage-padding-block-start": "10px",
      "--cw-editor-stage-padding-inline": "10px",
      "--cw-editor-stage-padding-block-end": "12px",
      "--cw-editor-fit-padding-block-start": "8px",
      "--cw-editor-fit-padding-inline": "8px",
      "--cw-editor-fit-padding-block-end": "10px",
      "--cw-editor-toolbar-padding-block": "9px",
      "--cw-editor-toolbar-padding-inline": "13px",
      "--cw-editor-toolbar-group-padding": "4px 6px",
      "--cw-slide-list-gap": "8px",
      "--cw-slide-card-shell-padding": "6px",
      "--cw-slide-thumbnail-min-height": "60px",
      "--cw-slide-card-hint-display": "flex",
    };
  }

  return {
    "--cw-slide-rail-width": "198px",
    "--cw-editor-side-width": "266px",
    "--cw-editor-layout-gap": "8px",
    "--cw-editor-layout-padding": "8px",
    "--cw-editor-stage-padding-block-start": "10px",
    "--cw-editor-stage-padding-inline": "10px",
    "--cw-editor-stage-padding-block-end": "14px",
    "--cw-editor-fit-padding-block-start": "8px",
    "--cw-editor-fit-padding-inline": "8px",
    "--cw-editor-fit-padding-block-end": "12px",
    "--cw-editor-toolbar-padding-block": "10px",
    "--cw-editor-toolbar-padding-inline": "14px",
    "--cw-editor-toolbar-group-padding": "4px 6px",
    "--cw-slide-list-gap": "8px",
    "--cw-slide-card-shell-padding": "6px",
    "--cw-slide-thumbnail-min-height": "64px",
    "--cw-slide-card-hint-display": "flex",
  };
}

/** 收敛编辑器三栏布局的高度与密度计算。 */
export function useCoursewareEditorViewport(
  options: UseCoursewareEditorViewportOptions,
) {
  /** 三栏区真正可用的高度，扣掉工具条后再分给左右侧栏和中间区。 */
  const paneHeight = computed(() =>
    Math.max(options.height.value - options.toolbarHeight.value, 320),
  );

  /** 三栏区复用同一份参考高度，让左右侧栏保持固定高度。 */
  const editorLayoutStyle = computed(() => ({
    "--cw-editor-pane-height": `${paneHeight.value}px`,
  }));

  /** 当前编辑工作区高度对应的密度档位。 */
  const editorViewportDensity = computed<WorkspaceViewportDensity>(() =>
    resolveWorkspaceViewportDensity(paneHeight.value),
  );

  /** 内嵌工作台模式下固定组件总高度，并向整棵编辑器子树下发当前密度变量。 */
  const editorShellStyle = computed(() =>
    ({
      ...resolveEditorViewportVariables(editorViewportDensity.value),
      ...(options.isEmbedded.value
        ? {
            height: `${options.height.value}px`,
          }
        : {}),
    }),
  );

  /** 当前三栏布局的动态 class。 */
  const editorLayoutClass = computed(() => ({
    "is-left-collapsed": options.isSlideRailCollapsed.value,
    "is-right-collapsed": options.isEditorSideCollapsed.value,
  }));

  return {
    editorLayoutClass,
    editorLayoutStyle,
    editorShellStyle,
    paneHeight,
  };
}
