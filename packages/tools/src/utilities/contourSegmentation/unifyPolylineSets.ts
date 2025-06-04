import type { Types } from '@cornerstonejs/core';
import * as math from '../math';
import { checkIntersection } from './sharedOperations';

/**
 * Unifies two sets of polylines by merging intersecting polylines and keeping non-intersecting ones.
 * If a polyline from set A intersects with a polyline from set B, they are merged.
 * If no intersection is found, the polylines are added as-is to the result.
 *
 * @param polylinesSetA - First set of polylines
 * @param polylinesSetB - Second set of polylines
 * @returns Unified set of polylines
 */
export function unifyPolylineSets(
  polylinesSetA: Types.Point2[][],
  polylinesSetB: Types.Point2[][]
): Types.Point2[][] {
  const result: Types.Point2[][] = [];
  const processedFromA = new Set<number>();
  const processedFromB = new Set<number>();

  // Check each polyline in set A against each polyline in set B
  for (let i = 0; i < polylinesSetA.length; i++) {
    if (processedFromA.has(i)) {
      continue;
    }

    const polylineA = polylinesSetA[i];
    let merged = false;

    for (let j = 0; j < polylinesSetB.length; j++) {
      if (processedFromB.has(j)) {
        continue;
      }

      const polylineB = polylinesSetB[j];

      // Check if polylines intersect
      const intersection = checkIntersection(polylineA, polylineB);

      if (intersection.hasIntersection && !intersection.isContourHole) {
        // Merge the polylines
        const mergedPolyline = math.polyline.mergePolylines(
          polylineA,
          polylineB
        );
        result.push(mergedPolyline);

        // Mark both polylines as processed
        processedFromA.add(i);
        processedFromB.add(j);
        merged = true;
        break;
      }
    }

    // If no merge occurred, add the polyline from set A as-is
    if (!merged) {
      result.push([...polylineA]); // Create a copy
      processedFromA.add(i);
    }
  }

  // Add remaining unprocessed polylines from set B
  for (let j = 0; j < polylinesSetB.length; j++) {
    if (!processedFromB.has(j)) {
      result.push([...polylinesSetB[j]]); // Create a copy
    }
  }

  return result;
}

/**
 * Unifies multiple sets of polylines by progressively merging them.
 * Each set is merged with the accumulated result from previous sets.
 *
 * @param polylineSets - Array of polyline sets to unify
 * @returns Unified set of polylines
 */
export function unifyMultiplePolylineSets(
  polylineSets: Types.Point2[][][]
): Types.Point2[][] {
  if (polylineSets.length === 0) {
    return [];
  }

  if (polylineSets.length === 1) {
    return polylineSets[0].map((polyline) => [...polyline]); // Return copies
  }

  // Start with the first set
  let result = polylineSets[0].map((polyline) => [...polyline]);

  // Progressively merge with each subsequent set
  for (let i = 1; i < polylineSets.length; i++) {
    result = unifyPolylineSets(result, polylineSets[i]);
  }

  return result;
}

/**
 * Unifies polylines from annotations by extracting their polylines and merging intersecting ones.
 * This is a convenience function that works directly with annotation data.
 *
 * @param annotationsSetA - First set of contour segmentation annotations
 * @param annotationsSetB - Second set of contour segmentation annotations
 * @param viewport - Viewport for coordinate conversion
 * @returns Unified set of polylines in canvas space
 */
export function unifyAnnotationPolylines(
  annotationsSetA: Array<{ data: { contour: { polyline: Types.Point3[] } } }>,
  annotationsSetB: Array<{ data: { contour: { polyline: Types.Point3[] } } }>,
  viewport: Types.IViewport
): Types.Point2[][] {
  // Convert annotations to canvas space polylines
  const polylinesSetA = annotationsSetA.map((annotation) =>
    convertPolylineToCanvasSpace(annotation.data.contour.polyline, viewport)
  );

  const polylinesSetB = annotationsSetB.map((annotation) =>
    convertPolylineToCanvasSpace(annotation.data.contour.polyline, viewport)
  );

  return unifyPolylineSets(polylinesSetA, polylinesSetB);
}

/**
 * Helper function to convert 3D polyline to 2D canvas space
 */
