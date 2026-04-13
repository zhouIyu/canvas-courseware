import type { Canvas, FabricObject } from "fabric";
import type { CoursewareDocument } from "@canvas-courseware/core";
import type { FabricRenderableObject } from "../object-factory";
import type {
  FabricPlayerAdapterOptions,
  FabricPlayerAdapterState,
  FabricPlayerStateListener,
} from "../player-adapter-types";

/** 播放态 Fabric 对象需要暴露的几何能力。 */
export type FabricPlaybackObject = FabricRenderableObject & {
  /** 读取对象缩放后的宽度。 */
  getScaledWidth?: () => number;
  /** 读取对象缩放后的高度。 */
  getScaledHeight?: () => number;
};

/** 播放器适配器内部统一维护的可变运行时上下文。 */
export interface FabricPlayerAdapterContext {
  /** 当前挂载的 Fabric 画布实例。 */
  canvas: Canvas | null;
  /** 当前正在消费的文档。 */
  document: CoursewareDocument | null;
  /** 当前激活的 slide id。 */
  currentSlideId: string | null;
  /** 是否把画布点击绑定为播放触发入口。 */
  bindCanvasClick: boolean;
  /** 是否允许自动触发步骤。 */
  enableAutoTrigger: boolean;
  /** 节点 id 到播放对象的映射。 */
  readonly objectMap: Map<string, FabricPlaybackObject>;
  /** Fabric 对象到节点 id 的反向映射。 */
  readonly objectNodeMap: WeakMap<FabricObject, string>;
  /** 当前状态订阅监听器集合。 */
  readonly listeners: Set<FabricPlayerStateListener>;
  /** 自动触发步骤使用的定时器。 */
  autoTimer: ReturnType<typeof setTimeout> | null;
  /** 用于避免异步渲染串扰的同步版本号。 */
  syncVersion: number;
  /** 当前播放器对外暴露的状态快照。 */
  state: FabricPlayerAdapterState;
}

/** 创建播放器适配器默认运行时上下文。 */
export function createFabricPlayerAdapterContext(
  options: FabricPlayerAdapterOptions = {},
): FabricPlayerAdapterContext {
  const document = options.document ?? null;
  const slideId = options.slideId ?? document?.slides[0]?.id ?? null;

  return {
    canvas: null,
    document,
    currentSlideId: slideId,
    bindCanvasClick: options.bindCanvasClick ?? true,
    enableAutoTrigger: options.enableAutoTrigger ?? true,
    objectMap: new Map<string, FabricPlaybackObject>(),
    objectNodeMap: new WeakMap<FabricObject, string>(),
    listeners: new Set<FabricPlayerStateListener>(),
    autoTimer: null,
    syncVersion: 0,
    state: {
      document,
      slideId,
      stepIndex: 0,
      status: "idle",
      nextTrigger: null,
    },
  };
}
