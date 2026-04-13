import type { EditorController } from "@canvas-courseware/core";

/** 编辑器右键菜单请求的标准化载荷。 */
export interface FabricEditorContextMenuRequest {
  /** 右键时的视口 X 坐标。 */
  clientX: number;
  /** 右键时的视口 Y 坐标。 */
  clientY: number;
  /** 当前命中的 slide id。 */
  slideId: string | null;
  /** 当前命中的节点 id；空值表示点在空白区域。 */
  nodeId: string | null;
  /** 当前右键菜单对应的标准选中节点集合。 */
  selectionNodeIds: string[];
}

/** 编辑器适配器挂载时所需的 DOM 与页面信息。 */
export interface FabricEditorAdapterMountOptions {
  /** 真正承载 Fabric 画布的 canvas DOM。 */
  canvasElement: HTMLCanvasElement;
  /** 首次挂载时要打开的页面 id。 */
  slideId?: string;
}

/** 编辑器适配器初始化时可注入的可选能力。 */
export interface FabricEditorAdapterOptions {
  /** 当前适配器要绑定的编辑控制器。 */
  controller?: EditorController;
  /** 适配器默认激活的页面 id。 */
  slideId?: string;
  /** 当编辑器请求展示右键菜单时，向 UI 层抛出的标准化菜单事件。 */
  onContextMenuRequest?: (payload: FabricEditorContextMenuRequest) => void;
}

/** 文本内联编辑浮动工具条所需的定位结果。 */
export interface FabricInlineTextEditingLayout {
  /** 当前正在编辑的 slide id。 */
  slideId: string;
  /** 当前正在编辑的文本节点 id。 */
  nodeId: string;
  /** 文本对象在当前视口中的包围盒。 */
  clientRect: {
    /** 包围盒左边界。 */
    left: number;
    /** 包围盒上边界。 */
    top: number;
    /** 包围盒宽度。 */
    width: number;
    /** 包围盒高度。 */
    height: number;
  };
}
