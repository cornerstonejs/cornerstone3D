import { getEnabledElements, utilities as csUtils } from '@cornerstonejs/core';
import type { Annotation } from '../types';

const { isEqual } = csUtils;

/**
 * Finds a all matching viewports in terms of the orientation of the annotation data
 * and the frame of reference. This doesn't mean the annotation IS being displayed
 * on these viewports, just that it could be by navigating the slice, and/or pan/zoom,
 * without changing the orientation.
 *
 * @param annotation - Annotation to find the viewports that it could display in
 * @returns All viewports to display in
 */
export default function getViewportsForAnnotation(annotation: Annotation) {
  const { metadata } = annotation;

  return getEnabledElements()
    .filter((enabledElement) => {
      if (enabledElement.FrameOfReferenceUID === metadata.FrameOfReferenceUID) {
        const viewport = enabledElement.viewport;
        const { viewPlaneNormal, viewUp } = viewport.getCamera();
        return (
          isEqual(viewPlaneNormal, metadata.viewPlaneNormal) &&
          (!metadata.viewUp || isEqual(viewUp, metadata.viewUp))
        );
      }
      return;
    })
    .map((enabledElement) => enabledElement.viewport);
}
