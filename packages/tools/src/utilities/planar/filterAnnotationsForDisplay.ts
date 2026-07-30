import type { Types } from '@cornerstonejs/core';
import {
  StackViewport,
  VolumeViewport,
  utilities as csUtils,
} from '@cornerstonejs/core';

import filterAnnotationsWithinSlice from './filterAnnotationsWithinSlice';
import getViewportICamera from '../getViewportICamera';
import type { Annotations } from '../../types';

/**
 * Given the viewport and the annotations, it filters the annotations array and only
 * return those annotation that should be displayed on the viewport
 * @param annotations - Annotations
 * @returns A filtered version of the annotations.
 */
export default function filterAnnotationsForDisplay(
  viewport: Types.IViewport,
  annotations: Annotations,
  filterOptions: Types.ReferenceCompatibleOptions = {}
): Annotations {
  // Volume-backed viewports project annotations GEOMETRICALLY: an annotation
  // drawn on any viewport sharing the volume / frame of reference renders onto
  // this slice when it lies within it (parallel plane + world-space proximity).
  // This covers both the legacy VolumeViewport and native volume-mode
  // PLANAR_NEXT viewports (MPR). Native volume-mode MUST use this geometric path
  // rather than the index-based isReferenceViewable below: a measurement drawn
  // in vtkImage/stack mode carries a STACK sliceIndex that never matches the MPR
  // volume's currentImageIdIndex, so the index check rejects it -- but the
  // world-space slice proximity still holds, so the geometric path renders it
  // across to MPR exactly as legacy did. (ohifohifnextapi-23b)
  const isLegacyVolume = viewport instanceof VolumeViewport;
  // Scope to volume-SLICE mode ('volume'), not 'volume3d': legacy's
  // `instanceof VolumeViewport` is false for the 3D viewport (VolumeViewport3D
  // is a sibling under BaseVolumeViewport), so legacy never routed 3D through
  // the geometric path. Matching that keeps native 3D annotation handling on
  // its existing isReferenceViewable path.
  const isNativeVolume = csUtils.getViewportContentMode(viewport) === 'volume';

  if (isLegacyVolume || isNativeVolume) {
    // Native PLANAR_NEXT viewports do not implement getCamera(); the ICamera
    // bridge derives the equivalent { viewPlaneNormal, focalPoint, ... } from the
    // resolved view / view reference. Legacy VolumeViewport returns its camera.
    const camera = isLegacyVolume
      ? viewport.getCamera()
      : (getViewportICamera(viewport) as Types.ICamera);

    const { spacingInNormalDirection } =
      csUtils.getTargetVolumeAndSpacingInNormalDir(
        viewport as Types.IVolumeViewport,
        camera
      );

    // Get data with same normal and within the same slice
    return filterAnnotationsWithinSlice(
      annotations,
      camera,
      spacingInNormalDirection
    );
  }
  if (viewport instanceof StackViewport) {
    // 1. Get the currently displayed imageId from the StackViewport
    const imageId = viewport.getCurrentImageId();

    if (!imageId) {
      return [];
    }

    // 2. remove the dataLoader scheme since it might be an annotation that was
    // created on the volumeViewport initially and has the volumeLoader scheme
    // but shares the same imageId
    const colonIndex = imageId.indexOf(':');

    filterOptions.imageURI = imageId.substring(colonIndex + 1);
  }
  return annotations.filter((annotation) => {
    if (!annotation.isVisible) {
      return false;
    }
    if (annotation.data.isCanvasAnnotation) {
      return true;
    }
    return viewport.isReferenceViewable(annotation.metadata, filterOptions);
  });
}
