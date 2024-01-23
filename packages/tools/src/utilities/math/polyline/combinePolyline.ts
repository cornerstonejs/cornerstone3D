import { Types } from '@cornerstonejs/core';
import * as math from '..';
import { intersectLine } from '../line';
import getLineSegmentIntersectionsIndexes from './getLineSegmentIntersectionsIndexes';
import containsPoint from './containsPoint';
import getNormal2 from './getNormal2';
import { glMatrix, vec3 } from 'gl-matrix';
import getLineSegmentsIntersection from './getLineSegmentsIntersection';

enum VertexTypes {
  None = 0,
  Entering = 1,
  Exiting = -1,
}

type PolylineContext = {
  polyline: Types.Point2[];
  verticesType: VertexTypes[];
  segmentIndex: number;
};

function createPolylineContext(polyline: Types.Point2[]): PolylineContext {
  const verticesType = new Array(polyline.length).fill(VertexTypes.None);

  // Clone the polyline because line segments will be split on every intersection
  return {
    polyline: polyline.slice(),
    verticesType,
    segmentIndex: 0,
  };
}

function _getClosestIntersectionToStartPoint(
  startPoint: Types.Point2,
  endPoint: Types.Point2,
  intersectedLineSegmentsIndexes: Types.Point2[],
  intersectedPolyline: Types.Point2[]
) {
  if (!intersectedLineSegmentsIndexes.length) {
    return;
  }

  const closestDistanceSquared = Infinity;
  const closestPoint = null;

  for (let i = 0, len = intersectedLineSegmentsIndexes.length; i < len; i++) {
    const [lineSegStart, lineSegEnd] = intersectedLineSegmentsIndexes[i];
    // const lineSegment = intersectedPolyline[lineSegmentIndex];
  }
}

function runCombinePolyline(
  activePolylineContext: PolylineContext,
  otherPolylineContext: PolylineContext,
  combinedPolyline: Types.Point2[]
): void {
  const { polyline, segmentIndex: segmentIndex } = activePolylineContext;
  const { polyline: otherPolyline } = otherPolylineContext;
  const numLineSegments = polyline.length - 1;

  for (let i = segmentIndex; i < numLineSegments; i++) {
    const p1 = polyline[i];
    // DO NOT use % (mod) operator because it is much slower
    const p2Index = i === numLineSegments - 1 ? 0 : i + 1;
    const p2 = polyline[p2Index];
    const intersectedLineSegmentsIndexes = getLineSegmentIntersectionsIndexes(
      otherPolyline,
      p1,
      p2
    );

    if (intersectedLineSegmentsIndexes.length) {
      //
    }

    combinedPolyline.push();

    // const intersectionPointIndices = getFirstIntersectionWithPolyline(
    //   targetPolyline,
    //   sourceP1,
    //   sourceP2
    // );
    //

    if (intersect) {
      runCombinePolyline(
        otherPolylineContext,
        activePolylineContext,
        combinedPolyline
      );
    }
  }
}

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

function ensuresNextPointers(polylinePoints: PolylinePoint[]) {
  // Make sure all nodes point to a valid node
  for (let i = 0, len = polylinePoints.length; i < len; i++) {
    const currentPoint = polylinePoints[i];

    if (!currentPoint.next) {
      currentPoint.next = polylinePoints[i === len - 1 ? 0 : i + 1];
    }
  }
}

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

  let intersectionPointDirection = PolylinePointDirection.Entering;

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

      // lineSegment.intersectLine returns `undefined` when the intersection
      // is at one of the line vertices.
      // Examples:
      //   - [(0, 0), (1, 1)] x [(1, 1), (1, 2)]
      //   - [(0, 1), (2, 1)] x [(1, 1), (1, 2)]
      let intersectionCoordinate = math.lineSegment.intersectLine(
        p1,
        q1,
        p2,
        q2
      ) as Types.Point2;

      // TODO: Investigate why it returns `undefined` for some line segments
      // when an one of the points of each line segment are very close enough
      // being almost at the same place (workaround)
      //   Example:
      //     - p1: (184, 108.125)
      //     - q1: (183.75000000427858, 107.87500000427855)
      //     - p2: (184, 108.125)
      //     - q2: (184, 108.375)
      if (!intersectionCoordinate) {
        // debugger;

        // DEBUG
        math.lineSegment.intersectLine(p1, q1, p2, q2) as Types.Point2;

        // DEBUG
        const newIntersectionCoordinates = getLineSegmentsIntersection(
          p1,
          q1,
          p2,
          q2
        );

        console.log('>>>>> intersectionCoordinate was UNDEFINED');

        intersectionCoordinate = newIntersectionCoordinates;

        // const lineSegment1 = [p1, q1];
        // const lineSegment2 = [p2, q2];
        // let minDist = Infinity;
        //
        // for (let i = 0; i < lineSegment1.length; i++) {
        //   const pi = lineSegment1[i];
        //   for (let j = 0; j < lineSegment1.length; j++) {
        //     const pj = lineSegment2[j];
        //     const dist = math.point.distanceToPoint(pi, pj);
        //
        //     if (dist < minDist) {
        //       minDist = dist;
        //       intersectionCoordinate = pi; // or pj
        //     }
        //     console.log('>>>>> :: points (i, j) distance:', dist);
        //   }
        // }
      }

      const targetStartPointDistSquared = math.point.distanceToPointSquared(
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
        lineSegStartDistSquared: math.point.distanceToPointSquared(
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
    sourcePolyline = sourcePolyline.reverse();
  }

  const startTime = performance.now();
  const { targetPolylinePoints, sourcePolylinePoints } =
    getSourceAndTargetPointsList(targetPolyline, sourcePolyline);
  // console.log('>>>>> :: targetPolylinePoints:', targetPolylinePoints);
  // console.log('>>>>> :: sourcePolylinePoints:', sourcePolylinePoints);
  const startPoint: PolylinePoint =
    getUnvisitedOutsidePoint(targetPolylinePoints);

  // Source polyline contains target polyline
  if (!startPoint) {
    return targetPolyline.slice();
  }

  const mergedPolyline = [startPoint.coordinates];
  let currentPoint = startPoint.next;

  let debugCounter = 0;

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
    debugCounter++;

    // if (debugCounter === 30000) {
    //   debugger;
    // }
  }

  console.log(
    '>>>>> time :: mergePolyline (false):',
    performance.now() - startTime
  );

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
    sourcePolyline = sourcePolyline.reverse();
  }

  const startTime = performance.now();
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

      (window as any).currentPoint = currentPoint;
      (window as any).subtractedPolyline = subtractedPolyline;
      subtractedPolyline.push(currentPoint.coordinates);
      currentPoint = currentPoint.next;
    }

    console.log('>>>>> :: subtractedPolyline:', subtractedPolyline);
    subtractedPolylines.push(subtractedPolyline);
  }

  console.log(
    '>>>>> time :: mergePolyline (false):',
    performance.now() - startTime
  );

  return subtractedPolylines;
}

export { mergePolylines, subtractPolylines };
