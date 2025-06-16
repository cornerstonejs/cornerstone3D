import type { Types } from '@cornerstonejs/core';
import { vec2 } from 'gl-matrix';
import getSignedArea from './getSignedArea';
import {
  EPSILON,
  IntersectionDirection,
  pointsAreEqual,
  PolylineNodeType,
  robustSegmentIntersection,
  type AugmentedPolyNode,
  type IntersectionInfo,
} from './robustSegmentIntersection';
import containsPoint from './containsPoint';
import arePolylinesIdentical from './arePolylinesIdentical';

export default function subtractPolylines(
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

  // Early detection for identical polylines
  if (arePolylinesIdentical(targetPolylineCoords, sourcePolylineCoordsInput)) {
    return []; // Subtracting identical polylines results in empty set
  }

  // 1. Ensure consistent winding for subtraction (e.g., target CCW, source CW)
  const targetArea = getSignedArea(targetPolylineCoords);
  const sourceArea = getSignedArea(sourcePolylineCoords);

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
        const lenP = Math.sqrt(vec2.squaredDistance(p1, p2));
        const lenQ = Math.sqrt(vec2.squaredDistance(q1, q2));
        intersections.push({
          coord: intersectPt,
          seg1Idx: i,
          seg2Idx: j,
          alpha1:
            lenP < EPSILON
              ? 0
              : Math.sqrt(vec2.squaredDistance(p1, intersectPt)) / lenP,
          alpha2:
            lenQ < EPSILON
              ? 0
              : Math.sqrt(vec2.squaredDistance(q1, intersectPt)) / lenQ,
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

        const v_target_arrival = vec2.subtract(
          vec2.create(),
          p_curr,
          p_prev
        ) as Types.Point2;
        const v_source_departure = vec2.subtract(
          vec2.create(),
          p_next_source,
          p_curr
        ) as Types.Point2;

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
        const prevSegMidpointInsideSource = containsPoint(
          sourcePolylineCoordsInput,
          midPrevTargetSeg as Types.Point2
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
    if (containsPoint(sourcePolylineCoordsInput, startNode.coordinates)) {
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
