import type { Types } from '@cornerstonejs/core';
import type { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';
import * as math from '../math';

/**
 * Finds all existing contour segmentation annotations that intersect with the
 * `sourcePolyline` or ones that `sourcePolyline` is inside of (potential holes).
 * The comparison is done in canvas space.
 *
 * @param viewport - The viewport context for coordinate conversions.
 * @param sourcePolyline - The polyline of the newly completed contour in canvas space.
 * @param contourSegmentationAnnotations - An array of existing contour segmentations to check against.
 * @returns An array of objects containing the `targetAnnotation`, its `targetPolyline` in canvas space,
 *          and a boolean `isContourHole` indicating if the source polyline is inside the target.
 */
function findAllIntersectingContours(
  viewport: Types.IViewport,
  sourcePolyline: Types.Point2[],
  contourSegmentationAnnotations: ContourSegmentationAnnotation[]
): Array<{
  targetAnnotation: ContourSegmentationAnnotation;
  targetPolyline: Types.Point2[];
  isContourHole: boolean;
}> {
  const intersectingContours: Array<{
    targetAnnotation: ContourSegmentationAnnotation;
    targetPolyline: Types.Point2[];
    isContourHole: boolean;
  }> = [];

  const sourceAABB = math.polyline.getAABB(sourcePolyline);

  for (let i = 0; i < contourSegmentationAnnotations.length; i++) {
    const targetAnnotation = contourSegmentationAnnotations[i];
    const targetPolyline = convertContourPolylineToCanvasSpace(
      targetAnnotation.data.contour.polyline,
      viewport
    );

    const targetAABB = math.polyline.getAABB(targetPolyline);
    const aabbIntersect = math.aabb.intersectAABB(sourceAABB, targetAABB);

    if (!aabbIntersect) {
      continue;
    }

    const lineSegmentsIntersect = math.polyline.intersectPolyline(
      sourcePolyline,
      targetPolyline
    );
    // A contour hole is when AABBs intersect, polylines don't intersect, and source is inside target.
    const isContourHole =
      !lineSegmentsIntersect &&
      math.polyline.containsPoints(targetPolyline, sourcePolyline);

    if (lineSegmentsIntersect || isContourHole) {
      intersectingContours.push({
        targetAnnotation,
        targetPolyline,
        isContourHole,
      });
    }
  }

  return intersectingContours;
}

/**
 * Converts a 3D polyline (in world coordinates) to a 2D polyline (in canvas space)
 * for a specific viewport.
 *
 * @param polyline - An array of 3D points representing the polyline in world coordinates.
 * @param viewport - The viewport used for projection.
 * @returns An array of 2D points representing the polyline in canvas coordinates.
 */
function convertContourPolylineToCanvasSpace(
  polyline: Types.Point3[],
  viewport: Types.IViewport
): Types.Point2[] {
  const numPoints = polyline.length;
  const projectedPolyline = new Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    projectedPolyline[i] = viewport.worldToCanvas(polyline[i]);
  }

  return projectedPolyline;
}

export { findAllIntersectingContours };
