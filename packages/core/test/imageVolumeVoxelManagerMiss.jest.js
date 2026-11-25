import { describe, it, expect, afterEach } from '@jest/globals';
import VoxelManager from '../src/utilities/VoxelManager';
import cache from '../src/cache/cache';

const width = 4;
const height = 4;
const imageIds = ['miss-image:0', 'miss-image:1'];

function putSlice(imageId, value) {
  const scalarData = new Uint16Array(width * height).fill(value);
  const voxelManager = VoxelManager.createImageVoxelManager({
    width,
    height,
    scalarData,
    numberOfComponents: 1,
  });

  cache.putImageSync(imageId, {
    imageId,
    width,
    height,
    voxelManager,
    getPixelData: () => scalarData,
    sizeInBytes: scalarData.byteLength,
  });
}

function makeVolumeVoxelManager() {
  return VoxelManager.createImageVolumeVoxelManager({
    dimensions: [width, height, imageIds.length],
    imageIds,
    numberOfComponents: 1,
  });
}

describe('the image volume voxel manager remembers a missing image', () => {
  afterEach(() => {
    for (const imageId of imageIds) {
      try {
        cache.removeImageLoadObject(imageId);
      } catch {
        // not cached
      }
    }
  });

  it('reads an image that arrives without a call to invalidateSlice', () => {
    const voxelManager = makeVolumeVoxelManager();

    expect(voxelManager.getAtIJK(0, 0, 1)).toBeNull();

    putSlice(imageIds[1], 7);

    expect(voxelManager.getAtIJK(0, 0, 1)).toBe(7);
  });
});
