import type { Types } from '@cornerstonejs/core';
import * as mathPoint from '../point';
import getLineSegmentIntersectionsIndexes from './getLineSegmentIntersectionsIndexes';
import containsPoint from './containsPoint';
import containsPoints from './containsPoints';
import intersectPolyline from './intersectPolyline';
import getNormal2 from './getNormal2';
import { glMatrix, vec3 } from 'gl-matrix';
import getLinesIntersection from './getLinesIntersection';
import {
  distanceSquared,
  EPSILON,
  getPolylineSignedArea,
  IntersectionDirection,
  isPointInPolygon,
  pointsAreEqual,
  PolylineNodeType,
  robustSegmentIntersection,
  vec2CrossZ,
  vec2Subtract,
  type AugmentedPolyNode,
  type IntersectionInfo,
} from './polylineHelper';

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
  // First, try to find unvisited vertex points that are outside
  for (let i = 0, len = polylinePoints.length; i < len; i++) {
    const point = polylinePoints[i];

    if (
      !point.visited &&
      point.position === PolylinePointPosition.Outside &&
      point.type === PolylinePointType.Vertex
    ) {
      return point;
    }
  }

  // If no vertex points found, look for intersection points that are outside
  for (let i = 0, len = polylinePoints.length; i < len; i++) {
    const point = polylinePoints[i];

    if (!point.visited && point.position === PolylinePointPosition.Outside) {
      return point;
    }
  }

  return undefined;
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

  // Check if target polyline is completely surrounded by source polyline
  const lineSegmentsIntersect = intersectPolyline(
    sourcePolyline,
    targetPolyline
  );
  const targetContainedInSource =
    !lineSegmentsIntersect && containsPoints(sourcePolyline, targetPolyline);

  if (targetContainedInSource) {
    return sourcePolyline.slice();
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
  let iterationCount = 0;
  const maxIterations = targetPolyline.length + sourcePolyline.length + 1000; // Safety limit

  while (currentPoint !== startPoint && iterationCount < maxIterations) {
    iterationCount++;

    if (
      currentPoint.type === PolylinePointType.Intersection &&
      (<PolylineIntersectionPoint>currentPoint).cloned
    ) {
      currentPoint = currentPoint.next;
      continue;
    }

    mergedPolyline.push(currentPoint.coordinates);
    currentPoint = currentPoint.next;

    // Additional safety check for null/undefined next pointer
    if (!currentPoint) {
      console.warn(
        'Broken linked list detected in mergePolylines, breaking loop'
      );
      break;
    }
  }

  if (iterationCount >= maxIterations) {
    console.warn(
      'Maximum iterations reached in mergePolylines, possible infinite loop detected'
    );
  }

  return mergedPolyline;
}

/**
 * Subtract two planar polylines (2D)
 */
