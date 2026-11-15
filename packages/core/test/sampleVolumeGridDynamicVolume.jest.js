import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { InterpolationType } from '../src/enums';
import cache from '../src/cache/cache';
import sampleVolumeGrid from '../src/utilities/sampleVolumeGrid';
import VoxelManager from '../src/utilities/VoxelManager';

const width = 5;
const height = 4;
const depth = 3;
const groupCount = 2;
const imageIdGroups = Array.from({ length: groupCount }, (_, group) =>
  Array.from({ length: depth }, (_, k) => `dynamic-image:${group}:${k}`)
);

/**
 * The value of a voxel of one dimension group of the test volume. The groups
 * differ everywhere.
 */
function voxelValue(group, i, j, k) {
  return 1000 * (group + 1) + 100 * k + 10 * j + i;
}

/**
 * Puts the images of every dimension group of the test volume in the cache.
 */
function putImages() {
  imageIdGroups.forEach((imageIds, group) => {
    imageIds.forEach((imageId, k) => {
      const scalarData = new Int16Array(width * height);

      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          scalarData[j * width + i] = voxelValue(group, i, j, k);
        }
      }

      cache.putImageSync(imageId, {
        imageId,
        width,
        height,
        voxelManager: VoxelManager.createImageVoxelManager({
          width,
          height,
          scalarData,
          numberOfComponents: 1,
        }),
        getPixelData: () => scalarData,
        sizeInBytes: scalarData.byteLength,
      });
    });
  });
}

describe('sampleVolumeGrid on a dynamic volume', () => {
  afterEach(() => {
    imageIdGroups.flat().forEach((imageId) => {
      try {
        cache.removeImageLoadObject(imageId);
      } catch {
        return;
      }
    });
  });

  it.each([
    ['an axial cut', [0, 0, 1], [1, 0, 0], [0, 1, 0]],
    ['a sagittal cut', [2, 0, 0], [0, 1, 0], [0, 0, 1]],
    ['an oblique grid', [0.3, 0.2, 0.1], [0.9, 0.3, 0.2], [0.1, 0.7, 0.5]],
  ])(
    'reads %s frame by frame from the dimension group that is active',
    (_name, startIndex, columnStep, rowStep) => {
      putImages();

      const voxelManager = VoxelManager.createScalarDynamicVolumeVoxelManager({
        imageIdGroups,
        dimensions: [width, height, depth],
      });
      const getAtIJK = jest.spyOn(voxelManager, 'getAtIJK');
      const volume = { dimensions: [width, height, depth], voxelManager };
      const grid = { width: 4, height: 3, startIndex, columnStep, rowStep };
      const first = new Array(grid.width * grid.height);

      sampleVolumeGrid({
        volume,
        pixelData: first,
        ...grid,
        interpolationType: InterpolationType.NEAREST,
      });

      voxelManager.setDimensionGroupNumber(2);

      const second = new Array(grid.width * grid.height);

      sampleVolumeGrid({
        volume,
        pixelData: second,
        ...grid,
        interpolationType: InterpolationType.NEAREST,
      });

      expect(getAtIJK).not.toHaveBeenCalled();

      const expectedSecond = readNearest(voxelManager, grid);

      voxelManager.setDimensionGroupNumber(1);

      const expectedFirst = readNearest(voxelManager, grid);

      expect(first).toEqual(expectedFirst);
      expect(second).toEqual(expectedSecond);
      expect(first).not.toEqual(second);
    }
  );
});

/**
 * Reads the nearest voxel of each grid point through getAtIJK. A grid point
 * outside the volume gives 0, the default outside value of sampleVolumeGrid.
 */
function readNearest(voxelManager, grid) {
  const values = [];

  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      const index = [0, 1, 2].map((axis) =>
        Math.floor(
          grid.startIndex[axis] +
            column * grid.columnStep[axis] +
            row * grid.rowStep[axis] +
            0.5 -
            1e-6
        )
      );
      const inside = index.every(
        (value, axis) => value >= 0 && value < [width, height, depth][axis]
      );

      values.push(
        inside ? voxelManager.getAtIJK(index[0], index[1], index[2]) : 0
      );
    }
  }

  return values;
}
