import { Types } from '@cornerstonejs/core';
import * as mathPoint from '../point';
import getLineSegmentIntersectionsIndexes from './getLineSegmentIntersectionsIndexes';
import containsPoint from './containsPoint';
import getNormal2 from './getNormal2';
import { glMatrix, vec3 } from 'gl-matrix';
import getLinesIntersection from './getLinesIntersection';

enum PolylinePointType {
  Vertex,
  Intersection,
}

// Position of the point related to the intersection region
enum PolylinePointPosition {
  Outside = -1,
  Edge = 0,
  Inside = 1,
}

// Direction from last point to the intersection point to know if it is entering
// or exiting the intersection region
enum PolylinePointDirection {
  Exiting = -1,
  Unknown = 0,
  Entering = 1,
}

type PolylinePoint = {
  type: PolylinePointType;
  coordinates: Types.Point2;
  position?: PolylinePointPosition;
  visited: boolean;
  next: PolylinePoint;
};

type PolylineIntersectionPoint = PolylinePoint & {
  direction: PolylinePointDirection;
  cloned?: boolean;
};

/**
 * Ensure all polyline point objects are pointing to the next object in case
 * it is still not point to anyone.
 * @param polylinePoints - Array that contains all polyline points (vertices and intersections)
 */
function ensuresNextPointers(polylinePoints: PolylinePoint[]) {
  // Make sure all nodes point to a valid node
  for (let i = 0, len = polylinePoints.length; i < len; i++) {
    const currentPoint = polylinePoints[i];

    if (!currentPoint.next) {
      currentPoint.next = polylinePoints[i === len - 1 ? 0 : i + 1];
    }
  }
}

/**
 * Creates one linked list per polyline that contains all vertices and intersections
 * found while walking along the edges.
 *
 * @param targetPolyline - Target polyline
 * @param sourcePolyline - Source polyline
 * @returns Two linked lists with all vertices and intersections.
 */
function getSourceAndTargetPointsList(
  targetPolyline: Types.Point2[],
  sourcePolyline: Types.Point2[]
) {
  const targetPolylinePoints: PolylinePoint[] = [];
  const sourcePolylinePoints: PolylinePoint[] = [];
  const sourceIntersectionsCache = new Map<
    number,
    PolylineIntersectionPoint[]
  >();

  const isFirstPointInside = containsPoint(sourcePolyline, targetPolyline[0]);

  let intersectionPointDirection = isFirstPointInside
    ? PolylinePointDirection.Exiting
    : PolylinePointDirection.Entering;

  // Store all vertices and intersection for target contour
  for (let i = 0, len = targetPolyline.length; i < len; i++) {
    const p1 = targetPolyline[i];
    const pointInside = containsPoint(sourcePolyline, p1);
    const vertexPoint: PolylinePoint = {
      type: PolylinePointType.Vertex,
      coordinates: p1,
      position: pointInside
        ? PolylinePointPosition.Inside
        : PolylinePointPosition.Outside,
      visited: false,
      next: null,
    };

    targetPolylinePoints.push(vertexPoint);

    const q1 = targetPolyline[i === len - 1 ? 0 : i + 1];
    const intersectionsInfo = getLineSegmentIntersectionsIndexes(
      sourcePolyline,
      p1,
      q1
    ).map((intersectedLineSegment) => {
      const sourceLineSegmentId: number = intersectedLineSegment[0];
      const p2 = sourcePolyline[intersectedLineSegment[0]];
      const q2 = sourcePolyline[intersectedLineSegment[1]];

      // lineSegment.intersectLine returns the midpoint of the four points
      // when the lines are parallel or co-incident.  Otherwise it will return
      // an extension of the line.
      const intersectionCoordinate = getLinesIntersection(
        p1,
        q1,
        p2,
        q2
      ) as Types.Point2;

      const targetStartPointDistSquared = mathPoint.distanceToPointSquared(
        p1,
        intersectionCoordinate
      );

      return {
        sourceLineSegmentId,
        coordinate: intersectionCoordinate,
        targetStartPointDistSquared,
      };
    });

    intersectionsInfo.sort(
      (left, right) =>
        left.targetStartPointDistSquared - right.targetStartPointDistSquared
    );

    intersectionsInfo.forEach((intersectionInfo) => {
      const { sourceLineSegmentId, coordinate: intersectionCoordinate } =
        intersectionInfo;

      // Intersection point to be added to the target polyline list
      const targetEdgePoint: PolylineIntersectionPoint = {
        type: PolylinePointType.Intersection,
        coordinates: intersectionCoordinate,
        position: PolylinePointPosition.Edge,
        direction: intersectionPointDirection,
        visited: false,
        next: null,
      };

      // Intersection point to be added to the source polyline list.
      // At this point there is no way to know if the point is entering or
      // exiting the intersection region but that is not going to be used
      // hence it is set to "unknown".
      const sourceEdgePoint: PolylineIntersectionPoint = {
        ...targetEdgePoint,
        direction: PolylinePointDirection.Unknown,
        cloned: true,
      };

      if (intersectionPointDirection === PolylinePointDirection.Entering) {
        targetEdgePoint.next = sourceEdgePoint;
      } else {
        sourceEdgePoint.next = targetEdgePoint;
      }

      let sourceIntersectionPoints =
        sourceIntersectionsCache.get(sourceLineSegmentId);

      if (!sourceIntersectionPoints) {
        sourceIntersectionPoints = [];
        sourceIntersectionsCache.set(
          sourceLineSegmentId,
          sourceIntersectionPoints
        );
      }

      targetPolylinePoints.push(targetEdgePoint);
      sourceIntersectionPoints.push(sourceEdgePoint);

      // Switches from "exiting" to "entering" and vice-versa
      intersectionPointDirection *= -1;
    });
  }

  // Store all vertices and intersections for source contour
  for (let i = 0, len = sourcePolyline.length; i < len; i++) {
    const lineSegmentId: number = i;
    const p1 = sourcePolyline[i];
    const vertexPoint: PolylinePoint = {
      type: PolylinePointType.Vertex,
      coordinates: p1,
      visited: false,
      next: null,
    };

    sourcePolylinePoints.push(vertexPoint);

    const sourceIntersectionPoints =
      sourceIntersectionsCache.get(lineSegmentId);

    if (!sourceIntersectionPoints?.length) {
      continue;
    }

    // Calculate the distance between each intersection point to the start point
    // of the line segment, sort them by distance and return a sorted array that
    // contains all intersection points.
    sourceIntersectionPoints
      .map((intersectionPoint) => ({
        intersectionPoint,
        lineSegStartDistSquared: mathPoint.distanceToPointSquared(
          p1,
          intersectionPoint.coordinates
        ),
      }))
      .sort(
        (left, right) =>
          left.lineSegStartDistSquared - right.lineSegStartDistSquared
      )
      .map(({ intersectionPoint }) => intersectionPoint)
      .forEach((intersectionPoint) =>
        sourcePolylinePoints.push(intersectionPoint)
      );
  }

  ensuresNextPointers(targetPolylinePoints);
  ensuresNextPointers(sourcePolylinePoints);

  return { targetPolylinePoints, sourcePolylinePoints };
}

