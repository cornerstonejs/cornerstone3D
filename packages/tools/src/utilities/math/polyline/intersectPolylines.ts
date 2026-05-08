import type { Types } from '@cornerstonejs/core';
import { vec2 } from 'gl-matrix';
import containsPoint from './containsPoint';
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

/**
 * Calculates all unique intersection points between two polylines.
 * Assumes polylines are closed (last point connects to first).
 *
 * @param polyline1 - The first polyline, an array of Point2.
 * @param polyline2 - The second polyline, an array of Point2.
 * @returns An array of unique intersection points (Types.Point2[]).
 */
export default function intersectPolylines(
  mainPolyCoords: Types.Point2[],
  clipPolyCoordsInput: Types.Point2[]
): Types.Point2[][] {
  if (mainPolyCoords.length < 3 || clipPolyCoordsInput.length < 3) {
    return []; // Not valid polygons
  }

  let clipPolyCoords = clipPolyCoordsInput.slice();

  // 1. Ensure consistent winding for intersection (e.g., both CCW)
  const mainArea = getSignedArea(mainPolyCoords);
  const clipArea = getSignedArea(clipPolyCoords);

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
        const lenP = Math.sqrt(vec2.squaredDistance(p1, p2));
        const lenQ = Math.sqrt(vec2.squaredDistance(q1, q2));
        intersections.push({
          coord: [...intersectPt],
          seg1Idx: i, // Corresponds to mainPoly
          seg2Idx: j, // Corresponds to clipPoly
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

  // 3. Handle cases with no intersections
  if (intersections.length === 0) {
    // Check for full containment
    if (
      containsPoint(currentClipPolyForPIP, mainPolyCoords[0]) &&
      mainPolyCoords.every((pt) => containsPoint(currentClipPolyForPIP, pt))
    ) {
      return [[...mainPolyCoords.map((p) => [...p] as Types.Point2)]]; // Main is inside Clip
    }
    if (
      containsPoint(mainPolyCoords, clipPolyCoords[0]) &&
      clipPolyCoords.every((pt) => containsPoint(mainPolyCoords, pt))
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
        const v_arrival_main = vec2.subtract(
          vec2.create(),
          mainNode.coordinates,
          mainNode.prev.coordinates
        ) as Types.Point2;
        // Vector from mainNode (partner) to partnerNode.next (departure on clip)
        const v_departure_clip = vec2.subtract(
          vec2.create(),
          partnerNode.next.coordinates,
          partnerNode.coordinates
        ) as Types.Point2;

        // Cross product determines if main is turning "into" or "out of" clip
        // If main and clip are CCW:
        // cross > 0: main turns left relative to clip's segment => Entering clip
        // cross < 0: main turns right relative to clip's segment => Exiting clip
        const crossZ =
          v_arrival_main[0] * v_departure_clip[1] -
          v_arrival_main[1] * v_departure_clip[0];

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
            containsPoint(currentClipPolyForPIP, midPrevMainSeg as Types.Point2)
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
      const resultArea = getSignedArea(currentPathCoords);
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
