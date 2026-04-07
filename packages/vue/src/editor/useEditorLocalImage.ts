import {
  createImageNode,
  EditorController,
  type EditorSnapshot,
  type ImageNode,
  type Slide,
} from "@canvas-courseware/core";
import type { ComputedRef, ShallowRef } from "vue";
import { readLocalImageAsset, resolveImportedImageLayout } from "./image-file";

/** 本地图片导入 composable 的初始化参数。 */
export interface UseEditorLocalImageOptions {
  /** 标准控制器，用于派发节点新增与选中命令。 */
  controller: EditorController;
  /** 当前编辑器快照。 */
  snapshot: ShallowRef<EditorSnapshot>;
  /** 当前激活的 slide。 */
  activeSlide: ComputedRef<Slide | undefined>;
}

/**
 * 统一封装本地图片导入链路。
 * 这里负责把浏览器文件读取结果转换成标准图片节点，UI 层只需要提供 File 即可。
 */
export function useEditorLocalImage(options: UseEditorLocalImageOptions) {
  /** 读取当前真正可写入节点的 slide id。 */
  const resolveActiveSlideId = () =>
    options.snapshot.value.activeSlideId ?? options.activeSlide.value?.id ?? null;

  /** 从当前激活页面中读取一个图片节点，供换图链路复用。 */
  const resolveActiveImageNode = (nodeId: string): ImageNode | null => {
    const node = options.activeSlide.value?.nodes.find((candidate) => candidate.id === nodeId);
    return node?.type === "image" ? node : null;
  };

  /**
   * 判断当前节点名称是否仍然是默认占位语义。
   * 如果还是默认名，换图时就顺手把名称同步成新图片文件名，方便图层列表识别。
   */
  const shouldReplaceImageNodeName = (node: ImageNode): boolean => {
    const normalizedName = node.name.trim().toLowerCase();
    return normalizedName === "" || normalizedName === "image" || normalizedName === "图片";
  };

  /**
   * 解析换图后的适配方式。
   * 已有图片默认保留原适配方式；只有空占位图第一次接入真实资源时，才回到本地导入图片常用的 contain。
   */
  const resolveNextObjectFit = (node: ImageNode): NonNullable<ImageNode["props"]["objectFit"]> =>
    node.props.src.trim() ? node.props.objectFit ?? "cover" : "contain";

  /** 把本地图片文件转换成标准图片节点并插入当前页面。 */
  const addImageFromFile = async (file: File): Promise<string | null> => {
    const slideId = resolveActiveSlideId();
    if (!slideId) {
      return null;
    }

    const asset = await readLocalImageAsset(file);
    const layout = resolveImportedImageLayout(options.activeSlide.value, asset);
    const node = createImageNode({
      name: asset.label,
      src: asset.dataUrl,
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    });

    node.props.alt = asset.fileName;
    node.props.objectFit = "contain";

    options.controller.execute({
      type: "node.create",
      slideId,
      node,
      index: options.activeSlide.value?.nodes.length,
    });
    options.controller.execute({
      type: "selection.set",
      slideId,
      nodeIds: [node.id],
    });

    return node.id;
  };

  /**
   * 把本地图片文件替换到当前页面的指定图片节点上。
   * 这里只更新资源相关字段，保留节点的位置、尺寸、旋转、层级与时间轴编排配置。
   */
  const replaceImageNodeFromFile = async (nodeId: string, file: File): Promise<string | null> => {
    const slideId = resolveActiveSlideId();
    if (!slideId) {
      return null;
    }

    const imageNode = resolveActiveImageNode(nodeId);
    if (!imageNode) {
      return null;
    }

    const asset = await readLocalImageAsset(file);
    options.controller.execute({
      type: "node.update",
      slideId,
      nodeId,
      patch: {
        name: shouldReplaceImageNodeName(imageNode) ? asset.label : imageNode.name,
        props: {
          ...imageNode.props,
          src: asset.dataUrl,
          alt: asset.fileName,
          objectFit: resolveNextObjectFit(imageNode),
        },
      },
    });
    options.controller.execute({
      type: "selection.set",
      slideId,
      nodeIds: [nodeId],
    });

    return nodeId;
  };

  return {
    addImageFromFile,
    replaceImageNodeFromFile,
  };
}
