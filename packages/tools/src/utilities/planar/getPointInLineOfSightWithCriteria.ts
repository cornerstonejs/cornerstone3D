import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
/**
 * Returns a point based on some criteria (e.g., minimum or maximum intensity) in
 * the line of sight (on the line between the passed worldPosition and camera position).
 * It iterated over the points with a step size on the line.
 *
 * @param viewport - Volume viewport
 * @param worldPos - World coordinates of the clicked location
 * @param targetVolumeId - target Volume ID in the viewport
 * @param criteriaFunction - A function that returns the point if it passes a certain
 * written logic, for instance, it can be a maxValue function that keeps the
 * records of all intensity values, and only return the point if its intensity
 * is greater than the maximum intensity of the points passed before.
 * @param stepsSize - Percentage of the spacing in the normal direction, default value
 * is 0.25 which means steps = 1/4 of the spacing in the normal direction.
 * @returns the World pos of the point that passes the criteriaFunction
 */
export default function getPointInLineOfSightWithCriteria(
  viewport: Types.IVolumeViewport,
  worldPos: Types.Point3,
  targetVolumeId: string,
  criteriaFunction: (intensity: number, point: Types.Point3) => Types.Point3,
  stepSize = 0.25
): Types.Point3 {
  // 1. Getting the camera from the event details
  const camera = viewport.getCamera();
  const { position: cameraPosition } = camera;

  // 2. Calculating the spacing in the normal direction, this will get
  // used as the step size for iterating over the points in the line of sight
  const { spacingInNormalDirection } =
    csUtils.getTargetVolumeAndSpacingInNormalDir(
      viewport,
      camera,
      targetVolumeId
    );
  // 2.1 Making sure, we are not missing any point
  const step = spacingInNormalDirection * stepSize;

  // 3. Getting the bounds of the viewports. Search for brightest point is
  // limited to the visible bound
  // Todo: this might be a problem since bounds will change to spatial bounds.
  const bounds = viewport.getBounds();
  const xMin = bounds[0];
  const xMax = bounds[1];

  // 5. Calculating the line, we use a parametric line definition
  const vector = <Types.Point3>[0, 0, 0];

  // 5.1 Point coordinate on the line
  let point = <Types.Point3>[0, 0, 0];

  // 5.2 Calculating the line direction, and storing in vector
  vtkMath.subtract(worldPos, cameraPosition, vector);

  let pickedPoint;

  // 6. Iterating over the line from the lower bound to the upper bound, with the
  // specified step size
  for (let pointT = xMin; pointT <= xMax; pointT = pointT + step) {
    // 6.1 Calculating the point x location
    point = [pointT, 0, 0];
    // 6.2 Calculating the point y,z location based on the line equation
    const t = (pointT - cameraPosition[0]) / vector[0];
    point[1] = t * vector[1] + cameraPosition[1];
    point[2] = t * vector[2] + cameraPosition[2];

    // 6.3 Checking if the points is inside the bounds
    if (_inBounds(point, bounds)) {
      // 6.4 Getting the intensity of the point
      const intensity = viewport.getIntensityFromWorld(point);
      // 6.5 Passing the intensity to the maximum value functions which decides
      // whether the current point is of interest based on some criteria
      const pointToPick = criteriaFunction(intensity, point);
      if (pointToPick) {
        pickedPoint = pointToPick;
      }
    }
  }

  return pickedPoint;
}

/**
 * Returns whether the point in the world is inside the bounds of the viewport
 * @param point - coordinates in the world
 * @returns boolean
 */
const _inBounds = function (
  point: Types.Point3,
  bounds: Array<number>
): boolean {
  const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;
  return (
    point[0] > xMin &&
    point[0] < xMax &&
    point[1] > yMin &&
    point[1] < yMax &&
    point[2] > zMin &&
    point[2] < zMax
  );
};
