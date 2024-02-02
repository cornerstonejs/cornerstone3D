import type { Types } from '@cornerstonejs/core';
import type { Annotation } from '../../types';
import getContourHolesDataWorld from './getContourHolesDataWorld';

/**
 * Get the polylines for the child annotations (holes)
 * @param annotation - Annotation
 * @param viewport - Viewport used to convert the points from world to canvas space
 * @returns An array that contains all child polylines
 */
export default function getContourHolesDataCanvas(
  annotation: Annotation,
  viewport: Types.IViewport
): Types.Point2[][] {
  const worldHoleContours = getContourHolesDataWorld(annotation);
  const canvasHoleContours = [];

  worldHoleContours.forEach((worldHoleContour) => {
    const numPoints = worldHoleContour.length;

    // Pre-allocated arrays are 3-4x faster than multiple "push()" calls
    const canvasHoleContour: Types.Point2[] = new Array(numPoints);

    // Using FOR loop instead of map() for better performance when processing large arrays
    for (let i = 0; i < numPoints; i++) {
      canvasHoleContour[i] = viewport.worldToCanvas(worldHoleContour[i]);
    }

    canvasHoleContours.push(canvasHoleContour);
  });

  return canvasHoleContours;
}
