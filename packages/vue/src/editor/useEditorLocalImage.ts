import { createImageNode, EditorController, type EditorSnapshot, type Slide } from "@canvas-courseware/core";
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

  /** 按节点 id 读取当前激活页面中的图片节点。 */
  const resolveImageNode = (nodeId: string) => {
    const imageNode = options.activeSlide.value?.nodes.find((node) => node.id === nodeId);
    return imageNode?.type === "image" ? imageNode : null;
  };

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

  /** 用本地图片替换当前页面中的现有图片节点，同时保留布局与样式配置。 */
  const replaceImageFromFile = async (nodeId: string, file: File): Promise<string | null> => {
    const slideId = resolveActiveSlideId();
    const imageNode = resolveImageNode(nodeId);
    if (!slideId || !imageNode) {
      return null;
    }

    const asset = await readLocalImageAsset(file);

    options.controller.execute({
      type: "node.update",
      slideId,
      nodeId,
      patch: {
        props: {
          src: asset.dataUrl,
          alt: asset.fileName,
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
    replaceImageFromFile,
  };
}
