import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

export interface ImageDataWithDirection {
  getDirection(): number[];
}

/**
 * Extract volume direction vectors from imageData.
 * The direction matrix defines the volume's orientation in world space.
 * @param imageData - The VTK image data
 * @returns Object containing the three orthogonal direction vectors
 */
export function extractVolumeDirectionVectors(
  imageData: ImageDataWithDirection
): {
  xDir: Types.Point3;
  yDir: Types.Point3;
  zDir: Types.Point3;
} {
  const direction = imageData.getDirection();
  return {
    xDir: vec3.normalize(
      [0, 0, 0],
      direction.slice(0, 3) as [number, number, number]
    ) as Types.Point3,
    yDir: vec3.normalize(
      [0, 0, 0],
      direction.slice(3, 6) as [number, number, number]
    ) as Types.Point3,
    zDir: vec3.normalize(
      [0, 0, 0],
      direction.slice(6, 9) as [number, number, number]
    ) as Types.Point3,
  };
}
