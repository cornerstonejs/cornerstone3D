import type { Types } from '@cornerstonejs/core';
import getSignedArea from '../math/polyline/getSignedArea';
import containsPoints from '../math/polyline/containsPoints';
import isClosed from '../math/polyline/isClosed';

/**
 * Result interface for hole detection
 */
export interface ContourHoleDetectionResult {
  /** Index of the polyline that contains holes */
  contourIndex: number;
  /** Indexes of the polylines that are holes within this contour */
  holeIndexes: number[];
}

/**
 * Checks if one polygon is completely inside another polygon
 */
function isPolygonInsidePolygon(
  inner: Types.Point2[],
  outer: Types.Point2[]
): boolean {
  // Check if all points of inner polygon are inside outer polygon
  return containsPoints(outer, inner);
}

/**
 * Detects holes in contours from an array of polylines
 *
 * @param polylines - Array of polylines, where each polyline is an array of Point2
 * @returns Array of ContourHoleDetectionResult containing contour indexes and their hole indexes
 */
export default function findContourHoles(
  polylines: Types.Point2[][]
): ContourHoleDetectionResult[] {
  const results: ContourHoleDetectionResult[] = [];

  // Filter only closed polylines and keep track of their original indexes
  const closedPolylines: { polyline: Types.Point2[]; originalIndex: number }[] =
    [];

  polylines.forEach((polyline, index) => {
    if (isClosed(polyline)) {
      closedPolylines.push({ polyline, originalIndex: index });
    }
  });

  // For each closed polyline, check if other closed polylines are holes inside it
  for (let i = 0; i < closedPolylines.length; i++) {
    const outerContour = closedPolylines[i];
    const outerArea = Math.abs(getSignedArea(outerContour.polyline));
    const holeIndexes: number[] = [];

    for (let j = 0; j < closedPolylines.length; j++) {
      if (i === j) {
        continue;
      } // Skip self

      const potentialHole = closedPolylines[j];
      const holeArea = Math.abs(getSignedArea(potentialHole.polyline));

      // A hole should be smaller than the outer contour and completely inside it
      if (
        holeArea < outerArea &&
        isPolygonInsidePolygon(potentialHole.polyline, outerContour.polyline)
      ) {
        holeIndexes.push(potentialHole.originalIndex);
      }
    }

    // Only add to results if this contour has holes
    if (holeIndexes.length > 0) {
      results.push({
        contourIndex: outerContour.originalIndex,
        holeIndexes: holeIndexes.sort((a, b) => a - b), // Sort hole indexes
      });
    }
  }

  // Sort results by contour index for consistent output
  return results.sort((a, b) => a.contourIndex - b.contourIndex);
}

export { findContourHoles };
