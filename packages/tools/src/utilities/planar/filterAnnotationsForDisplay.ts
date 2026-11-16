import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import filterAnnotationsWithinSlice from './filterAnnotationsWithinSlice';
import getViewportICamera from '../getViewportICamera';
import type { Annotations } from '../../types';

/**
 * Given the viewport and the annotations, it filters the annotations array and only
 * return those annotation that should be displayed on the viewport.
 * A viewport that checks references by `isReferenceViewable` also gets the
 * handle points of each annotation in the `points` option.
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
  if (csUtils.getViewportContentMode(viewport) === 'volume') {
    // Native PLANAR_NEXT viewports do not implement getCamera(); the ICamera
    // bridge derives the equivalent { viewPlaneNormal, focalPoint, ... } from the
    // resolved view / view reference. Legacy VolumeViewport returns its camera.
    const camera = csUtils.isGenericViewport(viewport)
      ? (getViewportICamera(viewport) as Types.ICamera)
      : viewport.getCamera();

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
  if (
    csUtils.viewportIsInStackMode(viewport) &&
    !csUtils.isGenericViewport(viewport)
  ) {
    // 1. Get the currently displayed imageId from the StackViewport
    const imageId = (viewport as Types.IStackViewport).getCurrentImageId();

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
    const points = annotation.data?.handles?.points;

    return viewport.isReferenceViewable(
      annotation.metadata,
      points?.length ? { ...filterOptions, points } : filterOptions
    );
  });
}
