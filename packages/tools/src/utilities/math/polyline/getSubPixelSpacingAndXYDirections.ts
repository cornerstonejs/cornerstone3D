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

    xDir = imageData.direction.slice(0, 3);
    yDir = imageData.direction.slice(3, 6);

    spacing = imageData.spacing;
  } else {
    // Check volume directions
    const imageData = viewport.getImageData();
    const { direction, spacing: volumeSpacing } = imageData;
    const { viewPlaneNormal, viewUp } = viewport.getCamera();

    // Calculate size of spacing vector in normal direction
    const iVector = direction.slice(0, 3) as Types.Point3;
    const jVector = direction.slice(3, 6) as Types.Point3;
    const kVector = direction.slice(6, 9) as Types.Point3;

    const viewRight = vec3.create(); // Get the X direction of the viewport

    vec3.cross(viewRight, <vec3>viewUp, <vec3>viewPlaneNormal);

    const absViewRightDotI = Math.abs(vec3.dot(viewRight, iVector));
    const absViewRightDotJ = Math.abs(vec3.dot(viewRight, jVector));
    const absViewRightDotK = Math.abs(vec3.dot(viewRight, kVector));

    // Get X spacing
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
      throw new Error('No support yet for oblique plane planar contours');
    }

    const absViewPlaneNormalDotI = Math.abs(vec3.dot(viewPlaneNormal, iVector));
    const absViewPlaneNormalDotJ = Math.abs(vec3.dot(viewPlaneNormal, jVector));
    const absViewPlaneNormalDotK = Math.abs(vec3.dot(viewPlaneNormal, kVector));

    // Get Y spacing
    let ySpacing;
    if (Math.abs(1 - absViewPlaneNormalDotI) < EPSILON) {
      ySpacing = volumeSpacing[0];
      yDir = iVector;
    } else if (Math.abs(1 - absViewPlaneNormalDotJ) < EPSILON) {
      ySpacing = volumeSpacing[1];
      yDir = jVector;
    } else if (Math.abs(1 - absViewPlaneNormalDotK) < EPSILON) {
      ySpacing = volumeSpacing[2];
      yDir = kVector;
    } else {
      throw new Error('No support yet for oblique plane planar contours');
    }

    spacing = [xSpacing, ySpacing];
  }

  const subPixelSpacing: Types.Point2 = [
    spacing[0] / subPixelResolution,
    spacing[1] / subPixelResolution,
  ];

  return { spacing: subPixelSpacing, xDir, yDir };
};

export default getSubPixelSpacingAndXYDirections;
