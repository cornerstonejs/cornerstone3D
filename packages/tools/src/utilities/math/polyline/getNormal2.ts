import { Types } from '@cornerstonejs/core';
import getSignedArea from './getSignedArea';

/**
 * Calculate the normal of a 2D polyline
 * https://www.youtube.com/watch?v=GpsKrAipXm8&t=1982s
 *
 * @param polyline - Planar polyline in 2D space
 * @returns Normal of the 2D planar polyline
 */
export default function getNormal2(polyline: Types.Point2[]): Types.Point3 {
  const area = getSignedArea(polyline);

  // The normal of a 2D polyline is (0, 0, 1) or (0, 0, -1) depending if it
  // is CW or CCW polyline
  return [0, 0, area / Math.abs(area)] as Types.Point3;
}
