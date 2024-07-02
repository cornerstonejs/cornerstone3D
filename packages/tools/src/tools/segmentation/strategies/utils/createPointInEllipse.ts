import { Types, utilities as csUtils } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import { pointInSphere } from '../../../../utilities/math/sphere';
import { precalculatePointInEllipse } from '../../../../utilities/math/ellipse';

const { isEqual } = csUtils;

/**
 * Creates a function that tells the user if the provided point in LPS space
 * is inside the ellipse.
 *
 * This will return a sphere test function if the bounds are a circle or
 * sphere shape (same radius in two or three dimensions), or an elliptical shape
 * if they differ.
 */
export const createPointInEllipse = (worldInfo: {
  topLeftWorld: Types.Point3;
  bottomRightWorld: Types.Point3;
  center: Types.Point3 | vec3;
}) => {
  const { topLeftWorld, bottomRightWorld, center } = worldInfo;

  const xRadius = Math.abs(topLeftWorld[0] - bottomRightWorld[0]) / 2;
  const yRadius = Math.abs(topLeftWorld[1] - bottomRightWorld[1]) / 2;
  const zRadius = Math.abs(topLeftWorld[2] - bottomRightWorld[2]) / 2;

  const radius = Math.max(xRadius, yRadius, zRadius);
  if (
    isEqual(xRadius, radius) &&
    isEqual(yRadius, radius) &&
    isEqual(zRadius, radius)
  ) {
    const sphereObj = {
      center,
      radius,
      radius2: radius * radius,
    };
    return (pointLPS) => pointInSphere(sphereObj, pointLPS);
  }
  // using circle as a form of ellipse
  const ellipseObj = {
    center: center as Types.Point3,
    xRadius,
    yRadius,
    zRadius,
  };

  const { precalculated } = precalculatePointInEllipse(ellipseObj, {});
  return precalculated;
};
