import { StackViewport, VolumeViewport } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

const EPSILON = 1e-3;

/**
 * Gets the desired spacing for points in the polyline for the
 * `PlanarFreehandROITool` in the x and y canvas directions, as well as
 * returning these canvas directions in world space.
 */
const getSpacingAndXYDirections = (
  viewport: StackViewport | VolumeViewport,
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
    const imageVolume = viewport.getDefaultActor();
    const { direction, spacing: volumeSpacing } = imageVolume;
    const { viewPlaneNormal, viewUp } = viewport.getCamera();

    // Calculate size of spacing vector in normal direction
    const iVector = direction.slice(0, 3);
    const jVector = direction.slice(3, 6);
    const kVector = direction.slice(6, 9);

    let viewRight = vec3.create(); // Get the X direction of the viewport

    vec3.cross(viewRight, <vec3>viewUp, <vec3>viewPlaneNormal);

    viewRight = [-viewRight[0], -viewRight[1], -viewRight[2]];

    // Get X spacing
    let xSpacing;
    if (Math.abs(1 - vec3.dot(viewRight, iVector)) < EPSILON) {
      xSpacing = volumeSpacing[0];
      xDir = iVector;
    } else if (Math.abs(1 - vec3.dot(viewRight, jVector)) < EPSILON) {
      xSpacing = volumeSpacing[1];
      xDir = jVector;
    } else if (Math.abs(1 - vec3.dot(viewRight, kVector)) < EPSILON) {
      xSpacing = volumeSpacing[2];
      xDir = kVector;
    } else {
      throw new Error('No support yet for oblique plane planar contours');
    }

    // Get Y spacing
    let ySpacing;
    if (Math.abs(1 - vec3.dot(viewPlaneNormal, iVector)) < EPSILON) {
      ySpacing = volumeSpacing[0];
      yDir = iVector;
    } else if (Math.abs(1 - vec3.dot(viewPlaneNormal, jVector)) < EPSILON) {
      ySpacing = volumeSpacing[1];
      yDir = jVector;
    } else if (Math.abs(1 - vec3.dot(viewPlaneNormal, kVector)) < EPSILON) {
      ySpacing = volumeSpacing[2];
      yDir = kVector;
    } else {
      throw new Error('No support yet for oblique plane planar contours');
    }

    spacing = [xSpacing, ySpacing];
  }

  const subPixelSpacing = [
    spacing[0] / subPixelResolution,
    spacing[1] / subPixelResolution,
  ];

  return { spacing: subPixelSpacing, xDir, yDir };
};

export default getSpacingAndXYDirections;
