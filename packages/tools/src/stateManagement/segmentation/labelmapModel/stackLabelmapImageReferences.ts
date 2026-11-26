import { cache, type Types } from '@cornerstonejs/core';
import type { LabelmapLayer } from '../../../types/LabelmapTypes';
import { forEachLabelmapImageReference } from './labelmapImageIdMapping';
import OverlayImageCandidates from './overlayImageCandidates';

type ImageIdSource = {
  imageIds?: string[];
  volumeId?: string;
};

/**
 * The facts that the labelmap images of the images of a stack are made of:
 * the image ids of the stack (when they count), and the image ids and
 * referenced image ids of each labelmap layer, and the image ids of its
 * volume, each array by its identity and its length. A change of
 * the state of a segmentation copies its arrays, and a labelmap image that is
 * added to a layer in place changes its length, so a change of one of them
 * gives another signature. Reading it costs a few reads for each layer, not
 * one for each image.
 */
function getSignature(
  stackImageIds: string[] | undefined,
  sources: ReadonlyArray<ImageIdSource & { referencedImageIds?: string[] }>
): unknown[] {
  const signature: unknown[] = [stackImageIds, stackImageIds?.length];

  sources.forEach((source) => {
    const volumeImageIds = source.volumeId
      ? (cache.getVolume(source.volumeId) as Types.IImageVolume)?.imageIds
      : undefined;

    signature.push(
      source.imageIds,
      source.imageIds?.length,
      source.referencedImageIds,
      source.referencedImageIds?.length,
      volumeImageIds,
      volumeImageIds?.length
    );
  });

  return signature;
}

