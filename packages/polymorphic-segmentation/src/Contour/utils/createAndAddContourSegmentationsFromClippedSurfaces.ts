import { utilities, type Types } from '@cornerstonejs/core';
import {
  PlanarFreehandContourSegmentationTool,
  annotation,
} from '@cornerstonejs/tools';
import type { RawContourData } from '../contourComputationStrategies';
import { vec3 } from 'gl-matrix';

/**
 * Finds the best contour from a lines array for normal calculation.
 * Prioritizes contours with more than the specified minimum points for better accuracy.
 *
 * @param lines - Flat array encoding multiple polylines. Format: [pointCount1, id1, id2, ..., pointCount2, id1, id2, ...].
 * @param [minPreferredPoints=3] - The minimum number of points to prefer for better normal calculation accuracy.
 * @returns The best contour information or null if no suitable contour is found.
 */
function findBestContourForNormalCalculation(
  lines: number[],
  minPreferredPoints: number = 3
): {
  contourIndex: number;
  pointCount: number;
  pointIndices: number[];
} | null {
  let bestContourIndex = 0;
  let bestCount = 0;
  let currentIndex = 0;

  // Iterate through all contours to find the one with the most points (preferably > minPreferredPoints)
  while (currentIndex < lines.length) {
    const count = lines[currentIndex];
    if (count < 2) {
      currentIndex += count + 1;
      continue;
    }

    // Prefer contours with more than minPreferredPoints, otherwise take the largest available
    if (count > minPreferredPoints && bestCount <= minPreferredPoints) {
      bestContourIndex = currentIndex;
      bestCount = count;
      break; // Found a good contour with > minPreferredPoints, use it
    } else if (count > bestCount) {
      bestContourIndex = currentIndex;
      bestCount = count;
    }

    currentIndex += count + 1;
  }

  if (bestCount < 2) {
    return null;
  }

  const pointIndices = lines.slice(
    bestContourIndex + 1,
    bestContourIndex + 1 + bestCount
  );

  return {
    contourIndex: bestContourIndex,
    pointCount: bestCount,
    pointIndices,
  };
}

/**
 * Checks if a planar polyline lies in a plane that is parallel to a reference plane.
 *
 * This function operates under the assumption that the polyline is flat (all its
 * points lie on a single plane).
 *
 * When multiple contours are present in the lines array, the function searches for
 * the best contour to use for normal calculation, prioritizing contours with more
 * than 3 points for better accuracy in determining the polyline's plane normal.
 *
 * It determines the polyline's own plane normal and checks if that normal is parallel
 * to the given `planeNormal`. When the normals are parallel, the planes are also parallel.
 *
 * If the polyline is collinear (a straight line), it checks if the line's
 * direction is parallel to the `planeNormal`, meaning the line lies in a plane
 * parallel to the reference plane.
 *
 * @param lines - Flat array encoding multiple polylines. Format: [pointCount1, id1, id2, ..., pointCount2, id1, id2, ...].
 * @param points - Flat array of 3D point coordinates [x1, y1, z1, ...].
 * @param planeNormal - The normal vector of the reference plane to check against.
 * @param [dotProductTolerance=0.99] - The minimum absolute value the dot
 *   product can have for the normals to be considered parallel. A value of 1.0 indicates perfect parallelism.
 * @returns True if the polyline lies in a plane parallel to the reference plane.
 */
