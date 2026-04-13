import type {
  CoursewareDocument,
  PlaybackState,
  StepTrigger,
} from "@canvas-courseware/core";

/** 预览适配器初始化时可注入的可选能力。 */
export interface FabricPlayerAdapterOptions {
  /** 当前预览要消费的文档。 */
  document?: CoursewareDocument | null;
  /** 当前预览默认打开的页面 id。 */
  slideId?: string | null;
  /** 是否把画布点击绑定为播放触发入口。 */
  bindCanvasClick?: boolean;
  /** 是否允许自动触发步骤。 */
  enableAutoTrigger?: boolean;
}

/** 预览适配器挂载时所需的 DOM 与页面信息。 */
export interface FabricPlayerMountOptions {
  /** 真正承载 Fabric 画布的 canvas DOM。 */
  canvasElement: HTMLCanvasElement;
  /** 挂载时可覆盖当前文档。 */
  document?: CoursewareDocument | null;
  /** 挂载时可覆盖当前页面。 */
  slideId?: string | null;
}

/** 预览适配器对外暴露的运行态快照。 */
export interface FabricPlayerAdapterState {
  /** 当前正在消费的文档引用。 */
  document: CoursewareDocument | null;
  /** 当前激活的页面 id。 */
  slideId: string | null;
  /** 当前已经执行完成的步骤索引。 */
  stepIndex: number;
  /** 当前播放状态。 */
  status: PlaybackState["status"];
  /** 下一步等待的触发类型。 */
  nextTrigger: StepTrigger["type"] | null;
}

/** 预览适配器状态订阅监听器。 */
export type FabricPlayerStateListener = (state: FabricPlayerAdapterState) => void;
