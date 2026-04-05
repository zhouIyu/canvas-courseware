import type { CoursewareDocument, EditorSnapshot, PlaybackState, Slide } from "../schema";
import { clamp, findSlide, insertAt } from "./shared";

/** 基于一份文档创建可直接进入编辑态的初始快照。 */
export function createSnapshotForDocument(document: CoursewareDocument): EditorSnapshot {
  const activeSlideId = document.slides[0]?.id ?? null;

  return {
    document,
    activeSlideId,
    selection: {
      slideId: activeSlideId,
      nodeIds: [],
    },
    playback: {
      slideId: activeSlideId,
      stepIndex: 0,
      status: "idle",
    },
  };
}

/** 把新 slide 插入到文档中，并在需要时补齐激活页与播放态。 */
export function insertSlide(
  snapshot: EditorSnapshot,
  slide: Slide,
  index?: number,
): EditorSnapshot {
  const nextSlides = insertAt(snapshot.document.slides, slide, index);
  const nextDocument = { ...snapshot.document, slides: nextSlides };
  const activeSlideId = snapshot.activeSlideId ?? slide.id;

  return {
    ...snapshot,
    document: nextDocument,
    activeSlideId,
    selection: snapshot.activeSlideId
      ? snapshot.selection
      : {
          slideId: slide.id,
          nodeIds: [],
        },
    playback: snapshot.playback.slideId
      ? snapshot.playback
      : {
          slideId: slide.id,
          stepIndex: 0,
          status: "idle",
        },
  };
}

/** 更新 slide 的基础元信息。 */
export function updateSlide(
  snapshot: EditorSnapshot,
  slideId: string,
  patch: Partial<Pick<Slide, "name" | "size" | "background">>,
): EditorSnapshot {
  let changed = false;
  const nextSlides = snapshot.document.slides.map((slide) => {
    if (slide.id !== slideId) {
      return slide;
    }

    changed = true;
    return {
      ...slide,
      name: patch.name ?? slide.name,
      size: patch.size ? { ...slide.size, ...patch.size } : slide.size,
      background: patch.background
        ? { ...slide.background, ...patch.background }
        : slide.background,
    };
  });

  if (!changed) {
    return snapshot;
  }

  return {
    ...snapshot,
    document: { ...snapshot.document, slides: nextSlides },
  };
}

/** 删除一个 slide，并把激活页、选择态和播放态回退到可用页。 */
export function deleteSlide(snapshot: EditorSnapshot, slideId: string): EditorSnapshot {
  const index = snapshot.document.slides.findIndex((slide) => slide.id === slideId);

  if (index === -1) {
    return snapshot;
  }

  const nextSlides = snapshot.document.slides.filter((slide) => slide.id !== slideId);
  const nextDocument = { ...snapshot.document, slides: nextSlides };
  const fallbackSlideId = nextSlides[Math.min(index, nextSlides.length - 1)]?.id ?? null;
  const activeSlideId =
    snapshot.activeSlideId === slideId ? fallbackSlideId : snapshot.activeSlideId;
  const selection =
    snapshot.selection.slideId === slideId
      ? {
          slideId: activeSlideId,
          nodeIds: [],
        }
      : snapshot.selection;
  const playback =
    snapshot.playback.slideId === slideId
      ? ({
          slideId: fallbackSlideId,
          stepIndex: 0,
          status: "idle",
        } satisfies PlaybackState)
      : snapshot.playback;

  return {
    ...snapshot,
    document: nextDocument,
    activeSlideId,
    selection,
    playback,
  };
}

/** 切换当前激活的 slide，同时清空该页的节点选择。 */
export function activateSlide(snapshot: EditorSnapshot, slideId: string): EditorSnapshot {
  if (snapshot.activeSlideId === slideId || !findSlide(snapshot.document, slideId)) {
    return snapshot;
  }

  return {
    ...snapshot,
    activeSlideId: slideId,
    selection: {
      slideId,
      nodeIds: [],
    },
  };
}

/** 按最终索引重排 slide 顺序，供拖拽排序复用。 */
export function reorderSlide(
  snapshot: EditorSnapshot,
  slideId: string,
  index: number,
): EditorSnapshot {
  const currentIndex = snapshot.document.slides.findIndex((slide) => slide.id === slideId);
  if (currentIndex === -1) {
    return snapshot;
  }

  const targetIndex = clamp(index, 0, snapshot.document.slides.length - 1);
  if (targetIndex === currentIndex) {
    return snapshot;
  }

  const nextSlides = [...snapshot.document.slides];
  const [slide] = nextSlides.splice(currentIndex, 1);
  nextSlides.splice(targetIndex, 0, slide);

  return {
    ...snapshot,
    document: {
      ...snapshot.document,
      slides: nextSlides,
    },
  };
}
