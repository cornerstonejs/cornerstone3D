/**
 * Creates a mock ellipsoid volume segmentation.
 * @param options - The options for creating the mock ellipsoid volume segmentation.
 * @param options.volumeId - The ID of the volume.
 * @param options.cornerstone - The cornerstone core object.
 * @param options.centerOffset - The offset of the center of the ellipsoid from the center of the volume.
 * @param options.innerRadius - The radius of the inner ellipsoid (defaults to dimensions[0]/8).
 * @param options.outerRadius - The radius of the outer ellipsoid (defaults to dimensions[0]/4).
 * @param options.scale - Scale factors [x, y, z] to create oval shapes (defaults to [1, 1, 1]).
 */
export function fillVolumeLabelmapWithMockData({
  volumeId: segVolumeId,
  cornerstone,
  centerOffset = [0, 0, 0],
  innerRadius = null,
  outerRadius = null,
  scale = [1, 1, 1],
}) {
  const segmentationVolume = cornerstone.cache.getVolume(segVolumeId);
  const { dimensions, voxelManager } = segmentationVolume;

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
          (x - center[0]) * scale[0] * ((x - center[0]) * scale[0]) +
            (y - center[1]) * scale[1] * ((y - center[1]) * scale[1]) +
            (z - center[2]) * scale[2] * ((z - center[2]) * scale[2])
        );
        if (distanceFromCenter < innerRadius) {
          voxelManager.setAtIndex(voxelIndex, 1);
        } else if (distanceFromCenter < outerRadius) {
          voxelManager.setAtIndex(voxelIndex, 2);
        }

        voxelIndex++;
      }
    }
  }
}
