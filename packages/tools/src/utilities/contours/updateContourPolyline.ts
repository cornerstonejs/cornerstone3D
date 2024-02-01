import { glMatrix } from 'gl-matrix';
import { Types } from '@cornerstonejs/core';
import type { ContourAnnotation } from '../../types';
import type { ContourWindingDirection } from '../../types/ContourAnnotation';
import * as math from '../math';

/**
 * Update the contour polyline data
 * @param annotation - Contour annotation
 * @param viewport - Viewport
 * @param polylineData - Polyline data (points, winding direction and closed)
 * @param transforms - Methods to convert points to/from canvas and world spaces
 */
export default function updateContourPolyline(
  annotation: ContourAnnotation,
  polylineData: {
    points: Types.Point2[];
    closed?: boolean;
    windingDirection?: ContourWindingDirection;
  },
  transforms: {
    canvasToWorld: (point: Types.Point2) => Types.Point3;
  }
) {
  const { canvasToWorld } = transforms;
  const { data } = annotation;
  const { points: polyline } = polylineData;
  let { closed, windingDirection } = polylineData;
  const numPoints = polyline.length;
  const polylineWorldPoints = new Array(numPoints);
  const currentWindingDirection = math.polyline.getWindingDirection(polyline);

  if (closed === undefined) {
    let currentClosedState = false;

    if (polyline.length > 3) {
      const lastToFirstDist = math.point.distanceToPointSquared(
        polyline[0],
        polyline[numPoints - 1]
      );

      currentClosedState = glMatrix.equals(0, lastToFirstDist);
    }

    closed = currentClosedState;
  }

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
  annotation.invalidated = true;
}
