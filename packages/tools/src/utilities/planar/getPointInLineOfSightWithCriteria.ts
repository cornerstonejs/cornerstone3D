import { cache, Enums, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import getViewportICamera from '../getViewportICamera';

/**
 * Native ("next") viewports have no getCamera/getBounds/getIntensityFromWorld,
 * so the line of sight is resolved from the view reference and the cached
 * target volume instead.
 */
type LineOfSightViewport = Types.IVolumeViewport | Types.IViewport;

function isLegacyVolumeViewport(
  viewport: LineOfSightViewport
): viewport is Types.IVolumeViewport {
  return (
    !csUtils.isGenericViewport(viewport) &&
    typeof (viewport as Types.IVolumeViewport).getIntensityFromWorld ===
      'function'
  );
}
/**
 * Returns a point based on some criteria (e.g., minimum or maximum intensity) in
 * the line of sight (on the line between the passed worldPosition and camera position).
 * It iterated over the points with a step size on the line.
 *
 * @param viewport - Volume viewport, legacy or native ("next")
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
  viewport: LineOfSightViewport,
  worldPos: Types.Point3,
  targetVolumeId: string,
  criteriaFunction: (intensity: number, point: Types.Point3) => Types.Point3,
  stepSize = 0.25
): Types.Point3 {
  const points = getPointsInLineOfSight(viewport, worldPos, {
    targetVolumeId,
    stepSize,
  });

  const getIntensity = isLegacyVolumeViewport(viewport)
    ? (point: Types.Point3) => viewport.getIntensityFromWorld(point)
    : _getVolumeIntensityGetter(_getTargetVolume(viewport, targetVolumeId));

  if (!getIntensity) {
    return;
  }

  let pickedPoint;

  for (const point of points) {
    const intensity = getIntensity(point);
    const pointToPick = criteriaFunction(intensity, point);
    if (pointToPick) {
      pickedPoint = pointToPick;
    }
  }

  return pickedPoint;
}

/**
 * Calculates and returns an array of points in the line of sight between the camera and a target volume.
 * @param viewport - The volume viewport, legacy or native ("next").
 * @param worldPos - The world position of the camera.
 * @param targetVolumeId - The ID of the target volume.
 * @param stepSize - The step size for iterating along the line of sight. Default is 0.25.
 * @returns An array of points in the line of sight.
 */
export function getPointsInLineOfSight(
  viewport: LineOfSightViewport,
  worldPos: Types.Point3,
  { targetVolumeId, stepSize }: { targetVolumeId: string; stepSize: number }
): Types.Point3[] {
  const lineOfSight = isLegacyVolumeViewport(viewport)
    ? _getLegacyLineOfSight(viewport, targetVolumeId)
    : _getNativeLineOfSight(viewport, targetVolumeId);

  if (!lineOfSight) {
    return [];
  }

  const { normalDirection, spacingInNormalDirection, bounds } = lineOfSight;
  const step = spacingInNormalDirection * stepSize || 1;

  const points: Types.Point3[] = [];

  // Sample points in the positive normal direction
  let currentPos = [...worldPos] as Types.Point3;
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

type LineOfSight = {
  normalDirection: Types.Point3;
  spacingInNormalDirection: number;
  bounds: number[];
};

function _getLegacyLineOfSight(
  viewport: Types.IVolumeViewport,
  targetVolumeId: string
): LineOfSight {
  const camera = viewport.getCamera();
  const { spacingInNormalDirection } =
    csUtils.getTargetVolumeAndSpacingInNormalDir(
      viewport,
      camera,
      targetVolumeId
    );

  return {
    normalDirection: camera.viewPlaneNormal,
    spacingInNormalDirection,
    bounds: viewport.getBounds(),
  };
}

function _getNativeLineOfSight(
  viewport: Types.IViewport,
  targetVolumeId: string
): LineOfSight | undefined {
  const { viewPlaneNormal } = getViewportICamera(viewport);
  const volume = _getTargetVolume(viewport, targetVolumeId);

  if (!viewPlaneNormal || !volume?.imageData) {
    return;
  }

  return {
    normalDirection: viewPlaneNormal,
    spacingInNormalDirection: csUtils.getSpacingInNormalDirection(
      volume,
      viewPlaneNormal
    ),
    bounds: volume.imageData.getBounds(),
  };
}

function _getTargetVolume(
  viewport: Types.IViewport,
  targetVolumeId: string
): Types.IImageVolume | undefined {
  const volumeId =
    targetVolumeId ||
    (viewport as { getVolumeId?: () => string }).getVolumeId?.();
  return volumeId ? cache.getVolume(volumeId) : undefined;
}

/**
 * Nearest-voxel lookup on the cached volume, matching the legacy
 * getIntensityFromWorld semantics.
 */
function _getVolumeIntensityGetter(
  volume: Types.IImageVolume | undefined
): ((point: Types.Point3) => number) | undefined {
  if (!volume?.voxelManager) {
    return;
  }

  return (point) =>
    csUtils.VoxelManager.sampleAtWorld(
      volume,
      point,
      Enums.InterpolationType.NEAREST
    );
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
