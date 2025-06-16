import type { Types } from '@cornerstonejs/core';
import * as math from '../math';
import { checkIntersection } from './sharedOperations';
import { intersectPolylines } from '../math/polyline';
import arePolylinesIdentical from '../math/polyline/arePolylinesIdentical';

const TOLERANCE = 1e-10; // Very small tolerance for floating point comparison
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

      // Check if polylines are identical first
      if (arePolylinesIdentical(polylineA, polylineB)) {
        // Polylines are identical, just add one copy to result
        result.push([...polylineA]);
        processedFromA.add(i);
        processedFromB.add(j);
        merged = true;
        break;
      }

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
        // Check if polylines are identical first
        if (arePolylinesIdentical(currentPolyline, polylineB)) {
          // Polylines are identical, subtraction results in empty (no polyline added)
          wasSubtracted = true;
          continue;
        }

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
export function intersectPolylinesSets(
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
      // Check if polylines are identical first
      if (arePolylinesIdentical(polylineA, polylineB)) {
        // Polylines are identical, intersection is the polyline itself
        result.push([...polylineA]);
        continue;
      }

      // Check if polylines intersect
      const intersection = checkIntersection(polylineA, polylineB);

      if (intersection.hasIntersection && !intersection.isContourHole) {
        // Find the actual intersection region using a more direct approach
        const intersectionRegions = intersectPolylines(polylineA, polylineB);
        if (intersectionRegions && intersectionRegions.length > 0) {
          result.push(...intersectionRegions);
        }
      }
    }
  }

  return cleanupPolylines(result);
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

  // Early optimization: if sets are identical, XOR result is empty
  if (polylinesSetA.length === polylinesSetB.length) {
    let allIdentical = true;
    for (let i = 0; i < polylinesSetA.length; i++) {
      let foundMatch = false;
      for (let j = 0; j < polylinesSetB.length; j++) {
        if (arePolylinesIdentical(polylinesSetA[i], polylinesSetB[j])) {
          foundMatch = true;
          break;
        }
      }
      if (!foundMatch) {
        allIdentical = false;
        break;
      }
    }
    if (allIdentical) {
      return []; // XOR of identical sets is empty
    }
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

  for (let i = 1; i < polyline.length; i++) {
    const currentPoint = polyline[i];
    const lastPoint = cleaned[cleaned.length - 1];

    // Check if current point is different from the last added point
    const dx = Math.abs(currentPoint[0] - lastPoint[0]);
    const dy = Math.abs(currentPoint[1] - lastPoint[1]);

    if (dx > TOLERANCE || dy > TOLERANCE) {
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
