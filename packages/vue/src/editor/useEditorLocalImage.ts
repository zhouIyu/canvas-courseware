import {
  createImageNode,
  EditorController,
  type EditorSnapshot,
  type ObjectFit,
  type Slide,
} from "@canvas-courseware/core";
import type { ComputedRef, ShallowRef } from "vue";
import {
  readLocalImageAsset,
  resolveImageSourceSyncPatch,
  resolveImportedImageLayout,
} from "./image-file";

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

  /** 读取当前真正可更新背景配置的 slide。 */
  const resolveActiveSlide = () => options.activeSlide.value ?? null;

  /** 按节点 id 读取当前激活页面中的图片节点。 */
  const resolveImageNode = (nodeId: string) => {
    const imageNode = options.activeSlide.value?.nodes.find((node) => node.id === nodeId);
    return imageNode?.type === "image" ? imageNode : null;
  };

  /** 在 data URL 场景下回退读取上一版文件名，供默认命名同步判断使用。 */
  const resolvePreviousImageFileName = (nodeId: string): string | null => {
    const imageNode = resolveImageNode(nodeId);
    if (!imageNode || !imageNode.props.src.trim().startsWith("data:")) {
      return null;
    }

    return imageNode.props.alt ?? null;
  };

  /** 解析“设为背景”时最终应采用的填充方式。 */
  const resolveBackgroundImageFit = (preferredFit?: ObjectFit | null): ObjectFit =>
    preferredFit ?? resolveActiveSlide()?.background.image?.fit ?? "cover";

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

  /** 把当前页面中的图片节点直接转换成背景图，并返回最终写入的资源地址。 */
  const setSlideBackgroundImageFromNode = (
    nodeId: string,
    preferredFit?: ObjectFit,
  ): string | null => {
    const slideId = resolveActiveSlideId();
    const imageNode = resolveImageNode(nodeId);
    const normalizedSource = imageNode?.props.src.trim() ?? "";
    if (!slideId || !imageNode || normalizedSource.length === 0) {
      return null;
    }

    options.controller.execute({
      type: "node.image.set-as-background",
      slideId,
      nodeId,
      fit: resolveBackgroundImageFit(preferredFit ?? imageNode.props.objectFit),
    });

    return normalizedSource;
  };

  /** 用本地图片替换当前页面中的现有图片节点，同时保留布局与样式配置。 */
  const replaceImageFromFile = async (nodeId: string, file: File): Promise<string | null> => {
    const slideId = resolveActiveSlideId();
    const imageNode = resolveImageNode(nodeId);
    if (!slideId || !imageNode) {
      return null;
    }

    const asset = await readLocalImageAsset(file);
    const syncPatch = resolveImageSourceSyncPatch({
      currentName: imageNode.name,
      currentAlt: imageNode.props.alt,
      previousSource: imageNode.props.src,
      previousFileName: resolvePreviousImageFileName(nodeId),
      nextSource: asset.dataUrl,
      nextFileName: asset.fileName,
    });
    const nextAlt = syncPatch.alt ?? imageNode.props.alt ?? asset.fileName;

    options.controller.execute({
      type: "node.update",
      slideId,
      nodeId,
      patch: {
        ...(syncPatch.name ? { name: syncPatch.name } : {}),
        props: {
          src: asset.dataUrl,
          alt: nextAlt,
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
    setSlideBackgroundImageFromNode,
    replaceImageFromFile,
  };
}
