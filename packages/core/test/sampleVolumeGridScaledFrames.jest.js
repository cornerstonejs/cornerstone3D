import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { InterpolationType } from '../src/enums';
import sampleVolumeGrid from '../src/utilities/sampleVolumeGrid';
import VoxelManager from '../src/utilities/VoxelManager';
import cache from '../src/cache/cache';

/**
 * Row 342 (lane FX24): a frame of a streaming volume that an image of another
 * size holds (a sub-resolution decode) was read through a call per voxel
 * (`_getSliceReader` with its scaling), 174 to 214 ms for one 512 x 512 slice.
 * The voxel manager of the volume now keeps one scaled copy of such a frame,
 * made in one pass at its first read (`_getSliceView`), so the sampler reads
 * it as an array: no call per voxel, and the values of the read through
 * `getAtIJK`, bit for bit.
 */

const width = 16;
const height = 12;
const depth = 7;
const cachedImageIds = [];

afterEach(() => {
  cachedImageIds.splice(0).forEach((imageId) => {
    if (cache.getImage(imageId)) {
      cache.removeImageLoadObject(imageId);
    }
  });
  jest.restoreAllMocks();
});

function valuesOf(seed, length, ArrayType) {
  const values = new ArrayType(length);

  for (let index = 0; index < length; index++) {
    const value = ((index * 53 + seed * 97) % 401) - 200;

    values[index] = ArrayType === Float32Array ? value / 3 : value;
  }

  return values;
}

/**
 * A volume of one cached image per frame, each frame an image of
 * `frameWidth` x `frameHeight` (smaller than the volume for a reduced
 * frame), with the voxel managers of the images kept to count their reads.
 */
function createVolume(name, ArrayType, sizes) {
  const imageIds = sizes.map((_, k) => `scaled-frames-${name}:${k}`);
  const imageVoxelManagers = [];

  sizes.forEach(([frameWidth, frameHeight], k) => {
    const scalarData = valuesOf(k, frameWidth * frameHeight, ArrayType);
    const imageVoxelManager = VoxelManager.createImageVoxelManager({
      width: frameWidth,
      height: frameHeight,
      scalarData,
      numberOfComponents: 1,
    });

    imageVoxelManagers.push(imageVoxelManager);
    cache.putImageSync(imageIds[k], {
      imageId: imageIds[k],
      width: frameWidth,
      height: frameHeight,
      voxelManager: imageVoxelManager,
      getPixelData: () => scalarData,
      sizeInBytes: scalarData.byteLength,
    });
    cachedImageIds.push(imageIds[k]);
  });

  return {
    imageIds,
    imageVoxelManagers,
    volume: {
      dimensions: [width, height, depth],
      voxelManager: VoxelManager.createImageVolumeVoxelManager({
        dimensions: [width, height, depth],
        imageIds,
        numberOfComponents: 1,
      }),
    },
  };
}

const reduced = [width / 2, height / 2];
const odd = [5, 7];
const full = [width, height];
const sizes = [reduced, full, odd, reduced, full, reduced, odd];

function readThroughGetAtIJK(volume) {
  return {
    dimensions: volume.dimensions,
    voxelManager: {
      getAtIJK: (i, j, k) => volume.voxelManager.getAtIJK(i, j, k),
    },
  };
}

const grids = {
  acquisitionPlane: {
    startIndex: [0, 0, 3],
    columnStep: [1, 0, 0],
    rowStep: [0, 1, 0],
    width,
    height,
  },
  betweenFrames: {
    startIndex: [0, 0, 2.3],
    columnStep: [1, 0, 0],
    rowStep: [0, 1, 0],
    width,
    height,
  },
  acrossTheFramesAlongJ: {
    startIndex: [6, 0, 0],
    columnStep: [0, 1, 0],
    rowStep: [0, 0, 1],
    width: height,
    height: depth,
  },
  acrossTheFramesAlongI: {
    startIndex: [0, 5, 0],
    columnStep: [1, 0, 0],
    rowStep: [0, 0, 1],
    width,
    height: depth,
  },
  oblique: {
    startIndex: [-0.5, 0.25, 0.2],
    columnStep: [0.7, 0.2, 0.3],
    rowStep: [0.1, 0.6, 0.25],
    width: 20,
    height: 14,
  },
};

const interpolations = [
  ['nearest', InterpolationType.NEAREST],
  ['linear', InterpolationType.LINEAR],
];

function sample(volume, grid, interpolationType) {
  const pixelData = new Float64Array(grid.width * grid.height);
  const range = sampleVolumeGrid({
    volume,
    pixelData,
    interpolationType,
    outsideValue: -9999,
    ...grid,
  });

  return { range, pixelData: Array.from(pixelData) };
}

describe('A frame that an image of another size holds', () => {
  describe.each([
    ['Int16', Int16Array],
    ['Float32', Float32Array],
  ])('%s frames', (typeName, ArrayType) => {
    describe.each(Object.entries(grids))('the %s grid', (gridName, grid) => {
      it.each(interpolations)(
        'gives the values of a read through getAtIJK, %s',
        (_, interpolationType) => {
          const { volume } = createVolume(
            `${typeName}-${gridName}`,
            ArrayType,
            sizes
          );

          expect(sample(volume, grid, interpolationType)).toEqual(
            sample(readThroughGetAtIJK(volume), grid, interpolationType)
          );
        }
      );
    });
  });

  it.each(interpolations)(
    'is read with no call per voxel: one scaled copy of each frame, %s',
    (_, interpolationType) => {
      const { volume, imageVoxelManagers } = createVolume(
        `cost-${interpolationType}`,
        Int16Array,
        sizes
      );
      const reads = imageVoxelManagers.map((imageVoxelManager) =>
        jest.spyOn(imageVoxelManager, '_get')
      );

      Object.values(grids).forEach((grid) =>
        sample(volume, grid, interpolationType)
      );

      expect(reads.map((read) => read.mock.calls.length)).toEqual(
        new Array(depth).fill(0)
      );
    }
  );

  it('keeps the scaled copy of a frame until its image changes or a voxel of it is set', () => {
    const { volume, imageIds } = createVolume('kept', Int16Array, sizes);
    const { voxelManager } = volume;
    const first = voxelManager._getSliceView(0);

    expect(first.length).toBe(width * height);
    expect(voxelManager._getSliceView(0)).toBe(first);

    voxelManager.setAtIJK(2, 3, 0, 1234);

    const afterSet = voxelManager._getSliceView(0);

    expect(afterSet).not.toBe(first);
    expect(afterSet[3 * width + 2]).toBe(1234);
    expect(voxelManager.getAtIJK(2, 3, 0)).toBe(1234);

    const scalarData = new Int16Array(width * height).fill(7);

    cache.removeImageLoadObject(imageIds[0]);
    cache.putImageSync(imageIds[0], {
      imageId: imageIds[0],
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
    voxelManager.invalidateSlice(0);

    expect(voxelManager._getSliceView(0)).toBe(scalarData);
  });
});
