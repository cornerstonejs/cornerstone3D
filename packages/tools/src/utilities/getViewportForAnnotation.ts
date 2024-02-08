import type { Annotation } from '../types';
import getViewportsForAnnotation from './getViewportsForAnnotation';

/**
 * Finds a matching viewport in terms of the orientation of the annotation data
 * and the frame of reference.  This doesn't mean the annotation IS being displayed
 * in the viewport, just that it could be by navigating the slice, and/or pan/zoom,
 * without changing the orientation.
 *
 * @param annotation - to find a viewport that it could display in
 * @returns The viewport to display in
 */
export default function getViewportForAnnotation(annotation: Annotation) {
  const viewports = getViewportsForAnnotation(annotation);

  return viewports.length ? viewports[0] : undefined;
}
