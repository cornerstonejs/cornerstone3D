import type { Types } from '@cornerstonejs/core';
import type { Annotation } from '../../types';
import { getAnnotation } from '../../stateManagement';

/**
 * Get the polylines for the child annotations (holes)
 * @param annotation - Annotation
 * @param viewport - Viewport used to convert the points from world to canvas space
 * @returns An array that contains all child polylines
 */
export default function getChildContourCanvasPolylines(
  annotation: Annotation,
  viewport: Types.IViewport
): Types.Point2[][] {
  const childAnnotationUIDs = annotation.childAnnotationUIDs ?? [];

  return childAnnotationUIDs.map((uid) => {
    const annotation = getAnnotation(uid);
    const { polyline } = annotation.data.contour;

    return polyline.map((point) => viewport.worldToCanvas(point));
  });
}