export function subtractPolylinesOldVersion(
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

  // Check if target polyline is completely surrounded by source polyline
  const lineSegmentsIntersect = intersectPolyline(
    sourcePolyline,
    targetPolyline
  );
  const targetContainedInSource =
    !lineSegmentsIntersect && containsPoints(sourcePolyline, targetPolyline);

  if (targetContainedInSource) {
    return [];
  }

  const { targetPolylinePoints } = getSourceAndTargetPointsList(
    targetPolyline,
    sourcePolyline
  );

  // Check if there are any intersections at all
  const hasIntersections = targetPolylinePoints.some(
    (point) => point.type === PolylinePointType.Intersection
  );

  if (!hasIntersections) {
    // No intersections - either completely inside or completely outside
    const sourceContainsTarget = containsPoints(sourcePolyline, targetPolyline);
    return sourceContainsTarget ? [] : [targetPolyline.slice()];
  }

  let startPoint: PolylinePoint = null;
  const subtractedPolylines = [];

  let outerIterationCount = 0;
  const maxOuterIterations = Math.max(10, targetPolylinePoints.length); // More reasonable limit

  while (
    (startPoint = getUnvisitedOutsidePoint(targetPolylinePoints)) &&
    outerIterationCount < maxOuterIterations
  ) {
    outerIterationCount++;
    const subtractedPolyline = [startPoint.coordinates];
    let currentPoint = startPoint.next;
    let innerIterationCount = 0;
    const maxInnerIterations = targetPolylinePoints.length * 3; // More reasonable limit

    startPoint.visited = true;

    while (
      currentPoint !== startPoint &&
      innerIterationCount < maxInnerIterations
    ) {
      innerIterationCount++;
      currentPoint.visited = true;

      // Handle intersection points properly
      if (currentPoint.type === PolylinePointType.Intersection) {
        const intersectionPoint = currentPoint as PolylineIntersectionPoint;

        // Add the intersection point to the polyline
        subtractedPolyline.push(currentPoint.coordinates);

        // If this is a cloned intersection point, jump to its pair
        if (intersectionPoint.cloned && intersectionPoint.next) {
          currentPoint = intersectionPoint.next;
          continue;
        }
      } else {
        // Regular vertex point
        subtractedPolyline.push(currentPoint.coordinates);
      }

      currentPoint = currentPoint.next;

      // Additional safety check for null/undefined next pointer
      if (!currentPoint) {
        console.warn(
          'Broken linked list detected in subtractPolylines, breaking inner loop'
        );
        break;
      }
    }

    if (innerIterationCount >= maxInnerIterations) {
      console.warn(
        'Maximum inner iterations reached in subtractPolylines, possible infinite loop detected'
      );
    }

    // Only add polylines with at least 3 points
    if (subtractedPolyline.length >= 3) {
      subtractedPolylines.push(subtractedPolyline);
    }
  }

  if (outerIterationCount >= maxOuterIterations) {
    console.warn(
      'Maximum outer iterations reached in subtractPolylines, possible infinite loop detected'
    );
  }

  return subtractedPolylines;
}

