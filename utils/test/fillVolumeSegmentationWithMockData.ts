/**
 * Creates a mock ellipsoid volume segmentation.
 * @param options - The options for creating the mock ellipsoid volume segmentation.
 * @param options.volumeId - The ID of the volume.
 * @param options.cornerstone - The cornerstone core object.
 * @param options.centerOffset - The offset of the center of the ellipsoid from the center of the volume.
 */
export function fillVolumeSegmentationWithMockData({
  volumeId: segVolumeId,
  cornerstone,
  centerOffset = [0, 0, 0],
  innerRadius = null,
  outerRadius = null,
}) {
  const segmentationVolume = cornerstone.cache.getVolume(segVolumeId);
  const scalarData = segmentationVolume.scalarData;
  const { dimensions } = segmentationVolume;

  innerRadius = innerRadius || dimensions[0] / 8;
  outerRadius = outerRadius || dimensions[0] / 4;

  const center = [
    dimensions[0] / 2 + centerOffset[0],
    dimensions[1] / 2 + centerOffset[1],
    dimensions[2] / 2 + centerOffset[2],
  ];

  let voxelIndex = 0;

  for (let z = 0; z < dimensions[2]; z++) {
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        const distanceFromCenter = Math.sqrt(
          (x - center[0]) * (x - center[0]) +
            (y - center[1]) * (y - center[1]) +
            (z - center[2]) * (z - center[2])
        );
        if (distanceFromCenter < innerRadius) {
          scalarData[voxelIndex] = 1;
        } else if (distanceFromCenter < outerRadius) {
          scalarData[voxelIndex] = 2;
        }

        voxelIndex++;
      }
    }
  }
}
