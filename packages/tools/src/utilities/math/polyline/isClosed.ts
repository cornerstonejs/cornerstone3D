import { glMatrix } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import * as math from '..';

/**
 * A polyline is considered closed if the start and end points are at the same position
 *
 * @param polyline - Polyline points (2D)
 * @returns True if the polyline is already closed or false otherwise
 */
export default function isClosed(polyline: Types.Point2[]): boolean {
  if (polyline.length < 3) {
    return false;
  }

  const numPolylinePoints = polyline.length;

  const firstPoint = polyline[0];
  const lastPoint = polyline[numPolylinePoints - 1];
  const distFirstToLastPoints = math.point.distanceToPointSquared(
    firstPoint,
    lastPoint
  );

  return glMatrix.equals(0, distFirstToLastPoints);
}
