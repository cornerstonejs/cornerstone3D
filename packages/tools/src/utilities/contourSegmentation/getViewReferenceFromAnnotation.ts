import type { Types } from '@cornerstonejs/core';
import type { ContourSegmentationAnnotation } from '../../types';

/**
 * Extracts the view reference from a ContourSegmentationAnnotation's metadata.
 * @param annotation The annotation object
 * @returns The view reference object
 */
export function getViewReferenceFromAnnotation(
  annotation: ContourSegmentationAnnotation
): Types.ViewReference {
  const { metadata } = annotation;
  if (!metadata) {
    return {};
  }
  const {
    FrameOfReferenceUID,
    referencedImageId,
    referencedImageURI,
    multiSliceReference,
    cameraFocalPoint,
    viewPlaneNormal,
    viewUp,
    sliceIndex,
    volumeId,
    bounds,
  } = metadata;

  const viewReference: Types.ViewReference = {
    FrameOfReferenceUID,
    referencedImageId,
    referencedImageURI,
    multiSliceReference,
    cameraFocalPoint,
    viewPlaneNormal,
    viewUp,
    sliceIndex,
    volumeId,
    bounds,
  };

  return viewReference;
}
