import { StackViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

const EPSILON = 1e-3;

/**
 * Gets the desired spacing for points in the polyline for the
 * `PlanarFreehandROITool` in the x and y canvas directions, as well as
 * returning these canvas directions in world space.
 *
 * @param viewport - The Cornerstone3D `StackViewport` or `VolumeViewport`.
 * @param subPixelResolution - The number to divide the image pixel spacing by
 * to get the sub pixel spacing. E.g. `10` will return spacings 10x smaller than
 * the native image spacing.
 * @returns The spacings of the X and Y directions, and the 3D directions of the
 * x and y directions.
 */
const getSubPixelSpacingAndXYDirections = (
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  subPixelResolution: number
): { spacing: Types.Point2; xDir: Types.Point3; yDir: Types.Point3 } => {
  let spacing;
  let xDir;
  let yDir;

  if (viewport instanceof StackViewport) {
    // Check XY directions
    const imageData = viewport.getImageData();

    if (!imageData) {
      return;
    }

    xDir = imageData.direction.slice(0, 3);
    yDir = imageData.direction.slice(3, 6);

    spacing = imageData.spacing;
  } else {
    // Check volume directions
    const imageData = viewport.getImageData();
    const { direction, spacing: volumeSpacing } = imageData;
    const { viewPlaneNormal, viewUp } = viewport.getCamera();

    // Volume basis vectors and their spacings
    const iVector = direction.slice(0, 3) as Types.Point3;
    const jVector = direction.slice(3, 6) as Types.Point3;
    const kVector = direction.slice(6, 9) as Types.Point3;

    // Compute viewRight = viewUp × viewPlaneNormal (the X direction of the viewport)
    const viewRight = vec3.create();
    vec3.cross(viewRight, <vec3>viewUp, <vec3>viewPlaneNormal);
    vec3.normalize(viewRight, viewRight);

    const absViewRightDotI = Math.abs(vec3.dot(viewRight, iVector));
    const absViewRightDotJ = Math.abs(vec3.dot(viewRight, jVector));
    const absViewRightDotK = Math.abs(vec3.dot(viewRight, kVector));

    // Get X spacing — try orthogonal alignment first, fall back to oblique
    let xSpacing;
    if (Math.abs(1 - absViewRightDotI) < EPSILON) {
      xSpacing = volumeSpacing[0];
      xDir = iVector;
    } else if (Math.abs(1 - absViewRightDotJ) < EPSILON) {
      xSpacing = volumeSpacing[1];
      xDir = jVector;
    } else if (Math.abs(1 - absViewRightDotK) < EPSILON) {
      xSpacing = volumeSpacing[2];
      xDir = kVector;
    } else {
      // Oblique plane: viewRight is not aligned with any single volume axis.
      // Compute effective spacing by projecting the view direction onto
      // the volume's voxel grid.
      xSpacing = _computeEffectiveSpacing(
        viewRight as unknown as Types.Point3,
        iVector,
        jVector,
        kVector,
        volumeSpacing
      );
      xDir = Array.from(viewRight) as Types.Point3;
    }

    const absViewUpDotI = Math.abs(vec3.dot(<vec3>viewUp, iVector));
    const absViewUpDotJ = Math.abs(vec3.dot(<vec3>viewUp, jVector));
    const absViewUpDotK = Math.abs(vec3.dot(<vec3>viewUp, kVector));

    // Get Y spacing — same approach
    let ySpacing;
    if (Math.abs(1 - absViewUpDotI) < EPSILON) {
      ySpacing = volumeSpacing[0];
      yDir = iVector;
    } else if (Math.abs(1 - absViewUpDotJ) < EPSILON) {
      ySpacing = volumeSpacing[1];
      yDir = jVector;
    } else if (Math.abs(1 - absViewUpDotK) < EPSILON) {
      ySpacing = volumeSpacing[2];
      yDir = kVector;
    } else {
      // Oblique plane: compute effective spacing along viewUp
      ySpacing = _computeEffectiveSpacing(
        viewUp as Types.Point3,
        iVector,
        jVector,
        kVector,
        volumeSpacing
      );
      yDir = Array.from(viewUp) as Types.Point3;
    }

    spacing = [xSpacing, ySpacing];
  }

  const subPixelSpacing: Types.Point2 = [
    spacing[0] / subPixelResolution,
    spacing[1] / subPixelResolution,
  ];

  return { spacing: subPixelSpacing, xDir, yDir };
};

/**
 * Computes the effective voxel spacing along an arbitrary world-space direction.
 *
 * For a unit direction vector `d` and volume axes i, j, k with spacings
 * s_i, s_j, s_k, the effective spacing is:
 *
 *   s_eff = 1 / sqrt( (d·i / s_i)² + (d·j / s_j)² + (d·k / s_k)² )
 *
 * This represents the world-space distance you must travel along `d` to cross
 * one voxel-equivalent boundary. It naturally reduces to the orthogonal case:
 * when `d` is aligned with axis i, d·j = d·k = 0, so s_eff = s_i.
 *
 * @param direction - A normalized world-space direction vector.
 * @param iVector - The volume's I direction (row).
 * @param jVector - The volume's J direction (column).
 * @param kVector - The volume's K direction (slice).
 * @param volumeSpacing - The [i, j, k] voxel spacings.
 * @returns The effective spacing along `direction`.
 */
function _computeEffectiveSpacing(
  direction: Types.Point3,
  iVector: Types.Point3,
  jVector: Types.Point3,
  kVector: Types.Point3,
  volumeSpacing: number[]
): number {
  const dotI = vec3.dot(
    direction as unknown as vec3,
    iVector as unknown as vec3
  );
  const dotJ = vec3.dot(
    direction as unknown as vec3,
    jVector as unknown as vec3
  );
  const dotK = vec3.dot(
    direction as unknown as vec3,
    kVector as unknown as vec3
  );

  const sum =
    (dotI * dotI) / (volumeSpacing[0] * volumeSpacing[0]) +
    (dotJ * dotJ) / (volumeSpacing[1] * volumeSpacing[1]) +
    (dotK * dotK) / (volumeSpacing[2] * volumeSpacing[2]);

  return 1.0 / Math.sqrt(sum);
}

export default getSubPixelSpacingAndXYDirections;
