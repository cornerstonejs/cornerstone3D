import { vec3 } from 'gl-matrix';
import type { Point3 } from '../types';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

/**
 * Transforms the cube corners to view coordinates (viewRight, viewUp, viewNormal).
 * This is logically a rotation, but is implemented as a set of dot products with the three orthonormal basis vectors.
 *
 * @param imageData - The vtkImageData object used for index-to-world coordinate transformation and to get the extent
 * @param viewPlaneNormal - The normal vector of the plane in world coordinates (assumed to be unit vector)
 * @param viewUp - The up vector in world coordinates (assumed to be unit vector)
 * @returns An array of Point3 objects representing corners in view coordinates [viewRight, viewUp, viewNormal]
 */
export function rotateToViewCoordinates(
  imageData: vtkImageData,
  viewPlaneNormal: Point3,
  viewUp: Point3
): Point3[] {
  // Compute viewRight as cross product of viewPlaneNormal and viewUp
  const viewRight = vec3.cross(vec3.create(), viewPlaneNormal, viewUp);
  vec3.normalize(viewRight, viewRight);

  // vtkImageData renders the image domain as a half-voxel padded spatial
  // extent, e.g. [0, 9] becomes [-0.5, 9.5].
  const spatialExtent = imageData.getSpatialExtent();
  const xMin = spatialExtent[0];
  const xMax = spatialExtent[1];
  const yMin = spatialExtent[2];
  const yMax = spatialExtent[3];
  const zMin = spatialExtent[4];
  const zMax = spatialExtent[5];

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

  // Convert all 8 corners to world coordinates, then transform to view coordinates
  const viewCorners: Point3[] = corners.map((corner) => {
    const worldPoint = [0, 0, 0] as Point3;
    imageData.indexToWorld(corner, worldPoint);

    // Transform to view coordinates: [viewRight, viewUp, viewNormal]
    const viewPoint: Point3 = [
      vec3.dot(worldPoint, viewRight),
      vec3.dot(worldPoint, viewUp),
      vec3.dot(worldPoint, viewPlaneNormal),
    ];

    return viewPoint;
  });

  return viewCorners;
}
