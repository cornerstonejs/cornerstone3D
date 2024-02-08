import { utilities } from '@cornerstonejs/core';

/**
 * Creates a mock ellipsoid stack segmentation.
 *
 * @param options - The options for creating the mock ellipsoid stack segmentation.
 * @param options.imageIds - The image IDs.
 * @param options.segmentationImageIds - The segmentation image IDs.
 * @param options.cornerstone - The cornerstone object.
 */
export function fillStackSegmentationWithMockData({
  imageIds,
  segmentationImageIds,
  cornerstone,
  centerOffset = [0, 0, 0],
  innerValue = 1,
  outerValue = 2,
}) {
  const { metaData, cache } = cornerstone;
  const { rows, columns } = metaData.get('imagePlaneModule', imageIds[0]);
  const dimensions = [columns, rows, imageIds.length];

  const center = [dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2];

  center[0] += centerOffset[0];
  center[1] += centerOffset[1];
  center[2] += centerOffset[2];

  const outerRadius = 64;
  const innerRadius = 32;
  for (let z = 0; z < dimensions[2]; z++) {
    let voxelIndex = 0;
    const image = cache.getImage(segmentationImageIds[z]);
    const voxelManager =
      image.voxelManager ||
      utilities.VoxelManager.createVolumeVoxelManager(
        [columns, rows, 1],
        image.getPixelData()
      );
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        const distanceFromCenter = Math.sqrt(
          (x - center[0]) * (x - center[0]) +
            (y - center[1]) * (y - center[1]) +
            (z - center[2]) * (z - center[2])
        );
        if (distanceFromCenter < innerRadius) {
          voxelManager.setAtIndex(voxelIndex, innerValue);
        } else if (distanceFromCenter < outerRadius) {
          voxelManager.setAtIndex(voxelIndex, outerValue);
        }
        voxelIndex++;
      }
    }
  }
}
