import type { LabelmapLayer } from '../../../types/LabelmapTypes';

function getReferencedImageIdForImageIndex(
  layer: LabelmapLayer,
  imageIndex: number
): string | undefined {
  const imageIds = layer.imageIds ?? [];
  const referencedImageIds = layer.referencedImageIds ?? imageIds;

  if (!referencedImageIds.length) {
    return;
  }

  if (
    layer.referencedImageIds?.length &&
    imageIds.length > referencedImageIds.length &&
    imageIds.length % referencedImageIds.length === 0
  ) {
    return referencedImageIds[imageIndex % referencedImageIds.length];
  }

  return referencedImageIds[imageIndex];
}

function forEachLabelmapImageReference(
  layer: LabelmapLayer,
  callback: (
    referencedImageId: string,
    labelmapImageId: string,
    imageIndex: number
  ) => void
): void {
  layer.imageIds?.forEach((labelmapImageId, imageIndex) => {
    const referencedImageId = getReferencedImageIdForImageIndex(
      layer,
      imageIndex
    );

    if (!referencedImageId || !labelmapImageId) {
      return;
    }

    callback(referencedImageId, labelmapImageId, imageIndex);
  });
}

function getLabelmapImageIdsForReferencedImageId(
  layer: LabelmapLayer,
  referencedImageId: string
): string[] {
  const imageIds: string[] = [];

  forEachLabelmapImageReference(layer, (candidateReference, imageId) => {
    if (candidateReference === referencedImageId) {
      imageIds.push(imageId);
    }
  });

  return imageIds;
}

function hasMultipleLabelmapImagesPerReferencedImageId(
  layer: LabelmapLayer
): boolean {
  const imageIdsByReference = new Map<string, number>();

  forEachLabelmapImageReference(layer, (referencedImageId) => {
    imageIdsByReference.set(
      referencedImageId,
      (imageIdsByReference.get(referencedImageId) ?? 0) + 1
    );
  });

  return Array.from(imageIdsByReference.values()).some((count) => count > 1);
}

export {
  forEachLabelmapImageReference,
  getLabelmapImageIdsForReferencedImageId,
  getReferencedImageIdForImageIndex,
  hasMultipleLabelmapImagesPerReferencedImageId,
};
