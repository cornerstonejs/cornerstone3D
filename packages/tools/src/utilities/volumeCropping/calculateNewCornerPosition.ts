import type { Types } from '@cornerstonejs/core';

/**
 * Calculate new corner position with offset
 * @param world - World coordinates from mouse position
 * @param cornerDragOffset - 3D offset vector for corner sphere dragging [dx, dy, dz] or null
 * @returns New corner position
 */
export function calculateNewCornerPosition(
  world: Types.Point3,
  cornerDragOffset: [number, number, number] | null
): Types.Point3 {
  let newCorner = [world[0], world[1], world[2]];

  if (cornerDragOffset) {
    newCorner = [
      world[0] + cornerDragOffset[0],
      world[1] + cornerDragOffset[1],
      world[2] + cornerDragOffset[2],
    ];
  }

  return newCorner as Types.Point3;
}
