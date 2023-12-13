import type Point3 from '../types/Point3';

/**
 * Given an imageData object and a position in voxel space, return a point
 * in world space.
 *
 * @param imageData - The image data object.
 * @param voxelPos - Point in voxel space
 * index space.
 * @returns A point in world space.
 */
export default function transformIndexToWorld(imageData, voxelPos: Point3) {
  return imageData.indexToWorld(voxelPos);
}