function isPolylineParallelToPlane(
  lines: number[],
  points: number[],
  planeNormal: vec3,
  dotProductTolerance: number = 0.99
) {
  // Find the best contour for normal calculation (preferably with > 3 points)
  const bestContour = findBestContourForNormalCalculation(lines);

  if (!bestContour) {
    // Cannot determine direction or plane.
    return false;
  }

  const { pointCount: count, pointIndices: ids } = bestContour;
  const _p_v1 = vec3.create();
  const _p_v2 = vec3.create();
  const _p_p0 = vec3.create();
  const _p_p1 = vec3.create();
  const _p_p2 = vec3.create();
  const _p_polylineNormal = vec3.create();
  const _p_planeNormal = vec3.create();

  // --- Find the normal of the plane containing the polyline ---

  // Get first point P0.
  vec3.set(
    _p_p0,
    points[ids[0] * 3],
    points[ids[0] * 3 + 1],
    points[ids[0] * 3 + 2]
  );

  // Find a second, distinct point P1.
  let p1_found = false;
  for (let i = 1; i < count; i++) {
    vec3.set(
      _p_p1,
      points[ids[i] * 3],
      points[ids[i] * 3 + 1],
      points[ids[i] * 3 + 2]
    );
    if (!vec3.equals(_p_p0, _p_p1)) {
      p1_found = true;
      break;
    }
  }

  if (!p1_found) {
    // Only one unique point exists, no direction or plane.
    return false;
  }

  // Create first vector for the cross product.
  vec3.subtract(_p_v1, _p_p1, _p_p0);

  // Find a third point P2 that is not collinear with P0 and P1.
  let p2_found = false;
  for (let i = 2; i < count; i++) {
    vec3.set(
      _p_p2,
      points[ids[i] * 3],
      points[ids[i] * 3 + 1],
      points[ids[i] * 3 + 2]
    );
    vec3.subtract(_p_v2, _p_p2, _p_p0);
    vec3.cross(_p_polylineNormal, _p_v1, _p_v2);
    // If the cross product has a non-zero length, the points are not collinear.
    if (vec3.length(_p_polylineNormal) > 1e-6) {
      p2_found = true;
      break;
    }
  }

  // Normalize the input plane normal for a consistent dot product.
  vec3.normalize(_p_planeNormal, planeNormal);

  if (p2_found) {
    // CASE 1: The polyline is a plane. Check if its normal is parallel to the given normal.
    // When normals are parallel, the planes are also parallel.
    vec3.normalize(_p_polylineNormal, _p_polylineNormal);
    const dot = vec3.dot(_p_polylineNormal, _p_planeNormal);
    return Math.abs(dot) >= dotProductTolerance;
  } else {
    // CASE 2: The polyline is a straight line (collinear).
    // The direction is already in _p_v1 (from P1 - P0).
    // Check if its direction is parallel to the given normal.
    // When the line direction is parallel to the normal, the line lies in a plane parallel to the reference plane.
    vec3.normalize(_p_v1, _p_v1);
    const dot = vec3.dot(_p_v1, _p_planeNormal);
    return Math.abs(dot) >= dotProductTolerance;
  }
}

const { addAnnotation } = annotation.state;
/**
 * Creates and adds contour segmentations from a clipped surface.
 *
 * @param rawContourData - The raw contour data.
 * @param viewport - The viewport.
 * @param segmentationId - The segmentation ID.
 */
export function createAndAddContourSegmentationsFromClippedSurfaces(
  rawContourData: RawContourData,
  viewport: Types.IViewport,
  segmentationId: string
) {
  const annotationUIDsMap = new Map<number, Set<string>>();
  if (!viewport) {
    console.warn('Invalid viewport given');
    return;
  }

  const camera = viewport.getCamera();
  if (!camera) {
    console.warn('Camera not available in viewport');
    return;
  }
  const planeNormal = camera.viewPlaneNormal;

  for (const [segmentIndex, contoursData] of rawContourData) {
    for (const contourData of contoursData) {
      const { points, lines } = contourData;
      if (!isPolylineParallelToPlane(lines, points, planeNormal)) {
        continue;
      }

      const { lineSegments, linesNumberOfPoints } =
        _extractLineSegments(contourData);

      // There may be a few lines as the surface might not be closed and could have holes in it.
      // Currently, we simply render the generated contour as empty fill to indicate
      // the presence of holes. However, filling the proper area with
      //  fillAlpha requires further work.
      for (let i = 0; i < lineSegments.length; i++) {
        const line = lineSegments[i];
        const polyline = [];

        for (let j = 0; j < linesNumberOfPoints[i]; j++) {
          const pointIndex = line[j];
          polyline.push([
            points[3 * pointIndex],
            points[3 * pointIndex + 1],
            points[3 * pointIndex + 2],
          ]);
        }

        if (polyline.length < 3) {
          continue;
        }

        const contourSegmentationAnnotation = {
          annotationUID: utilities.uuidv4(),
          data: {
            contour: {
              closed: true,
              polyline,
            },
            segmentation: {
              segmentationId,
              segmentIndex,
            },
            handles: {},
          },
          handles: {},
          highlighted: false,
          autoGenerated: false,
          invalidated: false,
          isLocked: false,
          isVisible: true,
          metadata: {
            toolName: PlanarFreehandContourSegmentationTool.toolName,
            ...viewport.getViewReference(),
          },
        };

        addAnnotation(contourSegmentationAnnotation, viewport.element);

        const currentSet = annotationUIDsMap?.get(segmentIndex) || new Set();
        currentSet.add(contourSegmentationAnnotation.annotationUID);
        annotationUIDsMap.set(segmentIndex, currentSet);
      }
    }
  }

  return annotationUIDsMap;
}

const _extractLineSegments = (contourData) => {
  const { numberOfCells, lines } = contourData;

  const lineSegments = [];
  const linesNumberOfPoints = [];

  for (let i = 0; i < lines.length; ) {
    const pointsInLine = lines[i];
    linesNumberOfPoints.push(pointsInLine);
    lineSegments.push(lines.slice(i + 1, i + pointsInLine + 1));
    i += pointsInLine + 1;

    if (lineSegments.length === numberOfCells) {
      break;
    }
  }

  return { lineSegments, linesNumberOfPoints };
};
