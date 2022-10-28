import { IDistance, IPoints, ITouchPoints } from '../../types';
import { Types } from '@cornerstonejs/core';

/**
 * Returns the difference between multiple `IPoints` instances.
 * @param currentPoints - The current points.
 * @param lastPoints - The last points, to be subtracted from the `currentPoints`.
 *
 * @returns The difference in IPoints format
 */
function getDeltaPoints(
  currentPoints: IPoints[],
  lastPoints: IPoints[]
): IPoints {
  const curr = getMeanPoints(currentPoints);
  const last = getMeanPoints(lastPoints);
  return {
    page: _subtractPoints2D(curr.page, last.page),
    client: _subtractPoints2D(curr.client, last.client),
    canvas: _subtractPoints2D(curr.canvas, last.canvas),
    world: _subtractPoints3D(curr.world, last.world),
  };
}

/**
 * Returns the distance between multiple `IPoints` instances.
 * @param currentPoints - The current points.
 * @param lastPoints - The last points, to be subtracted from the `currentPoints`.
 *
 * @returns The distance difference in IDistance format
 */
function getDeltaDistance(
  currentPoints: IPoints[],
  lastPoints: IPoints[]
): IDistance {
  const curr = getMeanPoints(currentPoints);
  const last = getMeanPoints(lastPoints);
  return {
    page: _getDistance2D(curr.page, last.page),
    client: _getDistance2D(curr.client, last.client),
    canvas: _getDistance2D(curr.canvas, last.canvas),
    world: _getDistance3D(curr.world, last.world),
  };
}

function getDeltaRotation(
  currentPoints: ITouchPoints[],
  lastPoints: ITouchPoints[]
) {
  // TODO
}

/**
 * Returns the distance difference between multiple `IPoints` instances.
 * @param currentPoints - The current points.
 * @param lastPoints -- The last points.
 *
 * @returns The difference in IPoints format
 */
function getDeltaDistanceBetweenIPoints(
  currentPoints: IPoints[],
  lastPoints: IPoints[]
): IDistance {
  const currentDistance = _getMeanDistanceBetweenAllIPoints(currentPoints);
  const lastDistance = _getMeanDistanceBetweenAllIPoints(lastPoints);
  const deltaDistance = {
    page: currentDistance.page - lastDistance.page,
    client: currentDistance.client - lastDistance.client,
    canvas: currentDistance.canvas - lastDistance.canvas,
    world: currentDistance.world - lastDistance.world,
  };
  return deltaDistance;
}

/**
 * Copies a set of points.
 * @param points - The `IPoints` instance to copy.
 *
 * @returns A copy of the points.
 */
function copyPointsList(points: ITouchPoints[]): ITouchPoints[] {
  return JSON.parse(JSON.stringify(points));
}

function copyPoints(points: ITouchPoints): ITouchPoints {
  return JSON.parse(JSON.stringify(points));
}

function getMeanPoints(points: IPoints[]): IPoints {
  return points.reduce(
    (prev, curr) => {
      return {
        page: [
          prev.page[0] + curr.page[0] / points.length,
          prev.page[1] + curr.page[1] / points.length,
        ],
        client: [
          prev.client[0] + curr.client[0] / points.length,
          prev.client[1] + curr.client[1] / points.length,
        ],
        canvas: [
          prev.canvas[0] + curr.canvas[0] / points.length,
          prev.canvas[1] + curr.canvas[1] / points.length,
        ],
        world: [
          prev.world[0] + curr.world[0] / points.length,
          prev.world[1] + curr.world[1] / points.length,
          prev.world[2] + curr.world[2] / points.length,
        ],
      };
    },
    {
      page: [0, 0],
      client: [0, 0],
      canvas: [0, 0],
      world: [0, 0, 0],
    }
  );
}

function getMeanTouchPoints(points: ITouchPoints[]): ITouchPoints {
  return points.reduce(
    (prev, curr) => {
      return {
        page: [
          prev.page[0] + curr.page[0] / points.length,
          prev.page[1] + curr.page[1] / points.length,
        ],
        client: [
          prev.client[0] + curr.client[0] / points.length,
          prev.client[1] + curr.client[1] / points.length,
        ],
        canvas: [
          prev.canvas[0] + curr.canvas[0] / points.length,
          prev.canvas[1] + curr.canvas[1] / points.length,
        ],
        world: [
          prev.world[0] + curr.world[0] / points.length,
          prev.world[1] + curr.world[1] / points.length,
          prev.world[2] + curr.world[2] / points.length,
        ],
        touch: {
          identifier: null,
          radiusX: prev.touch.radiusX + curr.touch.radiusX / points.length,
          radiusY: prev.touch.radiusY + curr.touch.radiusY / points.length,
          force: prev.touch.force + curr.touch.force / points.length,
          rotationAngle:
            prev.touch.rotationAngle + curr.touch.rotationAngle / points.length,
        },
      };
    },
    {
      page: [0, 0],
      client: [0, 0],
      canvas: [0, 0],
      world: [0, 0, 0],
      touch: {
        identifier: null,
        radiusX: 0,
        radiusY: 0,
        force: 0,
        rotationAngle: 0,
      },
    }
  );
}
/**
 * _subtractPoints - Subtracts `point1` from `point0`.
 * @param point0 - The first point.
 * @param point1 - The second point to subtract from the first.
 *
 * @returns The difference.
 */
function _subtractPoints2D(
  point0: Types.Point2,
  point1: Types.Point2
): Types.Point2 {
  return [point0[0] - point1[0], point0[1] - point1[1]];
}

function _subtractPoints3D(
  point0: Types.Point3,
  point1: Types.Point3
): Types.Point3 {
  return [point0[0] - point1[0], point0[1] - point1[1], point0[2] - point1[2]];
}

function _getMeanDistanceBetweenAllIPoints(points: IPoints[]): IDistance {
  // get mean distance between all unordered pairs of points
  const pairedDistance: IDistance[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i < j) {
        pairedDistance.push({
          page: _getDistance2D(points[i].page, points[j].page),
          client: _getDistance2D(points[i].client, points[j].client),
          canvas: _getDistance2D(points[i].canvas, points[j].canvas),
          world: _getDistance3D(points[i].world, points[j].world),
        });
      }
    }
  }

  // take the average distance
  return pairedDistance.reduce(
    (prev, curr) => {
      return {
        page: prev.page + curr.page / pairedDistance.length,
        client: prev.client + curr.client / pairedDistance.length,
        canvas: prev.canvas + curr.canvas / pairedDistance.length,
        world: prev.world + curr.world / pairedDistance.length,
      };
    },
    {
      page: 0,
      client: 0,
      canvas: 0,
      world: 0,
    }
  );
}

function _getDistance2D(point0: Types.Point2, point1: Types.Point2): number {
  return Math.sqrt(
    Math.pow(point0[0] - point1[0], 2) + Math.pow(point0[1] - point1[1], 2)
  );
}

function _getDistance3D(point0: Types.Point3, point1: Types.Point3): number {
  return Math.sqrt(
    Math.pow(point0[0] - point1[0], 2) +
      Math.pow(point0[1] - point1[1], 2) +
      Math.pow(point0[2] - point1[2], 2)
  );
}

export {
  getMeanPoints,
  getMeanTouchPoints,
  copyPoints,
  copyPointsList,
  getDeltaDistanceBetweenIPoints,
  getDeltaPoints,
  getDeltaDistance,
  getDeltaRotation,
};
