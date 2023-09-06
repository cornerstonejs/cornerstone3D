import type { Types } from '@cornerstonejs/core';

/**
 * Generates an affine matrix from the provided origin, orientation and spacing.
 *
 * @param origin - The origin of the matrix in world coordinates
 * @param orientation - The orientation of the matrix. It's a 9-element array representing
 *                      a 3x3 matrix in row-major order.
 * @param spacing - image spacing along each axis
 *
 * @returns The generated affine matrix, a 4x4 array in row-major order.
 */
function generateAffineMatrix(
  origin: Types.Point3,
  orientation: Types.Mat3,
  spacing: Types.Point3
): Types.AffineMatrix {
  const Ox = origin[0];
  const Oy = origin[1];
  const Oz = origin[2];

  const S1 = spacing[0];
  const S2 = spacing[1];
  const S3 = spacing[2];

  const D11 = orientation[0];
  const D12 = orientation[1];
  const D13 = orientation[2];
  const D21 = orientation[3];
  const D22 = orientation[4];
  const D23 = orientation[5];
  const D31 = orientation[6];
  const D32 = orientation[7];
  const D33 = orientation[8];

  return [
    [D11 * S1, D12 * S2, D13 * S3, Ox],
    [D21 * S1, D22 * S2, D23 * S3, Oy],
    [D31 * S1, D32 * S2, D33 * S3, Oz],
    [0, 0, 0, 1],
  ];
}

/**
 * Parses an affine matrix into its origin, orientation, and spacing components.
 *
 * @param affine - The input 4x4 affine matrix to be parsed, in row-major order.
 *
 * @returns An object with properties 'origin', 'orientation', and 'spacing'. 'origin' is a 3D point representing the origin of the affine matrix. 'orientation' is a 9-element array representing a 3x3 matrix in row-major order. 'spacing' is a 3-element array representing the spacing of the affine matrix in each dimension.
 */
function parseAffineMatrix(affine): {
  origin: Types.Point3;
  orientation: Types.Mat3;
  spacing: Types.Point3;
} {
  const origin = [affine[0][3], affine[1][3], affine[2][3]] as Types.Point3;

  const spacing = [
    Math.sqrt(affine[0][0] ** 2 + affine[1][0] ** 2 + affine[2][0] ** 2),
    Math.sqrt(affine[0][1] ** 2 + affine[1][1] ** 2 + affine[2][1] ** 2),
    Math.sqrt(affine[0][2] ** 2 + affine[1][2] ** 2 + affine[2][2] ** 2),
  ] as Types.Point3;

  const orientation = [
    affine[0][0] / spacing[0],
    affine[0][1] / spacing[1],
    affine[0][2] / spacing[2],
    affine[1][0] / spacing[0],
    affine[1][1] / spacing[1],
    affine[1][2] / spacing[2],
    affine[2][0] / spacing[0],
    affine[2][1] / spacing[1],
    affine[2][2] / spacing[2],
  ] as Types.Mat3;

  return { origin, orientation, spacing };
}

export { generateAffineMatrix, parseAffineMatrix };
