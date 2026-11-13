import { describe, it, expect, afterEach } from '@jest/globals';
import VoxelManager from '../src/utilities/VoxelManager';
import cache from '../src/cache/cache';
import { reduceByBoxStatistic } from '../src/utilities/voxelGrid';
import VoxelStatistics from '../src/enums/VoxelStatistics';

const [width, height, depth] = [4, 4, 2];
const imageIds = ['rle-labelmap:0', 'rle-labelmap:1'];

// A labelmap with `labelmapVoxelRepresentation: 'rle'` keeps each image in a
// run length map, with no array of scalar data.
function putRleSlice(imageId, label) {
  const voxelManager = VoxelManager.createRLEImageVoxelManager({
    dimensions: [width, height],
    pixelDataConstructor: Uint8Array,
  });

  voxelManager.setAtIndex(0, label);
  voxelManager.setAtIndex(1, label);

  cache.putImageSync(imageId, {
    imageId,
    width,
    height,
    voxelManager,
    sizeInBytes: 1024,
  });
}

describe('the reduction of an image volume of RLE labelmap images', () => {
  afterEach(() => {
    for (const imageId of imageIds) {
      try {
        cache.removeImageLoadObject(imageId);
      } catch {
        // not cached
      }
    }
  });

  it('keeps the labels of the run length maps', () => {
    putRleSlice(imageIds[0], 5);
    putRleSlice(imageIds[1], 5);

    const source = VoxelManager.createImageVolumeVoxelManager({
      dimensions: [width, height, depth],
      imageIds,
      numberOfComponents: 1,
    });
    const written = new Map();

    reduceByBoxStatistic(
      source,
      { factors: [2, 2, 2] },
      { setAtIJK: (i, j, k, value) => written.set(`${i},${j},${k}`, value) },
      { statistic: VoxelStatistics.ForegroundMajority }
    );

    expect(written.get('0,0,0')).toBe(5);
    expect(written.get('1,1,0')).toBe(0);
  });
});
