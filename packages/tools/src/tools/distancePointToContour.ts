import type { Types } from '@cornerstonejs/core';
import { ContourAnnotationData } from '../types';
import { point } from '../utilities/math';

/**
 * Calculates the shortest distance from the provided point to any contour
 * point in the given annotation.
 */
export const distancePointToContour = (
  viewport: Types.IViewport,
  annotation: ContourAnnotationData,
  coords: Types.Point2
): number => {
  if (!annotation?.data?.contour?.polyline?.length) {
    return;
  }
  const { polyline } = annotation.data.contour;
  const { length } = polyline;

  let distance = Infinity;

  for (let i = 0; i < length; i++) {
    const canvasPoint = viewport.worldToCanvas(polyline[i]);
    const distanceToPoint = point.distanceToPoint(canvasPoint, coords);

    distance = Math.min(distance, distanceToPoint);
  }

  // If an error caused distance not to be calculated, return undefined.
  if (distance === Infinity || isNaN(distance)) {
    return;
  }

  return distance;
};
