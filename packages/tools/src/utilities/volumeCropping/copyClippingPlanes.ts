import type { ClippingPlane } from './types';
import type { Types } from '@cornerstonejs/core';

/**
 * Creates a deep copy of an array of clipping planes.
 * This is useful when you need to copy planes without mutating the original array.
 *
 * @param planes - Array of clipping planes to copy
 * @returns A new array with copied clipping planes
 */
export function copyClippingPlanes(planes: ClippingPlane[]): ClippingPlane[] {
  return planes.map((plane) => ({
    origin: [...plane.origin] as Types.Point3,
    normal: [...plane.normal] as Types.Point3,
  }));
}
