import type Point3 from '../types/Point3';

/**
 * Given an imageData object and a point in physical space, return the index of the
 * voxel that contains the point. TODO: this should be pushed to vtk upstream.
 * @param imageData - The image data object.
 * @param physicalPoint - The point in physical space that you want to transform to
 * index space.
 * @returns An array of integers.
 */
export default function transformWorldToIndex(imageData, worldPos: Point3) {
  const continuousIndex = imageData.worldToIndex(worldPos);
  const index = continuousIndex.map(Math.round);

  return index;
}
