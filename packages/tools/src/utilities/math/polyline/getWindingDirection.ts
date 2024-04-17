import type { Types } from '@cornerstonejs/core';
import getSignedArea from './getSignedArea';

/**
 * Calculate the winding direction (CW or CCW) of a polyline
 * @param polyline - Polyline (2D)
 * @returns 1 for CW or -1 for CCW polylines
 */
export default function getWindingDirection(polyline: Types.Point2[]): number {
  const signedArea = getSignedArea(polyline);

  // Return 1 or -1 which is also possible to convert into ContourOrientation
  return signedArea >= 0 ? 1 : -1;
}