function subtractPolylines(
  targetPolylineCoords: Types.Point2[],
  sourcePolylineCoordsInput: Types.Point2[]
): Types.Point2[][] {
  if (targetPolylineCoords.length < 3) {
    return [];
  }
  if (sourcePolylineCoordsInput.length < 3) {
    return [targetPolylineCoords.slice()];
  }

  const sourcePolylineCoords = sourcePolylineCoordsInput.slice();

  // 1. Ensure consistent winding for subtraction (e.g., target CCW, source CW)
  const targetArea = getPolylineSignedArea(targetPolylineCoords);
  const sourceArea = getPolylineSignedArea(sourcePolylineCoords);

  // Assuming target is primary, source is subtractor.
  // If target is CCW (positive area) and source is also CCW, reverse source.
  // If target is CW (negative area) and source is also CW, reverse source.
  // Essentially, they need opposite winding signs for subtraction.
  if (
    Math.sign(targetArea) === Math.sign(sourceArea) &&
    Math.abs(sourceArea) > EPSILON
  ) {
    sourcePolylineCoords.reverse();
  }

  // Early exit: Target contained in source (and no intersections)
  // This check requires more robust `containsPoints` and `intersectPolyline`
  // For now, we rely on the main algorithm to resolve this.

  // 2. Find all intersections
  const intersections: IntersectionInfo[] = [];
  for (let i = 0; i < targetPolylineCoords.length; i++) {
    const p1 = targetPolylineCoords[i];
    const p2 = targetPolylineCoords[(i + 1) % targetPolylineCoords.length];
    for (let j = 0; j < sourcePolylineCoords.length; j++) {
      const q1 = sourcePolylineCoords[j];
      const q2 = sourcePolylineCoords[(j + 1) % sourcePolylineCoords.length];
      const intersectPt = robustSegmentIntersection(p1, p2, q1, q2);
      if (intersectPt) {
        const lenP = Math.sqrt(distanceSquared(p1, p2));
        const lenQ = Math.sqrt(distanceSquared(q1, q2));
        intersections.push({
          coord: intersectPt,
          seg1Idx: i,
          seg2Idx: j,
          alpha1:
            lenP < EPSILON
              ? 0
              : Math.sqrt(distanceSquared(p1, intersectPt)) / lenP,
          alpha2:
            lenQ < EPSILON
              ? 0
              : Math.sqrt(distanceSquared(q1, intersectPt)) / lenQ,
        });
      }
    }
  }

  // 3. Build augmented polylines (linked lists of AugmentedPolyNode)
  const buildAugmentedList = (
    polyCoords: Types.Point2[],
    polyIndex: 0 | 1,
    allIntersections: IntersectionInfo[]
  ): AugmentedPolyNode[] => {
    const augmentedList: AugmentedPolyNode[] = [];
    let nodeIdCounter = 0;

    for (let i = 0; i < polyCoords.length; i++) {
      const p1 = polyCoords[i];
      // Add original vertex
      augmentedList.push({
        id: `${polyIndex}_v${nodeIdCounter++}`,
        coordinates: p1,
        type: PolylineNodeType.Vertex,
        originalPolyIndex: polyIndex,
        originalVertexIndex: i,
        next: null,
        prev: null, // To be filled
        isIntersection: false,
        visited: false,
      });

      // Find intersections on segment (p1, p_next)
      const segmentIntersections = allIntersections
        .filter(
          (isect) => (polyIndex === 0 ? isect.seg1Idx : isect.seg2Idx) === i
        )
        .sort(
          (a, b) =>
            (polyIndex === 0 ? a.alpha1 : a.alpha2) -
            (polyIndex === 0 ? b.alpha1 : b.alpha2)
        );

      for (const isect of segmentIntersections) {
        // Avoid duplicate intersection points if alpha is very close
        if (
          augmentedList.length > 0 &&
          pointsAreEqual(
            augmentedList[augmentedList.length - 1].coordinates,
            isect.coord
          )
        ) {
          if (!augmentedList[augmentedList.length - 1].isIntersection) {
            // Promote vertex to intersection if coords match
            augmentedList[augmentedList.length - 1].isIntersection = true;
            augmentedList[augmentedList.length - 1].intersectionInfo = isect; // Store for pairing
            augmentedList[augmentedList.length - 1].alpha =
              polyIndex === 0 ? isect.alpha1 : isect.alpha2;
          }
          continue;
        }
        augmentedList.push({
          id: `${polyIndex}_i${nodeIdCounter++}`,
          coordinates: isect.coord,
          type: PolylineNodeType.Intersection,
          originalPolyIndex: polyIndex,
          next: null,
          prev: null, // To be filled
          isIntersection: true,
          visited: false,
          alpha: polyIndex === 0 ? isect.alpha1 : isect.alpha2,
          intersectionInfo: isect, // Temporary, for pairing
        });
      }
    }

    // Filter out duplicate consecutive points that might have arisen
    const finalList: AugmentedPolyNode[] = [];
    if (augmentedList.length > 0) {
      finalList.push(augmentedList[0]);
      for (let i = 1; i < augmentedList.length; i++) {
        if (
          !pointsAreEqual(
            augmentedList[i].coordinates,
            finalList[finalList.length - 1].coordinates
          )
        ) {
          finalList.push(augmentedList[i]);
        } else {
          // If points are same, merge intersection property
          if (augmentedList[i].isIntersection) {
            finalList[finalList.length - 1].isIntersection = true;
            finalList[finalList.length - 1].intersectionInfo =
              augmentedList[i].intersectionInfo;
            finalList[finalList.length - 1].alpha = augmentedList[i].alpha;
          }
        }
      }
    }
    // Link nodes
    if (finalList.length > 0) {
      for (let i = 0; i < finalList.length; i++) {
        finalList[i].next = finalList[(i + 1) % finalList.length];
        finalList[i].prev =
          finalList[(i - 1 + finalList.length) % finalList.length];
      }
    }
    return finalList;
  };

  const targetAugmented = buildAugmentedList(
    targetPolylineCoords,
    0,
    intersections
  );
  const sourceAugmented = buildAugmentedList(
    sourcePolylineCoords,
    1,
    intersections
  );

  // 4. Pair intersection nodes and classify direction
  targetAugmented.forEach((tnode) => {
    if (tnode.isIntersection) {
      const tData = tnode.intersectionInfo as IntersectionInfo;
      const partner = sourceAugmented.find(
        (snode) =>
          snode.isIntersection &&
          pointsAreEqual(snode.coordinates, tnode.coordinates) &&
          (snode.intersectionInfo as IntersectionInfo).seg1Idx ===
            tData.seg1Idx && // Ensure it's the same geometric event
          (snode.intersectionInfo as IntersectionInfo).seg2Idx === tData.seg2Idx
      );
      if (partner) {
        tnode.partnerNode = partner;
        partner.partnerNode = tnode;

        // Classify direction: Target entering or exiting Source
        const p_prev = tnode.prev.coordinates;
        const p_curr = tnode.coordinates; // = partner.coordinates
        const p_next_source = partner.next.coordinates; // Next point on (reversed) source

        const v_target_arrival = vec2Subtract([0, 0], p_curr, p_prev);
        const v_source_departure = vec2Subtract([0, 0], p_next_source, p_curr);

        const crossZ = vec2CrossZ(v_target_arrival, v_source_departure);

        // This sign depends on:
        // Target winding (assume CCW after normalization if any)
        // Source winding (assume CW after normalization for subtraction)
        // If target CCW, source CW:
        //   Positive cross product means target is turning "left" relative to source's path.
        //   If source is CW, its "inside" is to its right.
        //   If target turns left across source, it's entering.
        // This needs careful geometric validation. A simpler check:
        // Midpoint of tnode.prev -> tnode segment vs sourcePoly.
        // Midpoint of tnode -> tnode.next segment vs sourcePoly.
        const midPrevTargetSeg = [
          (tnode.prev.coordinates[0] + tnode.coordinates[0]) / 2,
          (tnode.prev.coordinates[1] + tnode.coordinates[1]) / 2,
        ];

        // Use original source coordinates for point-in-polygon test, as sourceAugmented is already reversed.
        const prevSegMidpointInsideSource = isPointInPolygon(
          midPrevTargetSeg as Types.Point2,
          sourcePolylineCoordsInput
        );

        if (prevSegMidpointInsideSource) {
          tnode.intersectionDir = IntersectionDirection.Exiting; // Was inside, now hitting boundary -> exiting
        } else {
          tnode.intersectionDir = IntersectionDirection.Entering; // Was outside, now hitting boundary -> entering
        }
      } else {
        // console.warn("Unpaired intersection on target:", tnode.coordinates, tData);
        // This can happen if robustSegmentIntersection is not perfect or due to precision
        tnode.isIntersection = false; // Treat as vertex if no partner
      }
    }
  });

  // Clean up temporary data
  targetAugmented.forEach((n) => delete n.intersectionInfo);
  sourceAugmented.forEach((n) => delete n.intersectionInfo);

  // 5. Trace result polygons
  const resultPolylines: Types.Point2[][] = [];
  for (let i = 0; i < targetAugmented.length; i++) {
    const startNode = targetAugmented[i];

    if (startNode.visited || startNode.isIntersection) {
      continue;
    }
    // Start only from unvisited TARGET vertices.
    // Check if this startNode of target is outside the original source polygon.
    if (isPointInPolygon(startNode.coordinates, sourcePolylineCoordsInput)) {
      continue; // Skip if starting point is inside the subtraction area
    }

    const currentPathCoords: Types.Point2[] = [];
    let currentNode: AugmentedPolyNode = startNode;
    let onTargetList = true;
    let safetyBreak = 0;
    const maxIter = (targetAugmented.length + sourceAugmented.length) * 2;

    do {
      if (safetyBreak++ > maxIter) {
        console.warn(
          'Subtraction: Max iterations reached, possible infinite loop.'
        );
        break;
      }

      currentNode.visited = true;
      // Add coordinate if different from last, to avoid duplicate points
      if (
        currentPathCoords.length === 0 ||
        !pointsAreEqual(
          currentPathCoords[currentPathCoords.length - 1],
          currentNode.coordinates
        )
      ) {
        currentPathCoords.push(currentNode.coordinates);
      }

      if (currentNode.isIntersection) {
        if (onTargetList) {
          // Currently on target polyline's list
          if (
            currentNode.intersectionDir === IntersectionDirection.Entering &&
            currentNode.partnerNode
          ) {
            currentNode = currentNode.partnerNode; // Jump to source poly
            onTargetList = false;
            // Path continues from partnerNode, then its next.
          }
          // If Exiting or no partner, stay on target. Path continues from currentNode.next.
        } else {
          // Currently on source polyline's list
          // Intersection on source means we must be switching back to target
          if (currentNode.partnerNode) {
            currentNode = currentNode.partnerNode; // Jump back to target poly
            onTargetList = true;
            // Path continues from partnerNode, then its next.
          } else {
            // Should not happen if graph is consistent. Stay on source.
            console.warn(
              'Subtraction: Intersection on source without partner.'
            );
          }
        }
      }
      currentNode = currentNode.next; // Advance to next node on current list
    } while (currentNode !== startNode || !onTargetList); // Loop until back to startNode on the target list

    if (currentPathCoords.length >= 3) {
      // Final check for self-intersection or degenerate path could be added here
      // Remove last point if it's identical to the first (closing the loop)
      if (
        pointsAreEqual(
          currentPathCoords[0],
          currentPathCoords[currentPathCoords.length - 1]
        )
      ) {
        currentPathCoords.pop();
      }
      if (currentPathCoords.length >= 3) {
        resultPolylines.push(currentPathCoords);
      }
    }
  }
  return resultPolylines;
}

