import { vec3 } from 'gl-matrix';
import type { Point3 } from '../types';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

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
  viewUp: Point3
): { widthWorld: number; heightWorld: number } {
  // Step 1: Compute viewRight as cross product of viewPlaneNormal and viewUp
  const viewRight = vec3.create();
  vec3.cross(viewRight, viewPlaneNormal, viewUp);
  vec3.normalize(viewRight, viewRight);

  // Step 2: Get the 8 corners of the cube from the extent
  const extent = imageData.getExtent();
  // extent format: [xMin, xMax, yMin, yMax, zMin, zMax]
  // Max extent values are inside dimensions, so add 1 to get outside dimensions
  const xMin = extent[0];
  const xMax = extent[1] + 1;
  const yMin = extent[2];
  const yMax = extent[3] + 1;
  const zMin = extent[4];
  const zMax = extent[5] + 1;

  // Generate all 8 corners in index space
  const corners: Point3[] = [
    [xMin, yMin, zMin],
    [xMax, yMin, zMin],
    [xMin, yMax, zMin],
    [xMax, yMax, zMin],
    [xMin, yMin, zMax],
    [xMax, yMin, zMax],
    [xMin, yMax, zMax],
    [xMax, yMax, zMax],
  ];

  // Step 3: Convert all 8 corners to world coordinates
  const worldCorners: Point3[] = corners.map((corner) => {
    const worldPoint = [0, 0, 0] as Point3;
    imageData.indexToWorld(corner, worldPoint);
    return worldPoint;
  });

  // Step 4 & 5: Calculate distances between each pair of corners in viewUp and viewRight directions
  let maxHeight = 0;
  let maxWidth = 0;

  for (let i = 0; i < worldCorners.length; i++) {
    for (let j = i + 1; j < worldCorners.length; j++) {
      const p1 = worldCorners[i];
      const p2 = worldCorners[j];

      // Vector from p1 to p2
      const diff = vec3.sub(vec3.create(), p2, p1);

      // Project onto viewUp direction for height
      const height = Math.abs(vec3.dot(diff, viewUp));
      maxHeight = Math.max(maxHeight, height);

      // Project onto viewRight direction for width
      const width = Math.abs(vec3.dot(diff, viewRight));
      maxWidth = Math.max(maxWidth, width);
    }
  }

  return {
    widthWorld: maxWidth,
    heightWorld: maxHeight,
  };
}
