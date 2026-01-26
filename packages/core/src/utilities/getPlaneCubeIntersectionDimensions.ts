import type { Point3 } from '../types';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { rotateToViewCoordinates } from './rotateToViewCoordinates';

/**
 * Finds the index of the corner with the smallest value in the specified dimension.
 * The corner with the largest value in that dimension will be at index (minIndex ^ 7).
 *
 * @param viewCorners - Array of Point3 objects in view coordinates [viewRight, viewUp, viewNormal]
 * @param dimension - The dimension index (0 = viewRight, 1 = viewUp, 2 = viewNormal)
 * @returns The index of the corner with the minimum value in the specified dimension
 */
function findMinCornerIndex(viewCorners: Point3[], dimension: number): number {
  let minIndex = 0;
  let minValue = viewCorners[0][dimension];

  for (let i = 1; i < viewCorners.length; i++) {
    if (viewCorners[i][dimension] < minValue) {
      minValue = viewCorners[i][dimension];
      minIndex = i;
    }
  }

  return minIndex;
}

/**
 * Gets the three vertices adjacent to the given vertex index in a cube.
 * In a cube, each vertex has three adjacent vertices (connected by edges).
 *
 * @param vertexIndex - The index of the vertex (0-7)
 * @returns Array of three adjacent vertex indices
 */
function getAdjacentVertices(vertexIndex: number): number[] {
  // The three adjacent vertices are found by flipping each bit
  return [vertexIndex ^ 1, vertexIndex ^ 2, vertexIndex ^ 4];
}

/**
 * Finds the intersection point of a line segment with a plane perpendicular to the z-axis.
 *
 * @param p1 - First point of the line segment
 * @param p2 - Second point of the line segment
 * @param zPlane - The z coordinate of the plane
 * @returns The intersection point, or null if no intersection
 */
function intersectLineWithZPlane(
  p1: Point3,
  p2: Point3,
  zPlane: number
): Point3 | null {
  const z1 = p1[2];
  const z2 = p2[2];

  // Check if the line segment crosses the plane
  if ((z1 <= zPlane && z2 >= zPlane) || (z1 >= zPlane && z2 <= zPlane)) {
    // If z direction is approximately zero, no intersection
    const zDiff = z2 - z1;
    if (Math.abs(zDiff) < 1e-10) {
      return null;
    }

    // Calculate interpolation parameter
    const t = (zPlane - z1) / zDiff;

    // Interpolate all coordinates
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]), zPlane];
  }

  return null;
}

/**
 * Calculates the size (width or height) in a given dimension, accounting for thickness.
 * Uses intersection points with a plane offset by thickness in the z direction.
 *
 * @param viewCorners - Array of Point3 objects in view coordinates [viewRight, viewUp, viewNormal]
 * @param dimension - The dimension to calculate size for (0 = viewRight/width, 1 = viewUp/height)
 * @param thickness - The thickness to apply in the viewNormal direction
 * @returns The maximum size in the specified dimension
 */
function calculateSizeWithThickness(
  viewCorners: Point3[],
  dimension: number,
  thickness: number
): number {
  // Find min and max vertices in the target dimension
  const minIndex = findMinCornerIndex(viewCorners, dimension);
  const maxIndex = minIndex ^ 7;

  // Find min and max vertices in z dimension (viewNormal, dimension 2)
  const minZIndex = findMinCornerIndex(viewCorners, 2);
  const maxZIndex = minZIndex ^ 7;

  const minZ = viewCorners[minZIndex][2];
  const maxZ = viewCorners[maxZIndex][2];

  // Calculate direction from minZ to maxZ
  const zDirection = maxZ - minZ;

  // If direction is approximately zero, just use the max vertex
  if (Math.abs(zDirection) < 1e-10 || true) {
    return viewCorners[maxIndex][dimension] - viewCorners[minIndex][dimension];
  }

  // Calculate z plane: minZ + direction * thickness
  // direction is normalized by the sign (positive if maxZ > minZ)
  const zPlane = minZ + (zDirection > 0 ? thickness : -thickness);

  // Get the three vertices adjacent to the max vertex
  const adjacentIndices = getAdjacentVertices(maxIndex);
  const maxVertex = viewCorners[maxIndex];

  // Find intersection points with the z plane for edges from max vertex to adjacent vertices
  const intersectionPoints: Point3[] = [];

  for (const adjIndex of adjacentIndices) {
    const adjVertex = viewCorners[adjIndex];
    const intersection = intersectLineWithZPlane(maxVertex, adjVertex, zPlane);
    if (intersection) {
      intersectionPoints.push(intersection);
    }
  }

  // Find the maximum value in the target dimension from intersection points
  if (!intersectionPoints.length) {
    // Fallback to max vertex if no intersections
    return viewCorners[maxIndex][dimension] - viewCorners[minIndex][dimension];
  }

  let maxValue = intersectionPoints[0][dimension];
  for (let i = 1; i < intersectionPoints.length; i++) {
    maxValue = Math.max(maxValue, intersectionPoints[i][dimension]);
  }

  return maxValue - viewCorners[minIndex][dimension];
}

/**
 * Computes the world width and height of the plane intersection with the cube
 * by calculating distances between all 8 corners in view up and view right directions.
 *
 * Algorithm:
 * 1. Compute the view right unit vector (cross product of viewPlaneNormal and viewUp, normalized)
 * 2. Get the 8 corners of the cube from the extent
 * 3. Convert all 8 corners to world coordinates
 * 4. Calculate the distance between each pair of corners in viewUp direction (height)
 *    and viewRight direction (width)
 * 5. The maximum of these distances is the overall value
 *
 * @param imageData - The vtkImageData object used for index-to-world coordinate transformation and to get the extent
 * @param viewPlaneNormal - The normal vector of the plane in world coordinates (assumed to be unit vector)
 * @param viewUp - The up vector in world coordinates (assumed to be unit vector)
 * @returns An object with widthWorld and heightWorld
 */
export function getPlaneCubeIntersectionDimensions(
  imageData: vtkImageData,
  viewPlaneNormal: Point3,
  viewUp: Point3,
  thickness = 0
): { widthWorld: number; heightWorld: number } {
  const viewCorners = rotateToViewCoordinates(
    imageData,
    viewPlaneNormal,
    viewUp
  );

  // Calculate width (dimension 0 = viewRight)
  const maxWidth = calculateSizeWithThickness(viewCorners, 0, thickness);

  // Calculate height (dimension 1 = viewUp)
  const maxHeight = calculateSizeWithThickness(viewCorners, 1, thickness);

  return {
    widthWorld: maxWidth,
    heightWorld: maxHeight,
  };
}
