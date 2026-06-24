import type { Types } from '@cornerstonejs/core';
import { getSegmentation } from '../getSegmentation';
import { getLabelmaps } from '../labelmapModel';

/**
 * Determines whether a viewport is a suitable destination for a labelmap
 * segmentation, i.e. whether it actually displays any of the images the labelmap
 * applies to.
 *
 * A labelmap carries `referencedImageIds` (the source series it was derived
 * from). A viewport (stack or volume) that shows none of those images - e.g. a
 * different series that merely shares a frame of reference, or an unrelated
 * single-image series - is not a suitable destination: rendering the labelmap
 * there mounts nothing useful while still disturbing that viewport (blanking it
 * in the shared rendering engine, or corrupting its image-index overlay).
 *
 * Returns `true` when the suitability cannot be determined (no referenced images
 * known, or the viewport's images are not loaded yet) so callers never wrongly
 * suppress a representation that may legitimately belong.
 */
export function viewportReferencesSegmentationImages(
  viewport: Types.IViewport | undefined,
  segmentationId: string
): boolean {
  if (!viewport) {
    return true;
  }

  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return true;
  }

  const referencedImageIds = getLabelmaps(segmentation).flatMap(
    (layer) => layer.referencedImageIds ?? layer.imageIds ?? []
  );

  if (!referencedImageIds.length) {
    return true;
  }

  const viewportImageIds =
    (viewport as { getImageIds?: () => string[] }).getImageIds?.() ?? [];

  if (!viewportImageIds.length) {
    return true;
  }

  const referencedImageIdSet = new Set(referencedImageIds);
  return viewportImageIds.some((imageId) => referencedImageIdSet.has(imageId));
}