/**
 * Get the next unvisited polyline points that is outside the intersection region.
 * @param polylinePoints - All polyline points (vertices and intersections)
 * @returns Any unvisited point that is outside the intersection region if it
 * exists or `undefined` otherwise
 */
function getUnvisitedOutsidePoint(polylinePoints: PolylinePoint[]) {
  for (let i = 0, len = polylinePoints.length; i < len; i++) {
    const point = polylinePoints[i];

    if (!point.visited && point.position === PolylinePointPosition.Outside) {
      return point;
    }
  }
}

/**
 * Merge two planar polylines (2D)
 */
function mergePolylines(
  targetPolyline: Types.Point2[],
  sourcePolyline: Types.Point2[]
) {
  const targetNormal = getNormal2(targetPolyline);
  const sourceNormal = getNormal2(sourcePolyline);
  const dotNormals = vec3.dot(sourceNormal, targetNormal);

  // Both polylines need to be CW or CCW to be merged and one of them needs to
  // be reversed if theirs orientation are not the same
  if (!glMatrix.equals(1, dotNormals)) {
    sourcePolyline = sourcePolyline.slice().reverse();
  }

  const { targetPolylinePoints } = getSourceAndTargetPointsList(
    targetPolyline,
    sourcePolyline
  );
  const startPoint: PolylinePoint =
    getUnvisitedOutsidePoint(targetPolylinePoints);

  // Source polyline contains target polyline
  if (!startPoint) {
    return targetPolyline.slice();
  }

  const mergedPolyline = [startPoint.coordinates];
  let currentPoint = startPoint.next;

  while (currentPoint !== startPoint) {
    if (
      currentPoint.type === PolylinePointType.Intersection &&
      (<PolylineIntersectionPoint>currentPoint).cloned
    ) {
      currentPoint = currentPoint.next;
      continue;
    }

    mergedPolyline.push(currentPoint.coordinates);
    currentPoint = currentPoint.next;
  }

  return mergedPolyline;
}

/**
 * Subtract two planar polylines (2D)
 */
function subtractPolylines(
  targetPolyline: Types.Point2[],
  sourcePolyline: Types.Point2[]
): Types.Point2[][] {
  const targetNormal = getNormal2(targetPolyline);
  const sourceNormal = getNormal2(sourcePolyline);
  const dotNormals = vec3.dot(sourceNormal, targetNormal);

  // The polylines need to have different orientation (CW+CCW or CCW+CW) to be
  // subtracted and one of them needs to be reversed if theirs orientation are
  // the same
  if (!glMatrix.equals(-1, dotNormals)) {
    sourcePolyline = sourcePolyline.slice().reverse();
  }

  const { targetPolylinePoints } = getSourceAndTargetPointsList(
    targetPolyline,
    sourcePolyline
  );
  let startPoint: PolylinePoint = null;
  const subtractedPolylines = [];

  while ((startPoint = getUnvisitedOutsidePoint(targetPolylinePoints))) {
    const subtractedPolyline = [startPoint.coordinates];
    let currentPoint = startPoint.next;

    startPoint.visited = true;

    while (currentPoint !== startPoint) {
      currentPoint.visited = true;

      if (
        currentPoint.type === PolylinePointType.Intersection &&
        (<PolylineIntersectionPoint>currentPoint).cloned
      ) {
        currentPoint = currentPoint.next;
        continue;
      }

      subtractedPolyline.push(currentPoint.coordinates);
      currentPoint = currentPoint.next;
    }

    subtractedPolylines.push(subtractedPolyline);
  }

  return subtractedPolylines;
}

export { mergePolylines, subtractPolylines };
