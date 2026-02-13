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
  // Direction is a 9-element array: [x0, x1, x2, y0, y1, y2, z0, z1, z2]
  // These should already be unit vectors, but let's verify and normalize
  const xDir: Types.Point3 = [direction[0], direction[1], direction[2]];
  const yDir: Types.Point3 = [direction[3], direction[4], direction[5]];
  const zDir: Types.Point3 = [direction[6], direction[7], direction[8]];

  // Normalize to ensure they are unit vectors
  const xLen = Math.sqrt(
    xDir[0] * xDir[0] + xDir[1] * xDir[1] + xDir[2] * xDir[2]
  );
  const yLen = Math.sqrt(
    yDir[0] * yDir[0] + yDir[1] * yDir[1] + yDir[2] * yDir[2]
  );
  const zLen = Math.sqrt(
    zDir[0] * zDir[0] + zDir[1] * zDir[1] + zDir[2] * zDir[2]
  );

  const xDirNorm: Types.Point3 = [
    xDir[0] / xLen,
    xDir[1] / xLen,
    xDir[2] / xLen,
  ];
  const yDirNorm: Types.Point3 = [
    yDir[0] / yLen,
    yDir[1] / yLen,
    yDir[2] / yLen,
  ];
  const zDirNorm: Types.Point3 = [
    zDir[0] / zLen,
    zDir[1] / zLen,
    zDir[2] / zLen,
  ];

  return { xDir: xDirNorm, yDir: yDirNorm, zDir: zDirNorm };
}
