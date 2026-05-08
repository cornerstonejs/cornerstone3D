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
 * Calculates the size (width or height) in a given dimension, accounting for thickness.
 * Uses intersection points with a plane offset by thickness in the z direction.
 *
 * @param viewCorners - Array of Point3 objects in view coordinates [viewRight, viewUp, viewNormal]
 * @param dimension - The dimension to calculate size for (0 = viewRight/width, 1 = viewUp/height)
 * @param thickness - The thickness to apply in the viewNormal direction
 * @returns The maximum size in the specified dimension
 */
function calculateSize(viewCorners: Point3[], dimension: number): number {
  // Find min and max vertices in the target dimension
  const minIndex = findMinCornerIndex(viewCorners, dimension);
  const maxIndex = minIndex ^ 7;

  // If direction is approximately zero, just use the max vertex
  return viewCorners[maxIndex][dimension] - viewCorners[minIndex][dimension];
}

/**
 * Gets the view width and height of the overall volume as displayable in the given
 * orientation.
 *
 * This ensures that the views in the MPR view orthogonal to the view plane will
 * in the volume touch two opposite edges of the viewport.  This may not occur
 * for any single image, but allows navigation through the MPR views to see
 * the entire volume without panning or zooming.
 *
 * This is also the required size to display a 3d volume representation in the given
 * orientation without panning or zooming.
 *
 * A similar, related algorithm that can be used to provide a slightly larger
 * view is to compute the intersection of the plane parallel to the view plane
 * but thickness distance towards the maximum vertex in the z direction with
 * the volume.  This slightly larger view will contain all frames from the given
 * volume not thicker than the thickness, but will require navigation of the
 * focal point to use a vector in the direction of the acquisition orientation
 * nearest the view plane normal rather than directly in the view plane normal direction.
 *
 * @param imageData - The vtkImageData object used for index-to-world coordinate transformation and to get the extent
 * @param viewPlaneNormal - The normal vector of the plane in world coordinates (assumed to be unit vector)
 * @param viewUp - The up vector in world coordinates (assumed to be unit vector)
 * @returns An object with widthWorld and heightWorld
 */
export function getCubeSizeInView(
  imageData: vtkImageData,
  viewPlaneNormal: Point3,
  viewUp: Point3
): { widthWorld: number; heightWorld: number; depthWorld: number } {
  const viewCorners = rotateToViewCoordinates(
    imageData,
    viewPlaneNormal,
    viewUp
  );

  // Calculate width (dimension 0 = viewRight)
  const maxWidth = calculateSize(viewCorners, 0);

  // Calculate height (dimension 1 = viewUp)
  const maxHeight = calculateSize(viewCorners, 1);

  const maxDepth = calculateSize(viewCorners, 2);

  return {
    widthWorld: maxWidth,
    heightWorld: maxHeight,
    depthWorld: maxDepth,
  };
}