/**
 * Calculates all unique intersection points between two polylines.
 * Assumes polylines are closed (last point connects to first).
 *
 * @param polyline1 - The first polyline, an array of Point2.
 * @param polyline2 - The second polyline, an array of Point2.
 * @returns An array of unique intersection points (Types.Point2[]).
 */
function intersectPolylines(
  mainPolyCoords: Types.Point2[],
  clipPolyCoordsInput: Types.Point2[]
): Types.Point2[][] {
  if (mainPolyCoords.length < 3 || clipPolyCoordsInput.length < 3) {
    return []; // Not valid polygons
  }

  let clipPolyCoords = clipPolyCoordsInput.slice();

  // 1. Ensure consistent winding for intersection (e.g., both CCW)
  const mainArea = getPolylineSignedArea(mainPolyCoords);
  const clipArea = getPolylineSignedArea(clipPolyCoords);

  if (Math.abs(mainArea) < EPSILON || Math.abs(clipArea) < EPSILON) {
    return []; // Degenerate polygon(s)
  }

  // Make both CCW (positive area) for easier reasoning, or both CW. Let's aim for CCW.
  if (mainArea < 0) {
    // mainPoly is CW, reverse it
    mainPolyCoords = mainPolyCoords.slice().reverse();
  }
  if (clipArea < 0) {
    // clipPoly is CW, reverse it
    clipPolyCoords = clipPolyCoords.slice().reverse();
  }
  // After this, if original clipPolyCoordsInput was used for pointInPolygon, its winding matters.
  // Let's use the potentially reversed clipPolyCoords for internal consistency in PIP tests.
  const currentClipPolyForPIP = clipPolyCoords;

  // 2. Find all intersections
  const intersections: IntersectionInfo[] = [];
  for (let i = 0; i < mainPolyCoords.length; i++) {
    const p1 = mainPolyCoords[i];
    const p2 = mainPolyCoords[(i + 1) % mainPolyCoords.length];
    for (let j = 0; j < clipPolyCoords.length; j++) {
      const q1 = clipPolyCoords[j];
      const q2 = clipPolyCoords[(j + 1) % clipPolyCoords.length];
      const intersectPt = robustSegmentIntersection(p1, p2, q1, q2);
      if (intersectPt) {
        const lenP = Math.sqrt(distanceSquared(p1, p2));
        const lenQ = Math.sqrt(distanceSquared(q1, q2));
        intersections.push({
          coord: [...intersectPt],
          seg1Idx: i, // Corresponds to mainPoly
          seg2Idx: j, // Corresponds to clipPoly
          alpha1:
            lenP < EPSILON
              ? 0
              : Math.sqrt(distanceSquared(p1, intersectPt)) / lenP,
          alpha2:
            lenQ < EPSILON
              ? 0
              : Math.sqrt(distanceSquared(q1, intersectPt)) / lenQ,
        });
      }
    }
  }

  // 3. Handle cases with no intersections
  if (intersections.length === 0) {
    // Check for full containment
    if (
      isPointInPolygon(mainPolyCoords[0], currentClipPolyForPIP) &&
      mainPolyCoords.every((pt) => isPointInPolygon(pt, currentClipPolyForPIP))
    ) {
      return [[...mainPolyCoords.map((p) => [...p] as Types.Point2)]]; // Main is inside Clip
    }
    if (
      isPointInPolygon(clipPolyCoords[0], mainPolyCoords) &&
      clipPolyCoords.every((pt) => isPointInPolygon(pt, mainPolyCoords))
    ) {
      return [[...clipPolyCoords.map((p) => [...p] as Types.Point2)]]; // Clip is inside Main
    }
    return []; // No intersection, no containment
  }

  // 4. Build augmented polylines (linked lists of AugmentedPolyNode)
  const buildAugmentedList = (
    polyCoords: Types.Point2[],
    polyIndex: 0 | 1, // 0 for main, 1 for clip
    allIntersections: IntersectionInfo[]
  ): AugmentedPolyNode[] => {
    const augmentedList: AugmentedPolyNode[] = [];
    let nodeIdCounter = 0;

    for (let i = 0; i < polyCoords.length; i++) {
      const p1 = polyCoords[i];
      augmentedList.push({
        id: `${polyIndex}_v${nodeIdCounter++}`,
        coordinates: [...p1],
        type: PolylineNodeType.Vertex,
        originalPolyIndex: polyIndex,
        originalVertexIndex: i,
        next: null,
        prev: null,
        isIntersection: false,
        visited: false,
        processedInPath: false, // Initialize new flag
        intersectionDir: IntersectionDirection.Unknown, // Initialize
      });

      const segmentIntersections = allIntersections
        .filter(
          (isect) => (polyIndex === 0 ? isect.seg1Idx : isect.seg2Idx) === i
        )
        .sort(
          (a, b) =>
            (polyIndex === 0 ? a.alpha1 : a.alpha2) -
            (polyIndex === 0 ? b.alpha1 : b.alpha2)
        );

      for (const isect of segmentIntersections) {
        if (
          augmentedList.length > 0 &&
          pointsAreEqual(
            augmentedList[augmentedList.length - 1].coordinates,
            isect.coord
          )
        ) {
          const lastNode = augmentedList[augmentedList.length - 1];
          if (!lastNode.isIntersection) {
            lastNode.isIntersection = true;
            lastNode.intersectionInfo = isect;
            lastNode.alpha = polyIndex === 0 ? isect.alpha1 : isect.alpha2;
            lastNode.type = PolylineNodeType.Intersection;
          }
          continue;
        }
        augmentedList.push({
          id: `${polyIndex}_i${nodeIdCounter++}`,
          coordinates: [...isect.coord],
          type: PolylineNodeType.Intersection,
          originalPolyIndex: polyIndex,
          next: null,
          prev: null,
          isIntersection: true,
          visited: false,
          processedInPath: false, // Initialize
          alpha: polyIndex === 0 ? isect.alpha1 : isect.alpha2,
          intersectionInfo: isect,
          intersectionDir: IntersectionDirection.Unknown, // Initialize
        });
      }
    }

    const finalList: AugmentedPolyNode[] = [];
    if (augmentedList.length > 0) {
      finalList.push(augmentedList[0]);
      for (let i = 1; i < augmentedList.length; i++) {
        if (
          !pointsAreEqual(
            augmentedList[i].coordinates,
            finalList[finalList.length - 1].coordinates
          )
        ) {
          finalList.push(augmentedList[i]);
        } else {
          const lastNodeInFinal = finalList[finalList.length - 1];
          if (
            augmentedList[i].isIntersection &&
            augmentedList[i].intersectionInfo
          ) {
            lastNodeInFinal.isIntersection = true;
            lastNodeInFinal.intersectionInfo =
              augmentedList[i].intersectionInfo;
            lastNodeInFinal.alpha = augmentedList[i].alpha;
            lastNodeInFinal.type = PolylineNodeType.Intersection;
          }
        }
      }
    }

    if (
      finalList.length > 1 &&
      pointsAreEqual(
        finalList[0].coordinates,
        finalList[finalList.length - 1].coordinates
      )
    ) {
      const firstNode = finalList[0];
      const lastNodePopped = finalList.pop()!; // remove last, it's a duplicate of first
      if (
        lastNodePopped.isIntersection &&
        !firstNode.isIntersection &&
        lastNodePopped.intersectionInfo
      ) {
        firstNode.isIntersection = true;
        firstNode.intersectionInfo = lastNodePopped.intersectionInfo;
        firstNode.alpha = lastNodePopped.alpha;
        firstNode.type = PolylineNodeType.Intersection;
      }
    }

    if (finalList.length > 0) {
      for (let i = 0; i < finalList.length; i++) {
        finalList[i].next = finalList[(i + 1) % finalList.length];
        finalList[i].prev =
          finalList[(i - 1 + finalList.length) % finalList.length];
      }
    }
    return finalList;
  };

  const mainAugmented = buildAugmentedList(mainPolyCoords, 0, intersections);
  const clipAugmented = buildAugmentedList(clipPolyCoords, 1, intersections);

  if (mainAugmented.length === 0 || clipAugmented.length === 0) {
    return [];
  }

  // 5. Pair intersection nodes and classify direction (Entry/Exit)
  // For a node on mainAugmented, 'Entering' means mainPoly enters clipPoly.
  // 'Exiting' means mainPoly exits clipPoly.
  mainAugmented.forEach((mainNode) => {
    if (mainNode.isIntersection && mainNode.intersectionInfo) {
      const mainIntersectData = mainNode.intersectionInfo;
      const partnerNode = clipAugmented.find(
        (clipNode) =>
          clipNode.isIntersection &&
          clipNode.intersectionInfo &&
          pointsAreEqual(clipNode.coordinates, mainNode.coordinates) &&
          clipNode.intersectionInfo.seg1Idx === mainIntersectData.seg1Idx &&
          clipNode.intersectionInfo.seg2Idx === mainIntersectData.seg2Idx
      );

      if (partnerNode) {
        mainNode.partnerNode = partnerNode;
        partnerNode.partnerNode = mainNode; // Bidirectional link

        // Classify for mainNode:
        // Point before mainNode on mainPoly: mainNode.prev.coordinates
        // Point after mainNode on mainPoly: mainNode.next.coordinates
        // Point after partnerNode on clipPoly: partnerNode.next.coordinates
        // (Assumes both mainPoly and clipPoly are CCW after normalization)

        // Vector from mainNode.prev to mainNode (arrival on main)
        const v_arrival_main = vec2Subtract(
          [0, 0],
          mainNode.coordinates,
          mainNode.prev.coordinates
        );
        // Vector from mainNode (partner) to partnerNode.next (departure on clip)
        const v_departure_clip = vec2Subtract(
          [0, 0],
          partnerNode.next.coordinates,
          partnerNode.coordinates
        );

        // Cross product determines if main is turning "into" or "out of" clip
        // If main and clip are CCW:
        // cross > 0: main turns left relative to clip's segment => Entering clip
        // cross < 0: main turns right relative to clip's segment => Exiting clip
        const crossZ = vec2CrossZ(v_arrival_main, v_departure_clip);

        if (crossZ > EPSILON) {
          mainNode.intersectionDir = IntersectionDirection.Entering;
          partnerNode.intersectionDir = IntersectionDirection.Exiting; // From clip's perspective, main is coming in
        } else if (crossZ < -EPSILON) {
          mainNode.intersectionDir = IntersectionDirection.Exiting;
          partnerNode.intersectionDir = IntersectionDirection.Entering; // From clip's perspective, main is leaving
        } else {
          // Collinear case at intersection - this is complex.
          // A more robust method: check midpoint of segment mainNode.prev->mainNode against clipPoly
          const midPrevMainSeg = [
            (mainNode.prev.coordinates[0] + mainNode.coordinates[0]) / 2,
            (mainNode.prev.coordinates[1] + mainNode.coordinates[1]) / 2,
          ];
          if (
            isPointInPolygon(
              midPrevMainSeg as Types.Point2,
              currentClipPolyForPIP
            )
          ) {
            // Previous segment was inside clip, so this intersection is an Exit for mainPoly
            mainNode.intersectionDir = IntersectionDirection.Exiting;
            partnerNode.intersectionDir = IntersectionDirection.Entering; // Mirror for clip
          } else {
            // Previous segment was outside clip, so this intersection is an Entry for mainPoly
            mainNode.intersectionDir = IntersectionDirection.Entering;
            partnerNode.intersectionDir = IntersectionDirection.Exiting; // Mirror for clip
          }
        }
      } else {
        // Demote if no partner: might be a vertex of one on edge of other, not a true crossing.
        mainNode.isIntersection = false;
        mainNode.intersectionInfo = undefined;
      }
    }
  });

  // 6. Trace result polygons for Intersection
  const resultPolygons: Types.Point2[][] = [];

  for (const startCand of mainAugmented) {
    if (
      !startCand.isIntersection ||
      startCand.visited ||
      startCand.intersectionDir !== IntersectionDirection.Entering
    ) {
      continue; // Start only from unvisited "Entering" intersection points on the main polygon
    }

    let currentPathCoords: Types.Point2[] = [];
    let currentNode: AugmentedPolyNode = startCand;
    let onMainList = true; // Start on main list, about to jump to clip list
    const pathStartNode = startCand; // Keep track of the very first node of this path
    let safetyBreak = 0;
    const maxIter = (mainAugmented.length + clipAugmented.length) * 2;

    // Mark all nodes in this potential path with a temporary 'processedInPath' flag
    // to handle complex cases where a node might be visited by one path attempt
    // but should be available for another if the first attempt doesn't complete.
    // Reset this flag before each new path attempt from a new startCand.
    mainAugmented.forEach((n) => (n.processedInPath = false));
    clipAugmented.forEach((n) => (n.processedInPath = false));

    do {
      if (safetyBreak++ > maxIter) {
        console.warn(
          'Intersection: Max iterations in path tracing.',
          pathStartNode.id,
          currentNode.id
        );
        currentPathCoords = []; // Discard incomplete path
        break;
      }

      if (currentNode.processedInPath && currentNode !== pathStartNode) {
        // Loop detected before closing properly
        // This can happen in complex scenarios, especially with shared boundaries or self-intersections not handled upstream
        console.warn(
          'Intersection: Path processing loop detected, discarding path segment.',
          pathStartNode.id,
          currentNode.id
        );
        currentPathCoords = [];
        break;
      }
      currentNode.processedInPath = true; // Mark as processed for *this* path attempt
      currentNode.visited = true; // Mark as globally visited once part of any successful path or processed

      if (
        currentPathCoords.length === 0 ||
        !pointsAreEqual(
          currentPathCoords[currentPathCoords.length - 1],
          currentNode.coordinates
        )
      ) {
        currentPathCoords.push([...currentNode.coordinates]);
      }

      let switchedList = false;
      if (currentNode.isIntersection && currentNode.partnerNode) {
        if (onMainList) {
          // Currently on main list
          // For intersection, if we are on main and hit an intersection, we always switch to clip.
          // The type of intersection (Entry/Exit on mainNode) guided our *start*.
          // Once tracing, main -> clip.
          currentNode = currentNode.partnerNode;
          onMainList = false;
          switchedList = true;
        } else {
          // Currently on clip list
          // If on clip and hit an intersection, we always switch back to main.
          currentNode = currentNode.partnerNode;
          onMainList = true;
          switchedList = true;
        }
      }

      if (!switchedList) {
        currentNode = currentNode.next;
      } else {
        // After switching, we must advance on the *new* list
        currentNode = currentNode.next;
      }
    } while (
      currentNode !== pathStartNode ||
      (onMainList && currentNode.originalPolyIndex !== 0) ||
      (!onMainList && currentNode.originalPolyIndex !== 1)
    );
    // The loop condition is tricky: back to pathStartNode AND on its original list type.
    // More simply: `while (currentNode !== pathStartNode || (onMainList !== (pathStartNode.originalPolyIndex === 0)))`
    // This means if pathStartNode was on main, we must be onMainList when we return to it.

    if (safetyBreak > maxIter || currentPathCoords.length === 0) {
      // Path was discarded or didn't form
    } else if (
      currentPathCoords.length > 0 &&
      pointsAreEqual(
        currentPathCoords[0],
        currentPathCoords[currentPathCoords.length - 1]
      )
    ) {
      currentPathCoords.pop(); // Remove redundant closing point
    }

    if (currentPathCoords.length >= 3) {
      // Ensure the resulting polygon has the correct winding (e.g., CCW)
      // This is important if multiple disjoint intersection areas are formed.
      // The tracing rule should naturally produce this if inputs are CCW.
      const resultArea = getPolylineSignedArea(currentPathCoords);
      if (mainArea > 0 && resultArea < 0) {
        // If main was CCW, result should be CCW
        currentPathCoords.reverse();
      } else if (mainArea < 0 && resultArea > 0) {
        // If main was CW, result should be CW
        currentPathCoords.reverse();
      }
      resultPolygons.push(currentPathCoords.map((p) => [...p]));
    }
  }

  return resultPolygons;
}
export { mergePolylines, subtractPolylines, intersectPolylines };