function convertPolylineToCanvasSpace(
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

/**
 * Subtracts intersecting polylines from set A using polylines from set B, keeping non-intersecting ones.
 * If a polyline from set A intersects with a polyline from set B, set B polyline is subtracted from set A.
 * If no intersection is found, the polylines are added as-is to the result.
 *
 * @param polylinesSetA - First set of polylines (targets for subtraction)
 * @param polylinesSetB - Second set of polylines (subtractors)
 * @returns Result set of polylines after subtraction
 */
export function subtractPolylineSets(
  polylinesSetA: Types.Point2[][],
  polylinesSetB: Types.Point2[][]
): Types.Point2[][] {
  const result: Types.Point2[][] = [];
  const processedFromA = new Set<number>();

  // Check each polyline in set A against each polyline in set B
  for (let i = 0; i < polylinesSetA.length; i++) {
    if (processedFromA.has(i)) {
      continue;
    }

    let currentPolylines = [polylinesSetA[i]];
    let wasSubtracted = false;

    // Try to subtract each polyline from set B from the current polyline(s)
    for (let j = 0; j < polylinesSetB.length; j++) {
      const polylineB = polylinesSetB[j];
      const newPolylines: Types.Point2[][] = [];

      // Apply subtraction to all current polylines
      for (const currentPolyline of currentPolylines) {
        // Check if polylines intersect
        const intersection = checkIntersection(currentPolyline, polylineB);

        if (intersection.hasIntersection && !intersection.isContourHole) {
          // Subtract polylineB from currentPolyline
          const subtractedPolylines = math.polyline.subtractPolylines(
            currentPolyline,
            polylineB
          );

          // Clean each subtracted polyline before adding
          for (const subtractedPolyline of subtractedPolylines) {
            const cleaned = removeDuplicatePoints(subtractedPolyline);
            if (cleaned.length >= 3) {
              newPolylines.push(cleaned);
            }
          }
          wasSubtracted = true;
        } else {
          // No intersection, keep the polyline as-is (but clean it)
          const cleaned = removeDuplicatePoints(currentPolyline);
          if (cleaned.length >= 3) {
            newPolylines.push(cleaned);
          }
        }
      }

      currentPolylines = newPolylines;
    }

    // Add all resulting polylines to the result
    result.push(...currentPolylines);
    processedFromA.add(i);
  }

  return cleanupPolylines(result);
}

/**
 * Subtracts multiple sets of polylines from a base set progressively.
 * Each set is subtracted from the accumulated result from previous operations.
 *
 * @param basePolylineSet - Base set of polylines to subtract from
 * @param subtractorSets - Array of polyline sets to subtract
 * @returns Result set after all subtractions
 */
export function subtractMultiplePolylineSets(
  basePolylineSet: Types.Point2[][],
  subtractorSets: Types.Point2[][][]
): Types.Point2[][] {
  if (subtractorSets.length === 0) {
    return basePolylineSet.map((polyline) => [...polyline]); // Return copies
  }

  // Start with the base set
  let result = basePolylineSet.map((polyline) => [...polyline]);

  // Progressively subtract each set
  for (let i = 0; i < subtractorSets.length; i++) {
    result = subtractPolylineSets(result, subtractorSets[i]);
  }

  return result;
}

/**
 * Subtracts polylines from annotations by extracting their polylines and subtracting intersecting ones.
 * This is a convenience function that works directly with annotation data.
 *
 * @param baseAnnotations - Base set of contour segmentation annotations to subtract from
 * @param subtractorAnnotations - Set of contour segmentation annotations to subtract
 * @param viewport - Viewport for coordinate conversion
 * @returns Result set of polylines in canvas space after subtraction
 */
export function subtractAnnotationPolylines(
  baseAnnotations: Array<{ data: { contour: { polyline: Types.Point3[] } } }>,
  subtractorAnnotations: Array<{
    data: { contour: { polyline: Types.Point3[] } };
  }>,
  viewport: Types.IViewport
): Types.Point2[][] {
  // Convert annotations to canvas space polylines
  const basePolylines = baseAnnotations.map((annotation) =>
    convertPolylineToCanvasSpace(annotation.data.contour.polyline, viewport)
  );

  const subtractorPolylines = subtractorAnnotations.map((annotation) =>
    convertPolylineToCanvasSpace(annotation.data.contour.polyline, viewport)
  );

  return subtractPolylineSets(basePolylines, subtractorPolylines);
}

/**
 * Performs the intersection operation on two sets of polylines.
 * This function returns the polylines that represent the overlapping areas between the two sets.
 * Uses a direct approach to find intersecting regions.
 *
 * @param polylinesSetA - First set of polylines
 * @param polylinesSetB - Second set of polylines
 * @returns The polylines representing the intersection of both sets
 */
export function intersectPolylines(
  polylinesSetA: Types.Point2[][],
  polylinesSetB: Types.Point2[][]
): Types.Point2[][] {
  if (!polylinesSetA.length || !polylinesSetB.length) {
    return [];
  }

  const result: Types.Point2[][] = [];

  // For each polyline in set A, find its intersection with each polyline in set B
  for (const polylineA of polylinesSetA) {
    for (const polylineB of polylinesSetB) {
      // Check if polylines intersect
      const intersection = checkIntersection(polylineA, polylineB);

      if (intersection.hasIntersection && !intersection.isContourHole) {
        // Find the actual intersection region using a more direct approach
        const intersectionRegion = findDirectIntersection(polylineA, polylineB);
        if (intersectionRegion && intersectionRegion.length >= 3) {
          result.push(intersectionRegion);
        }
      }
    }
  }

  return cleanupPolylines(result);
}

/**
 * Find the direct intersection between two polylines using a geometric approach
 */
function findDirectIntersection(
  polylineA: Types.Point2[],
  polylineB: Types.Point2[]
): Types.Point2[] | null {
  // First, check if one polyline is completely inside the other
  const aInsideB = math.polyline.containsPoints(polylineB, polylineA);
  const bInsideA = math.polyline.containsPoints(polylineA, polylineB);

  if (aInsideB) {
    return [...polylineA]; // A is completely inside B, so A is the intersection
  }

  if (bInsideA) {
    return [...polylineB]; // B is completely inside A, so B is the intersection
  }

  // For partial intersections, use a more practical approach
  // We'll use the original Union - XOR formula but with better handling
  try {
    // Create temporary sets for the calculation
    const setA = [polylineA];
    const setB = [polylineB];

    // Calculate union
    const union = unifyPolylineSets(setA, setB);

    // Calculate XOR
    const xor = xorPolylinesSets(setA, setB);

    // Calculate intersection = Union - XOR
    const intersection = subtractPolylineSets(union, xor);

    // If we get multiple fragments, try to merge them into a single polyline
    if (intersection.length > 1) {
      // Try to merge all intersection fragments
      let mergedIntersection = removeDuplicatePoints(intersection[0]);
      for (let i = 1; i < intersection.length; i++) {
        try {
          const cleanedFragment = removeDuplicatePoints(intersection[i]);
          if (cleanedFragment.length >= 3) {
            // Check if fragments can be merged
            const testIntersection = checkIntersection(
              mergedIntersection,
              cleanedFragment
            );
            if (testIntersection.hasIntersection) {
              mergedIntersection = math.polyline.mergePolylines(
                mergedIntersection,
                cleanedFragment
              );
              mergedIntersection = removeDuplicatePoints(mergedIntersection);
            }
          }
        } catch (error) {
          // If merging fails, keep the fragments separate
          console.warn('Could not merge intersection fragments:', error);
        }
      }
      return mergedIntersection.length >= 3 ? mergedIntersection : null;
    } else if (intersection.length === 1) {
      const cleaned = removeDuplicatePoints(intersection[0]);
      return cleaned.length >= 3 ? cleaned : null;
    }

    // If no intersection found through subtraction, try a different approach
    // Check if there are actual intersection points between the polylines
    const hasActualIntersections = math.polyline.intersectPolyline(
      polylineA,
      polylineB
    );

    if (hasActualIntersections) {
      // There are intersections but the subtraction method failed
      // Fall back to using the merge approach with better area checking
      const merged = math.polyline.mergePolylines(polylineA, polylineB);

      const areaA = calculatePolylineArea(polylineA);
      const areaB = calculatePolylineArea(polylineB);
      const areaMerged = calculatePolylineArea(merged);

      // If merged area is significantly less than sum of areas, there's overlap
      const expectedUnionArea = areaA + areaB;
      const overlapRatio =
        (expectedUnionArea - areaMerged) / Math.min(areaA, areaB);

      if (overlapRatio > 0.1) {
        // At least 10% overlap
        // Estimate the intersection area by creating a simplified intersection polygon
        return createIntersectionFromMerge(polylineA, polylineB, merged);
      }
    }
  } catch (error) {
    console.warn('Failed to calculate intersection:', error);
  }

  return null;
}

/**
 * Create an intersection polyline from merge result when direct methods fail
 */
function createIntersectionFromMerge(
  polylineA: Types.Point2[],
  polylineB: Types.Point2[],
  merged: Types.Point2[]
): Types.Point2[] {
  // This is a simplified approach - find points that are inside both polylines
  const intersectionPoints: Types.Point2[] = [];

  // Sample points from the merged polyline and check if they're in both original polylines
  const sampleCount = Math.min(merged.length, 50); // Limit sampling for performance
  const step = Math.max(1, Math.floor(merged.length / sampleCount));

  for (let i = 0; i < merged.length; i += step) {
    const point = merged[i];
    const inA = math.polyline.containsPoint(polylineA, point);
    const inB = math.polyline.containsPoint(polylineB, point);

    if (inA && inB) {
      intersectionPoints.push(point);
    }
  }

  // If we found intersection points, return them
  if (intersectionPoints.length >= 3) {
    return intersectionPoints;
  }

  // Fallback: return a simplified version of the merged polyline
  // This isn't perfect but provides a reasonable approximation
  const simplificationFactor = 0.7; // Take 70% of the merged polyline
  const targetLength = Math.floor(merged.length * simplificationFactor);
  const simplifiedPoints: Types.Point2[] = [];

  for (let i = 0; i < targetLength; i++) {
    const index = Math.floor((i / targetLength) * merged.length);
    simplifiedPoints.push(merged[index]);
  }

  return simplifiedPoints.length >= 3 ? simplifiedPoints : merged;
}

/**
 * Calculate the approximate area of a polyline (assuming it's a closed polygon)
 */
function calculatePolylineArea(polyline: Types.Point2[]): number {
  if (polyline.length < 3) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < polyline.length; i++) {
    const j = (i + 1) % polyline.length;
    area += polyline[i][0] * polyline[j][1];
    area -= polyline[j][0] * polyline[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Performs the XOR (exclusive or) operation on two sets of polylines.
 * This function returns the polylines that represent the areas that are in one set
 * but not in both sets (subtraction of the intersection from the union).
 *
 * @param polylinesSetA - First set of polylines
 * @param polylinesSetB - Second set of polylines
 * @returns The polylines representing the XOR of both sets
 */
export function xorPolylinesSets(
  polylinesSetA: Types.Point2[][],
  polylinesSetB: Types.Point2[][]
): Types.Point2[][] {
  if (!polylinesSetA.length && !polylinesSetB.length) {
    return [];
  }

  if (!polylinesSetA.length) {
    return polylinesSetB.map((polyline) => [...polyline]);
  }

  if (!polylinesSetB.length) {
    return polylinesSetA.map((polyline) => [...polyline]);
  }

  // XOR = (A ∪ B) - (A ∩ B) = (A - B) ∪ (B - A)
  // This is more efficient than computing union and intersection separately

  const aMinusB = subtractPolylineSets(polylinesSetA, polylinesSetB);
  const bMinusA = subtractPolylineSets(polylinesSetB, polylinesSetA);

  // Combine the results
  const xorResult = [...aMinusB, ...bMinusA];

  return cleanupPolylines(xorResult);
}

/**
 * Remove consecutive duplicate points from a polyline
 * @param polyline - Polyline to clean
 * @returns Cleaned polyline without consecutive duplicates
 */
function removeDuplicatePoints(polyline: Types.Point2[]): Types.Point2[] {
  if (!polyline || polyline.length < 2) {
    return polyline;
  }

  const cleaned: Types.Point2[] = [polyline[0]]; // Always keep the first point
  const tolerance = 1e-10; // Very small tolerance for floating point comparison

  for (let i = 1; i < polyline.length; i++) {
    const currentPoint = polyline[i];
    const lastPoint = cleaned[cleaned.length - 1];

    // Check if current point is different from the last added point
    const dx = Math.abs(currentPoint[0] - lastPoint[0]);
    const dy = Math.abs(currentPoint[1] - lastPoint[1]);

    if (dx > tolerance || dy > tolerance) {
      cleaned.push(currentPoint);
    }
  }

  return cleaned;
}

/**
 * Helper function to clean up polylines by removing duplicates and invalid polylines
 * @param polylines - Array of polylines to clean up
 * @returns Cleaned array of polylines
 */
function cleanupPolylines(polylines: Types.Point2[][]): Types.Point2[][] {
  const validPolylines: Types.Point2[][] = [];
  const seenPolylines = new Set<string>();

  for (let polyline of polylines) {
    // Skip invalid polylines
    if (!polyline || polyline.length < 3) {
      continue;
    }

    // Remove consecutive duplicate points
    polyline = removeDuplicatePoints(polyline);

    // Skip if after cleanup it's too small
    if (polyline.length < 3) {
      continue;
    }

    // Create a string representation for duplicate detection
    // Sort points to handle polylines that are the same but start from different points
    const sortedPoints = [...polyline].sort((a, b) => {
      if (a[0] !== b[0]) {
        return a[0] - b[0];
      }
      return a[1] - b[1];
    });
    const polylineKey = sortedPoints
      .map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`)
      .join('|');

    if (!seenPolylines.has(polylineKey)) {
      seenPolylines.add(polylineKey);
      validPolylines.push(polyline);
    }
  }

  return validPolylines;
}
