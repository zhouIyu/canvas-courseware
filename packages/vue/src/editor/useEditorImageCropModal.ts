import {
  DEFAULT_IMAGE_CROP,
  type ImageCrop,
  type ImageLayoutSize,
  type ImageNode,
  type ObjectFit,
} from "@canvas-courseware/core";
import { computed, ref } from "vue";
import { assertImageFile, readLocalImageAsset } from "./image-file";

/** 当前裁剪弹窗承载的操作模式。 */
type ImageCropModalMode = "import" | "replace" | "recrop";

/** 待执行的图片裁剪动作。 */
interface PendingImageCropAction {
  /** 当前操作模式。 */
  mode: ImageCropModalMode;
  /** 目标节点 id，仅在 replace / recrop 场景下存在。 */
  nodeId: string | null;
  /** 当前图片资源地址。 */
  source: string;
  /** 当前图片资源标签。 */
  sourceLabel: string;
  /** 当前原始图片尺寸。 */
  naturalSize: ImageLayoutSize | null;
  /** 当前适配方式。 */
  objectFit: ObjectFit;
  /** 当前水平翻转状态。 */
  flipX: boolean;
  /** 当前垂直翻转状态。 */
  flipY: boolean;
  /** 当前回显裁剪窗口。 */
  initialCrop: ImageCrop;
  /** 当前本地文件资源，仅在 import / replace 时存在。 */
  file: File | null;
}

/** 图片裁剪弹窗组合式函数的输入参数。 */
export interface UseEditorImageCropModalOptions {
  /** 新建图片节点。 */
  addImageFromFile: (file: File, crop: ImageCrop) => Promise<string | null>;
  /** 替换图片节点资源。 */
  replaceImageFromFile: (nodeId: string, file: File, crop: ImageCrop) => Promise<string | null>;
  /** 直接更新图片节点属性。 */
  updateImageNode: (nodeId: string, patch: { props: { crop: ImageCrop } }) => boolean;
  /** 按节点 id 读取当前图片节点。 */
  resolveImageNode: (nodeId: string) => ImageNode | null;
  /** 按图片地址读取原始尺寸。 */
  readImageNaturalSize: (source: string) => Promise<ImageLayoutSize>;
}

