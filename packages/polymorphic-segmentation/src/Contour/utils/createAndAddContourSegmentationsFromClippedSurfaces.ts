import { utilities, type Types } from '@cornerstonejs/core';
import {
  PlanarFreehandContourSegmentationTool,
  annotation,
} from '@cornerstonejs/tools';
import type { RawContourData } from '../contourComputationStrategies';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import { vec3 } from 'gl-matrix';

const _p_v1 = vec3.create();
const _p_v2 = vec3.create();
const _p_p0 = vec3.create();
const _p_p1 = vec3.create();
const _p_p2 = vec3.create();
const _p_polylineNormal = vec3.create();
const _p_planeNormal = vec3.create();

/**
 * Checks if a planar polyline is perpendicular to a given normal vector.
 *
 * This function operates under the assumption that the polyline is flat (all its
 * points lie on a single plane).
 *
 * It determines the polyline's own plane and checks if that plane is perpendicular
 * to the one defined by `planeNormal`. This is true if their normal vectors are
 * perpendicular.
 *
 * If the polyline is collinear (a straight line), it checks if the line's
 * direction is perpendicular to the `planeNormal`.
 *
 * @param {number[]} lines - Flat array encoding a polyline. Format: [pointCount, id1, id2, ...].
 * @param {number[]} points - Flat array of 3D point coordinates [x1, y1, z1, ...].
 * @param {vec3} planeNormal - The normal vector to check against.
 * @param {number} [dotProductTolerance=0.99] - The maximum absolute value the dot
 *   product can have for the vectors to be considered perpendicular. A value of 0 is perfect.
 * @returns {boolean} - True if the polyline is perpendicular to the normal.
 */
function isPolylinePerpendicular(
  lines,
  points,
  planeNormal,
  dotProductTolerance = 0.99
) {
  const count = lines[0];
  if (count < 2) {
    // Cannot determine direction or plane.
    return false;
  }
  const ids = lines.slice(1, 1 + count);

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
    // CASE 1: The polyline is a plane. Check if its normal is perpendicular to the given normal.
    vec3.normalize(_p_polylineNormal, _p_polylineNormal);
    const dot = vec3.dot(_p_polylineNormal, _p_planeNormal);
    return Math.abs(dot) >= dotProductTolerance;
  } else {
    // CASE 2: The polyline is a straight line (collinear).
    // The direction is already in _p_v1 (from P1 - P0).
    // Check if its direction is perpendicular to the given normal.
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
  const planeNormal = viewport.getCamera().viewPlaneNormal;

  for (const [segmentIndex, contoursData] of rawContourData) {
    for (const contourData of contoursData) {
      const { points, lines } = contourData;
      if (!isPolylinePerpendicular(lines, points, planeNormal)) {
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