function isSameSignature(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * The image ids of a labelmap layer or of the legacy labelmap data: its own
 * image ids, else those of its volume.
 */
function getSourceImageIds(source: ImageIdSource): string[] {
  if (source.imageIds?.length) {
    return source.imageIds;
  }

  if (source.volumeId) {
    return (
      (cache.getVolume(source.volumeId) as Types.IImageVolume)?.imageIds ?? []
    );
  }

  return [];
}

type ViewableCheck = (
  viewReference: Types.ViewReference,
  options?: Types.ReferenceCompatibleOptions
) => unknown;

/**
 * One check of a viewport for the references of one image: the check of
 * `getReferenceViewableCheck`, which reads the view once, where the viewport
 * has it.
 */
function createViewableCheck(viewport: Types.IViewport): () => ViewableCheck {
  let check: ViewableCheck;

  return () => {
    check ??=
      viewport.getReferenceViewableCheck?.() ??
      ((viewReference, options) =>
        viewport.isReferenceViewable(viewReference, options));

    return check;
  };
}

/**
 * The labelmap images of each image of a stack, for one viewport and one
 * segmentation, as `getCurrentLabelmapImageIdsForViewport` gives them for the
 * image on display: for each layer, the images that reference the image,
 * else the image at the index of the image in the stack, else the first image
 * of the layer that the viewport takes as an overlay of it. It is made for
 * the image ids of the stack and of the layers (`getSignature`), and its maps
 * are made at their first use, so a scroll looks the image up and reads the
 * metadata of at most the image and the few labelmap images on its plane,
 * whatever the number of labelmap images.
 */
export class StackLabelmapImageReferences {
  readonly signature: unknown[];
  private readonly stackImageIds: string[];
  private readonly layers: LabelmapLayer[];
  private imageIndexByImageId?: Map<string, number>;
  private readonly referencesByLayer: Array<Map<string, string[]>> = [];
  private readonly candidatesByLayer: OverlayImageCandidates[] = [];

  constructor(stackImageIds: string[], layers: LabelmapLayer[]) {
    this.stackImageIds = stackImageIds ?? [];
    this.layers = layers;
    this.signature = getSignature(stackImageIds, layers);
  }

  isFor(stackImageIds: string[], layers: LabelmapLayer[]): boolean {
    return isSameSignature(this.signature, getSignature(stackImageIds, layers));
  }

  /** The index of an image in the stack, its first one, or -1. */
  getImageIndex(imageId: string): number {
    if (!this.imageIndexByImageId) {
      this.imageIndexByImageId = new Map();
      this.stackImageIds.forEach((stackImageId, index) => {
        if (!this.imageIndexByImageId.has(stackImageId)) {
          this.imageIndexByImageId.set(stackImageId, index);
        }
      });
    }

    return this.imageIndexByImageId.get(imageId) ?? -1;
  }

  /** The labelmap images of an image of the stack, each once. */
  getLabelmapImageIds(imageId: string, viewport: Types.IViewport): string[] {
    const currentIndex = this.getImageIndex(imageId);
    const getCheck = createViewableCheck(viewport);
    const labelmapImageIds: string[] = [];

    this.layers.forEach((layer, layerIndex) => {
      const referencedLabelmapImageIds =
        this.getReferences(layerIndex).get(imageId) ?? [];

      if (referencedLabelmapImageIds.length) {
        labelmapImageIds.push(...referencedLabelmapImageIds);
        return;
      }

      if (currentIndex !== -1 && layer.imageIds?.[currentIndex]) {
        labelmapImageIds.push(layer.imageIds[currentIndex]);
        return;
      }

      const viewableImageId = this.getCandidates(layerIndex)
        .getCandidatePositions(imageId)
        .map((position) => layer.imageIds[position])
        .find((candidateImageId) =>
          getCheck()(
            { referencedImageId: candidateImageId },
            { asOverlay: true }
          )
        );

      if (viewableImageId) {
        labelmapImageIds.push(viewableImageId);
      }
    });

    return Array.from(new Set(labelmapImageIds));
  }

  private getReferences(layerIndex: number): Map<string, string[]> {
    let references = this.referencesByLayer[layerIndex];

    if (!references) {
      references = new Map();
      forEachLabelmapImageReference(
        this.layers[layerIndex],
        (referencedImageId, labelmapImageId) => {
          const imageIds = references.get(referencedImageId) ?? [];

          imageIds.push(labelmapImageId);
          references.set(referencedImageId, imageIds);
        }
      );
      this.referencesByLayer[layerIndex] = references;
    }

    return references;
  }

  private getCandidates(layerIndex: number): OverlayImageCandidates {
    this.candidatesByLayer[layerIndex] ??= new OverlayImageCandidates(
      this.layers[layerIndex].imageIds ?? []
    );

    return this.candidatesByLayer[layerIndex];
  }
}

/**
 * The labelmap images of a segmentation, all its layers together and each
 * image once, that a viewport takes as an overlay of an image, as
 * `updateLabelmapSegmentationImageReferences` gives them for the image on
 * display. Made for the image ids of the layers, it keeps the answer for each
 * image, and finds the images to check by their URI and plane
 * (`OverlayImageCandidates`), not by a check of every labelmap image.
 */
export class ViewableLabelmapImages {
  readonly signature: unknown[];
  private readonly sources: ImageIdSource[];
  private labelmapImageIds?: string[];
  private candidates?: OverlayImageCandidates;
  private readonly viewableByImageId = new Map<string, string[]>();

  constructor(sources: ImageIdSource[]) {
    this.sources = sources;
    this.signature = getSignature(undefined, sources);
  }

  isFor(sources: ImageIdSource[]): boolean {
    return isSameSignature(this.signature, getSignature(undefined, sources));
  }

  /** The labelmap images of all layers, each once, in the order of the layers. */
  getLabelmapImageIds(): string[] {
    this.labelmapImageIds ??= Array.from(
      new Set(
        this.sources
          .flatMap((source) => getSourceImageIds(source))
          .filter(Boolean)
      )
    );

    return this.labelmapImageIds;
  }

  /**
   * The labelmap images that the viewport takes as an overlay of an image of
   * its stack, in the order of `getLabelmapImageIds`.
   */
  getViewableImageIds(imageId: string, viewport: Types.IViewport): string[] {
    let viewableImageIds = this.viewableByImageId.get(imageId);

    if (!viewableImageIds) {
      const labelmapImageIds = this.getLabelmapImageIds();
      const getCheck = createViewableCheck(viewport);

      this.candidates ??= new OverlayImageCandidates(labelmapImageIds);
      viewableImageIds = this.candidates
        .getCandidatePositions(imageId)
        .map((position) => labelmapImageIds[position])
        .filter((labelmapImageId) =>
          getCheck()(
            { referencedImageId: labelmapImageId },
            { asOverlay: true }
          )
        );
      this.viewableByImageId.set(imageId, viewableImageIds);
    }

    return viewableImageIds;
  }
}

/**
 * The sources of the labelmap images of the labelmap data of a segmentation,
 * as `getLabelmapImageIds` of the resolver reads them: its layers, else the
 * image ids or the volume of the legacy data.
 */
export function getLabelmapImageIdSources(
  labelmapData: ImageIdSource & {
    labelmaps?: Record<string, ImageIdSource>;
  }
): ImageIdSource[] {
  if (labelmapData.labelmaps) {
    return Object.values(labelmapData.labelmaps);
  }

  return [labelmapData];
}
