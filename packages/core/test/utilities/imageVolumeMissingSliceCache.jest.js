import { describe, it, expect, jest, afterEach } from '@jest/globals';
import cache from '../../src/cache/cache';
import VoxelManager from '../../src/utilities/VoxelManager';

describe('createImageVolumeVoxelManager missing-slice cache', () => {
  const dimensions = [4, 4, 2];
  const imageIds = ['miss-cache-0', 'miss-cache-1'];

  afterEach(() => {
    imageIds.forEach((imageId) => {
      try {
        cache.removeImageLoadObject(imageId);
      } catch {
        // not present
      }
    });
    jest.restoreAllMocks();
  });

  it('calls cache.getImage once per missing slice, not once per voxel', () => {
    const scalarData = new Uint8Array(16).fill(3);
    const voxelManager = VoxelManager.createImageVoxelManager({
      width: 4,
      height: 4,
      scalarData,
      numberOfComponents: 1,
    });

    cache.putImageSync(imageIds[0], {
      imageId: imageIds[0],
      width: 4,
      height: 4,
      voxelManager,
      getPixelData: () => scalarData,
      sizeInBytes: 16,
    });

    const getImageSpy = jest.spyOn(cache, 'getImage');
    const volumeVm = VoxelManager.createImageVolumeVoxelManager({
      dimensions,
      imageIds,
      numberOfComponents: 1,
    });

    // Touch every voxel of the unloaded sibling slice.
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        expect(volumeVm.getAtIJK(i, j, 1)).toBeNull();
      }
    }

    const missLookups = getImageSpy.mock.calls.filter(
      ([imageId]) => imageId === imageIds[1]
    );

    expect(missLookups.length).toBe(1);
  });

  it('re-resolves after invalidateSlice once the image is in the cache', () => {
    const volumeVm = VoxelManager.createImageVolumeVoxelManager({
      dimensions,
      imageIds,
      numberOfComponents: 1,
    });

    expect(volumeVm.getAtIJK(0, 0, 0)).toBeNull();

    const scalarData = new Uint8Array(16).fill(9);
    const imageVm = VoxelManager.createImageVoxelManager({
      width: 4,
      height: 4,
      scalarData,
      numberOfComponents: 1,
    });

    cache.putImageSync(imageIds[0], {
      imageId: imageIds[0],
      width: 4,
      height: 4,
      voxelManager: imageVm,
      getPixelData: () => scalarData,
      sizeInBytes: 16,
    });

    volumeVm.invalidateSlice(0);

    expect(volumeVm.getAtIJK(0, 0, 0)).toBe(9);
  });
});
