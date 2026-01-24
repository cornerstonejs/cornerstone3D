import type { Point3 } from '../types';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { getPlaneCubeIntersectionRotated } from './getPlaneCubeIntersection';

/**
 * Computes the world width and height of the plane intersection with the cube
 * in the rotated coordinate system (where y is viewUp and z is viewPlaneNormal).
 *
 * @param imageData - The vtkImageData object used for index-to-world coordinate transformation and to get the extent
 * @param focalPoint - A point on the plane in world coordinates
 * @param viewPlaneNormal - The normal vector of the plane in world coordinates (assumed to be unit vector)
 * @param viewUp - The up vector in world coordinates (assumed to be unit vector)
 * @returns An object with widthWorld and heightWorld
 */
export function getPlaneCubeIntersectionDimensions(
  imageData: vtkImageData,
  focalPoint: Point3,
  viewPlaneNormal: Point3,
  viewUp: Point3
): { widthWorld: number; heightWorld: number } {
  // Get the rotated intersection points
  const rotatedPoints = getPlaneCubeIntersectionRotated(
    imageData,
    focalPoint,
    viewPlaneNormal,
    viewUp
  );

  // Find min and max x coordinates (worldWidth)
  let minX = rotatedPoints[0][0];
  let maxX = rotatedPoints[0][0];
  // Find min and max y coordinates (worldHeight)
  let minY = rotatedPoints[0][1];
  let maxY = rotatedPoints[0][1];

  for (const point of rotatedPoints) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  }

  return {
    widthWorld: maxX - minX,
    heightWorld: maxY - minY,
  };
}
