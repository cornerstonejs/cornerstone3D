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
export function getPointInLineOfSightWithCriteria(
  viewport: Types.IVolumeViewport,
  worldPos: Types.Point3,
  targetVolumeId: string,
  criteriaFunction: (intensity: number, point: Types.Point3) => Types.Point3,
  stepSize = 0.25
): Types.Point3 {
  const points = getPointsInLineOfSight(viewport, worldPos, {
    targetVolumeId,
    stepSize,
  });

  let pickedPoint;

  for (const point of points) {
    const intensity = viewport.getIntensityFromWorld(point);
    const pointToPick = criteriaFunction(intensity, point);
    if (pointToPick) {
      pickedPoint = pointToPick;
    }
  }

  return pickedPoint;
}

/**
 * Calculates and returns an array of points in the line of sight between the camera and a target volume.
 * @param viewport - The volume viewport.
 * @param worldPos - The world position of the camera.
 * @param targetVolumeId - The ID of the target volume.
 * @param stepSize - The step size for iterating along the line of sight. Default is 0.25.
 * @returns An array of points in the line of sight.
 */
export function getPointsInLineOfSight(
  viewport: Types.IVolumeViewport,
  worldPos: Types.Point3,
  { targetVolumeId, stepSize }: { targetVolumeId: string; stepSize: number }
): Types.Point3[] {
  const camera = viewport.getCamera();
  const { viewPlaneNormal: normalDirection } = camera;
  const { spacingInNormalDirection } =
    csUtils.getTargetVolumeAndSpacingInNormalDir(
      viewport,
      camera,
      targetVolumeId
    );

  const step = spacingInNormalDirection * stepSize || 1;
  const bounds = viewport.getBounds();

  const points: Types.Point3[] = [];

  // Sample points in the positive normal direction
  let currentPos = [...worldPos];
  while (_inBounds(currentPos, bounds)) {
    points.push([...currentPos]);
    currentPos[0] += normalDirection[0] * step;
    currentPos[1] += normalDirection[1] * step;
    currentPos[2] += normalDirection[2] * step;
  }

  // Sample points in the negative normal direction
  currentPos = [...worldPos];
  while (_inBounds(currentPos, bounds)) {
    points.push([...currentPos]);
    currentPos[0] -= normalDirection[0] * step;
    currentPos[1] -= normalDirection[1] * step;
    currentPos[2] -= normalDirection[2] * step;
  }

  return points;
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
  const padding = 10;
  return (
    point[0] > xMin + padding &&
    point[0] < xMax - padding &&
    point[1] > yMin + padding &&
    point[1] < yMax - padding &&
    point[2] > zMin + padding &&
    point[2] < zMax - padding
  );
};