/** 统一承接“选图即裁剪”的弹窗状态。 */
export function useEditorImageCropModal(options: UseEditorImageCropModalOptions) {
  /** 当前待处理的裁剪动作。 */
  const pendingAction = ref<PendingImageCropAction | null>(null);

  /** 当前确认动作是否正在提交。 */
  const isApplyingImageCrop = ref(false);

  /** 当前图片裁剪弹窗是否显示。 */
  const isImageCropModalVisible = computed(() => Boolean(pendingAction.value));

  /** 当前弹窗展示的资源地址。 */
  const imageCropModalSource = computed(() => pendingAction.value?.source ?? "");

  /** 当前弹窗展示的资源说明。 */
  const imageCropModalSourceLabel = computed(
    () => pendingAction.value?.sourceLabel ?? "当前图片",
  );

  /** 当前弹窗展示的默认裁剪值。 */
  const imageCropModalInitialCrop = computed<ImageCrop>(
    () => pendingAction.value?.initialCrop ?? { ...DEFAULT_IMAGE_CROP },
  );

  /** 当前弹窗展示的原始尺寸。 */
  const imageCropModalNaturalSize = computed<ImageLayoutSize | null>(
    () => pendingAction.value?.naturalSize ?? null,
  );

  /** 当前弹窗展示的适配方式。 */
  const imageCropModalObjectFit = computed<ObjectFit>(
    () => pendingAction.value?.objectFit ?? "cover",
  );

  /** 当前弹窗展示的翻转状态。 */
  const imageCropModalFlipX = computed(() => pendingAction.value?.flipX ?? false);

  /** 当前弹窗展示的翻转状态。 */
  const imageCropModalFlipY = computed(() => pendingAction.value?.flipY ?? false);

  /** 当前弹窗标题。 */
  const imageCropModalTitle = computed(() =>
    pendingAction.value?.mode === "recrop" ? "重新裁剪图片" : "裁剪图片",
  );

  /** 当前弹窗确认按钮文案。 */
  const imageCropModalOkText = computed(() => {
    switch (pendingAction.value?.mode) {
      case "replace":
        return "确认更换";
      case "recrop":
        return "确认裁剪";
      case "import":
      default:
        return "确认插入";
    }
  });

  /** 关闭当前裁剪弹窗。 */
  const closeImageCropModal = () => {
    pendingAction.value = null;
    isApplyingImageCrop.value = false;
  };

  /** 打开导入图片裁剪弹窗。 */
  const openImportImageCropModal = async (file: File): Promise<void> => {
    assertImageFile(file);
    const asset = await readLocalImageAsset(file);
    pendingAction.value = {
      mode: "import",
      nodeId: null,
      source: asset.dataUrl,
      sourceLabel: asset.fileName,
      naturalSize: {
        width: asset.width,
        height: asset.height,
      },
      objectFit: "contain",
      flipX: false,
      flipY: false,
      initialCrop: { ...DEFAULT_IMAGE_CROP },
      file,
    };
  };

  /** 打开替换图片裁剪弹窗。 */
  const openReplaceImageCropModal = async (nodeId: string, file: File): Promise<void> => {
    assertImageFile(file);
    const imageNode = options.resolveImageNode(nodeId);
    if (!imageNode) {
      throw new Error("当前图片节点不存在，无法更换图片");
    }

    const asset = await readLocalImageAsset(file);
    pendingAction.value = {
      mode: "replace",
      nodeId,
      source: asset.dataUrl,
      sourceLabel: asset.fileName,
      naturalSize: {
        width: asset.width,
        height: asset.height,
      },
      objectFit: imageNode.props.objectFit ?? "cover",
      flipX: imageNode.props.flipX ?? false,
      flipY: imageNode.props.flipY ?? false,
      initialCrop: { ...DEFAULT_IMAGE_CROP },
      file,
    };
  };

  /** 打开已有图片的重新裁剪弹窗。 */
  const openRecropImageModal = async (nodeId: string): Promise<void> => {
    const imageNode = options.resolveImageNode(nodeId);
    if (!imageNode) {
      throw new Error("当前图片节点不存在，无法重新裁剪");
    }

    const normalizedSource = imageNode.props.src.trim();
    const naturalSize =
      normalizedSource.length > 0
        ? await options.readImageNaturalSize(normalizedSource)
        : null;

    pendingAction.value = {
      mode: "recrop",
      nodeId,
      source: imageNode.props.src,
      sourceLabel: imageNode.props.alt?.trim() || imageNode.name,
      naturalSize,
      objectFit: imageNode.props.objectFit ?? "cover",
      flipX: imageNode.props.flipX ?? false,
      flipY: imageNode.props.flipY ?? false,
      initialCrop: imageNode.props.crop ?? { ...DEFAULT_IMAGE_CROP },
      file: null,
    };
  };

  /** 确认执行当前裁剪动作。 */
  const handleImageCropConfirm = async (crop: ImageCrop): Promise<void> => {
    const action = pendingAction.value;
    if (!action) {
      return;
    }

    isApplyingImageCrop.value = true;

    try {
      switch (action.mode) {
        case "import":
          if (!action.file) {
            throw new Error("当前图片资源不存在，无法插入");
          }
          await options.addImageFromFile(action.file, crop);
          break;
        case "replace":
          if (!action.file || !action.nodeId) {
            throw new Error("当前图片资源不存在，无法更换");
          }
          await options.replaceImageFromFile(action.nodeId, action.file, crop);
          break;
        case "recrop":
          if (!action.nodeId) {
            throw new Error("当前图片节点不存在，无法裁剪");
          }

          if (!options.updateImageNode(action.nodeId, { props: { crop } })) {
            throw new Error("当前图片节点不存在，无法裁剪");
          }
          break;
        default:
          break;
      }

      closeImageCropModal();
    } finally {
      isApplyingImageCrop.value = false;
    }
  };

  return {
    closeImageCropModal,
    handleImageCropConfirm,
    imageCropModalFlipX,
    imageCropModalFlipY,
    imageCropModalInitialCrop,
    imageCropModalNaturalSize,
    imageCropModalObjectFit,
    imageCropModalOkText,
    imageCropModalSource,
    imageCropModalSourceLabel,
    imageCropModalTitle,
    isApplyingImageCrop,
    isImageCropModalVisible,
    openImportImageCropModal,
    openRecropImageModal,
    openReplaceImageCropModal,
  };
}
