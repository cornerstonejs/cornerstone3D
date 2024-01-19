import { getEnabledElements, utilities as csUtils } from '@cornerstonejs/core';
import type { Annotation } from '../types';

const { isEqual } = csUtils;

/**
 * Finds a matching viewport in terms of the orientation of the annotation data
 * and the frame of reference.  This doesn't mean the annotation IS being displayed
 * in the viewport, just that it could be by navigating the slice, and/or pan/zoom,
 * without changing the orientation.
 *
 * @param annotation - to find a viewport that it could display in
 * @returns The viewport to display in
 */
export default function getMatchingViewport(annotation: Annotation) {
  const { metadata } = annotation;
  const enabledElement = getEnabledElements().find((enabledElement) => {
    if (enabledElement.FrameOfReferenceUID === metadata.FrameOfReferenceUID) {
      const viewport = enabledElement.viewport;
      const { viewPlaneNormal, viewUp } = viewport.getCamera();
      return (
        isEqual(viewPlaneNormal, metadata.viewPlaneNormal) &&
        (!metadata.viewUp || isEqual(viewUp, metadata.viewUp))
      );
    }
    return;
  });
  return enabledElement?.viewport;
}
