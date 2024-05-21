import { utilities as csUtils } from '@cornerstonejs/core';
import { Types } from '@cornerstonejs/core';
import type { ContourAnnotation } from '../../types';
import type { ContourWindingDirection } from '../../types/ContourAnnotation';
import * as math from '../math';
import {
  getParentAnnotation,
  invalidateAnnotation,
} from '../../stateManagement';

/**
 * Update the contour polyline data
 * @param annotation - Contour annotation
 * @param viewport - Viewport
 * @param polylineData - Polyline data (points, winding direction and closed)
 * @param transforms - Methods to convert points to/from canvas and world spaces
 * @param options - Options
 *   - decimate: allow to set some parameters to decimate the polyline reducing
 *   the amount of points stored which also affects how fast it will draw the
 *   annotation in a viewport, compute the winding direction, append/remove
 *   contours and create holes. A higher `epsilon` value results in a polyline
 *   with less points.
 */
export default function updateContourPolyline(
  annotation: ContourAnnotation,
  polylineData: {
    points: Types.Point2[];
    closed?: boolean;
    targetWindingDirection?: ContourWindingDirection;
  },
  transforms: {
    canvasToWorld: (point: Types.Point2) => Types.Point3;
  },
  options?: {
    decimate?: {
      enabled?: boolean;
      epsilon?: number;
    };
  }
) {
  const { canvasToWorld } = transforms;
  const { data } = annotation;
  const { targetWindingDirection } = polylineData;
  let { points: polyline } = polylineData;

  // Decimate the polyline to reduce tha amount of points
  if (options?.decimate?.enabled) {
    polyline = math.polyline.decimate(
      polylineData.points,
      options?.decimate?.epsilon
    );
  }

  let { closed } = polylineData;
  const numPoints = polyline.length;
  const polylineWorldPoints = new Array(numPoints);
  const currentWindingDirection = math.polyline.getWindingDirection(polyline);
  const parentAnnotation = getParentAnnotation(annotation) as ContourAnnotation;

  if (closed === undefined) {
    let currentClosedState = false;

    // With two points it is just a line and do not make sense to consider it closed
    if (polyline.length > 3) {
      const lastToFirstDist = math.point.distanceToPointSquared(
        polyline[0],
        polyline[numPoints - 1]
      );

      currentClosedState = csUtils.isEqual(0, lastToFirstDist);
    }

    closed = currentClosedState;
  }

  // It must be in the opposite direction if it is a child annotation (hole)
  let windingDirection = parentAnnotation
    ? parentAnnotation.data.contour.windingDirection * -1
    : targetWindingDirection;

  if (windingDirection === undefined) {
    windingDirection = currentWindingDirection;
  } else if (windingDirection !== currentWindingDirection) {
    polyline.reverse();
  }

  for (let i = 0; i < numPoints; i++) {
    polylineWorldPoints[i] = canvasToWorld(polyline[i]);
  }

  data.contour.polyline = polylineWorldPoints;
  data.contour.closed = closed;
  data.contour.windingDirection = windingDirection;

  invalidateAnnotation(annotation);
}
