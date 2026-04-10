import {
  COMMAND_TYPES,
  createImageNode,
  EditorController,
  type DiagnosticLogContext,
  type DiagnosticLogLevel,
  type DiagnosticLogger,
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
  /** 外部注入的统一诊断 logger。 */
  diagnosticLogger?: DiagnosticLogger | null;
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

  /** 统一拼装图片链路的最小日志上下文。 */
  const buildDiagnosticContext = (
    context: DiagnosticLogContext = {},
  ): DiagnosticLogContext => ({
    projectId: options.snapshot.value.document.meta.id,
    slideId: resolveActiveSlideId(),
    ...context,
  });

  /** 按级别把图片链路的日志写入统一 logger。 */
  const writeDiagnosticLog = (
    level: DiagnosticLogLevel,
    payload: {
      event: string;
      message: string;
      context?: DiagnosticLogContext;
      error?: unknown;
    },
  ) => {
    if (!options.diagnosticLogger) {
      return;
    }

    const nextPayload = {
      ...payload,
      context: buildDiagnosticContext(payload.context),
    };

    switch (level) {
      case "debug":
        options.diagnosticLogger.debug(nextPayload);
        break;
      case "warn":
        options.diagnosticLogger.warn(nextPayload);
        break;
      case "error":
        options.diagnosticLogger.error(nextPayload);
        break;
      case "info":
      default:
        options.diagnosticLogger.info(nextPayload);
        break;
    }
  };

  /** 把本地图片文件转换成标准图片节点并插入当前页面。 */
  const addImageFromFile = async (file: File): Promise<string | null> => {
    const slideId = resolveActiveSlideId();
    if (!slideId) {
      writeDiagnosticLog("warn", {
        event: "image.import.skipped",
        message: "图片导入已跳过，因为当前没有可写入的页面",
        context: {
          fileName: file.name,
        },
      });
      return null;
    }

    try {
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
        type: COMMAND_TYPES.NODE_CREATE,
        slideId,
        node,
        index: options.activeSlide.value?.nodes.length,
      });
      options.controller.execute({
        type: COMMAND_TYPES.SELECTION_SET,
        slideId,
        nodeIds: [node.id],
      });

      writeDiagnosticLog("info", {
        event: "image.import.completed",
        message: "已导入本地图片到当前页面",
        context: {
          nodeId: node.id,
          fileName: asset.fileName,
          width: asset.width,
          height: asset.height,
        },
      });

      return node.id;
    } catch (error) {
      writeDiagnosticLog("error", {
        event: "image.import.failed",
        message: "本地图片导入失败",
        context: {
          fileName: file.name,
        },
        error,
      });
      throw error;
    }
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
      writeDiagnosticLog("warn", {
        event: "background.set-from-node.skipped",
        message: "设为背景已跳过，因为当前图片节点不可用",
        context: {
          nodeId,
        },
      });
      return null;
    }

    options.controller.execute({
      type: COMMAND_TYPES.NODE_IMAGE_SET_AS_BACKGROUND,
      slideId,
      nodeId,
      fit: resolveBackgroundImageFit(preferredFit ?? imageNode.props.objectFit),
    });

    writeDiagnosticLog("info", {
      event: "background.set-from-node.completed",
      message: "已通过图片组件写入页面背景",
      context: {
        nodeId,
        fit: resolveBackgroundImageFit(preferredFit ?? imageNode.props.objectFit),
      },
    });

    return normalizedSource;
  };

  /** 用本地图片替换当前页面中的现有图片节点，同时保留布局与样式配置。 */
  const replaceImageFromFile = async (nodeId: string, file: File): Promise<string | null> => {
    const slideId = resolveActiveSlideId();
    const imageNode = resolveImageNode(nodeId);
    if (!slideId || !imageNode) {
      writeDiagnosticLog("warn", {
        event: "image.replace.skipped",
        message: "图片替换已跳过，因为当前节点不可用",
        context: {
          nodeId,
          fileName: file.name,
        },
      });
      return null;
    }

    try {
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
        type: COMMAND_TYPES.NODE_UPDATE,
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
        type: COMMAND_TYPES.SELECTION_SET,
        slideId,
        nodeIds: [nodeId],
      });

      writeDiagnosticLog("info", {
        event: "image.replace.completed",
        message: "已替换当前图片组件资源",
        context: {
          nodeId,
          fileName: asset.fileName,
          width: asset.width,
          height: asset.height,
        },
      });

      return nodeId;
    } catch (error) {
      writeDiagnosticLog("error", {
        event: "image.replace.failed",
        message: "图片替换失败",
        context: {
          nodeId,
          fileName: file.name,
        },
        error,
      });
      throw error;
    }
  };

  return {
    addImageFromFile,
    setSlideBackgroundImageFromNode,
    replaceImageFromFile,
  };
}
