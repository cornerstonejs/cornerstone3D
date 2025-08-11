import type { Types } from '@cornerstonejs/core';
import isClosed from '../math/polyline/isClosed';
import { getSignedArea } from '../math/polyline';

/**
 * Finds closed contours (islands) that are smaller than the specified threshold.
 * This function identifies small closed polylines based on their area.
 *
 * @param polylines - Array of polylines to analyze
 * @param threshold - Minimum area threshold for identifying islands in cm2
 * @returns Array of polyline indexes that are islands (closed contours smaller than threshold)
 */
export default function findIslands(
  polylines: Types.Point2[][],
  threshold: number
): number[] {
  if (!polylines || polylines.length === 0) {
    return [];
  }

  if (threshold <= 0) {
    return [];
  }

  const islandIndexes: number[] = [];

  for (let i = 0; i < polylines.length; i++) {
    const polyline = polylines[i];

    // Skip empty or invalid polylines
    if (!polyline || polyline.length < 3) {
      continue;
    }

    // Check if the polyline is closed
    const isClosedPolyline = isClosed(polyline);

    if (isClosedPolyline) {
      // Calculate area for closed polylines (use absolute value since we only care about size)
      // Convert from mm² to cm² by dividing by 100 (1 cm² = 100 mm²)
      const area = Math.abs(getSignedArea(polyline)) / 100;

      // Identify closed contours that are smaller than the threshold (islands)
      if (area < threshold) {
        islandIndexes.push(i);
      }
    }
    // Open polylines are not considered islands, so we skip them
  }

  return islandIndexes;
}
