/** 新建项目时允许设置的页面尺寸。 */
export interface ProjectCanvasSize {
  /** 页面宽度。 */
  width: number;
  /** 页面高度。 */
  height: number;
}

/** 新建项目流程提交给仓储的参数。 */
export interface ProjectCreateOptions {
  /** 项目标题。 */
  title?: string;
  /** 首个页面的尺寸。 */
  slideSize?: Partial<ProjectCanvasSize>;
}

/** 首页新建项目弹窗使用的尺寸预设。 */
export interface ProjectSizePreset extends ProjectCanvasSize {
  /** 预设唯一标识。 */
  id: string;
  /** 预设标题。 */
  label: string;
  /** 预设比例标签。 */
  ratioLabel: string;
  /** 预设补充说明。 */
  description: string;
}

/** 页面宽度的下限，避免创建出不可编辑的超窄画布。 */
export const MIN_PROJECT_SLIDE_WIDTH = 320;

/** 页面高度的下限，避免创建出不可编辑的超矮画布。 */
export const MIN_PROJECT_SLIDE_HEIGHT = 180;

/** 新建项目时的默认标题。 */
export const DEFAULT_PROJECT_TITLE = "未命名课件";

/** 新建项目默认采用的宽屏尺寸。 */
export const DEFAULT_PROJECT_SLIDE_SIZE: ProjectCanvasSize = {
  width: 1280,
  height: 720,
};

/** 首页新建项目提供的尺寸预设列表。 */
export const PROJECT_SIZE_PRESETS: readonly ProjectSizePreset[] = [
  {
    id: "widescreen",
    label: "宽屏课件",
    ratioLabel: "16:9",
    description: "适合投屏讲解与大多数课堂大屏场景。",
    width: 1280,
    height: 720,
  },
  {
    id: "classic",
    label: "经典课件",
    ratioLabel: "4:3",
    description: "兼容传统教室白板和较旧的投影设备。",
    width: 1024,
    height: 768,
  },
  {
    id: "portrait",
    label: "竖屏讲解",
    ratioLabel: "9:16",
    description: "适合移动端录课、竖屏讲义和短视频课件。",
    width: 1080,
    height: 1920,
  },
  {
    id: "custom",
    label: "自定义",
    ratioLabel: "自由比例",
    description: "手动输入页面宽高，适配特殊画布需求。",
    width: DEFAULT_PROJECT_SLIDE_SIZE.width,
    height: DEFAULT_PROJECT_SLIDE_SIZE.height,
  },
] as const;

/** 默认选中的尺寸预设 id。 */
export const DEFAULT_PROJECT_SIZE_PRESET_ID = PROJECT_SIZE_PRESETS[0].id;

/** 规范化标题，避免出现空项目名。 */
export function normalizeProjectTitle(title?: string): string {
  return title?.trim() || DEFAULT_PROJECT_TITLE;
}

/** 把单个尺寸值约束到可编辑的有效区间内。 */
function normalizeProjectSizeValue(value: number | undefined, fallback: number, minimum: number): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.max(Math.round(parsedValue), minimum);
}

/** 规范化页面尺寸，确保创建链路和展示文案共用同一套尺寸基线。 */
export function normalizeProjectSlideSize(
  slideSize?: Partial<ProjectCanvasSize> | null,
): ProjectCanvasSize {
  return {
    width: normalizeProjectSizeValue(
      slideSize?.width,
      DEFAULT_PROJECT_SLIDE_SIZE.width,
      MIN_PROJECT_SLIDE_WIDTH,
    ),
    height: normalizeProjectSizeValue(
      slideSize?.height,
      DEFAULT_PROJECT_SLIDE_SIZE.height,
      MIN_PROJECT_SLIDE_HEIGHT,
    ),
  };
}

/** 使用统一格式展示页面尺寸。 */
export function formatProjectCanvasSize(slideSize?: Partial<ProjectCanvasSize> | null): string {
  const normalizedSlideSize = normalizeProjectSlideSize(slideSize);
  return `${normalizedSlideSize.width} × ${normalizedSlideSize.height}`;
}

/** 根据预设 id 解析出对应的尺寸方案。 */
export function resolveProjectSizePreset(presetId?: string): ProjectSizePreset {
  return PROJECT_SIZE_PRESETS.find((preset) => preset.id === presetId) ?? PROJECT_SIZE_PRESETS[0];
}
