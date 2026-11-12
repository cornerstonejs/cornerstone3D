import cache from '../src/cache/cache';
import { InterpolationType } from '../src/enums';
import { getSpatiallyClampedContinuousIndex } from '../src/RenderingEngine/GenericViewport/Planar/planarCPUVolumeSamplingUtils';
import sampleVolumeGrid from '../src/utilities/sampleVolumeGrid';
import VoxelManager from '../src/utilities/VoxelManager';

const dimensions = [7, 6, 5];
const sliceSize = dimensions[0] * dimensions[1];

/**
 * A small deterministic random number generator, so that a failing grid can
 * be reproduced from its seed.
 */
function createRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

/**
 * Builds a test volume of one typed array per slice. The access option decides
 * how the sampler can reach the voxels:
 * - 'slices': each slice image exposes its typed array.
 * - 'hidden': no slice image exposes an array, as with RLE images.
 * - 'volume': the voxel manager of the volume exposes one array of all voxels.
 * - 'mixed': one slice image is missing and one has an array of another size.
 */
function createVolume({ ArrayType = Int16Array, access = 'slices' } = {}) {
  const random = createRandom(7);
  const volumeArray = new ArrayType(sliceSize * dimensions[2]);

  for (let index = 0; index < volumeArray.length; index++) {
    volumeArray[index] =
      ArrayType === Float32Array
        ? random() * 200 - 100
        : Math.floor(random() * 2000) - 1000;
  }

  const sliceArrays = Array.from({ length: dimensions[2] }, (_, k) =>
    volumeArray.subarray(k * sliceSize, (k + 1) * sliceSize)
  );
  const getAtIJK = jest.fn((i, j, k) => sliceArrays[k][j * dimensions[0] + i]);

  jest.spyOn(cache, 'getImage').mockImplementation((imageId) => {
    const sliceIndex = Number(imageId.split('-')[1]);

    if (access === 'mixed' && sliceIndex === 1) {
      return undefined;
    }

    return {
      voxelManager: {
        getWritableScalarData: () => {
          if (access === 'hidden' || access === 'volume') {
            return undefined;
          }

          if (access === 'mixed' && sliceIndex === 3) {
            return new ArrayType(4);
          }

          return sliceArrays[sliceIndex];
        },
      },
    };
  });

  return {
    getAtIJK,
    volumeArray,
    volume: {
      dimensions,
      imageIds: sliceArrays.map((_, k) => `slice-${k}`),
      voxelManager: {
        getAtIJK,
        getWritableScalarData: () =>
          access === 'volume' ? volumeArray : undefined,
      },
    },
  };
}

/**
 * The sampling that the CPU volume rendering did before it used
 * sampleVolumeGrid: one voxel manager lookup per grid point, with the same
 * border, limit and rounding rules. sampleVolumeGrid must give the same
 * values.
 */
function sampleReference(volume, options) {
  const {
    width,
    height,
    startIndex,
    columnStep,
    rowStep,
    interpolationType = InterpolationType.NEAREST,
    outsideValue = 0,
    valueRange,
    round = false,
  } = options;
  const values = [];
  const rowStart = [...startIndex];
  let min = Infinity;
  let max = -Infinity;

  for (let row = 0; row < height; row++) {
    const sampleIndex = [...rowStart];

    for (let column = 0; column < width; column++) {
      const clampedIndex = getSpatiallyClampedContinuousIndex(
        volume.dimensions,
        sampleIndex
      );
      let value = outsideValue;

      if (clampedIndex) {
        value = VoxelManager.sampleAtContinuousIndex(
          volume.voxelManager,
          volume.dimensions,
          clampedIndex,
          interpolationType
        );

        if (valueRange) {
          if (!Number.isFinite(value)) {
            value = outsideValue;
          } else {
            value = Math.min(valueRange.max, Math.max(valueRange.min, value));
          }
        }

        if (round) {
          value = Math.round(value);
        }
      }

      values.push(value);
      min = Math.min(min, value);
      max = Math.max(max, value);
      sampleIndex[0] += columnStep[0];
      sampleIndex[1] += columnStep[1];
      sampleIndex[2] += columnStep[2];
    }

    rowStart[0] += rowStep[0];
    rowStart[1] += rowStep[1];
    rowStart[2] += rowStep[2];
  }

  return { values, range: { min, max } };
}

/**
 * Builds a random grid that crosses the test volume. Some grids get a step
 * with components of exactly zero, which is the case of a view along a volume
 * axis.
 */
function createRandomGrid(random) {
  const randomStep = () =>
    [0, 1, 2].map(() =>
      random() < 0.25 ? 0 : (random() - 0.5) * (random() < 0.5 ? 0.4 : 1.6)
    );

  return {
    width: 5 + Math.floor(random() * 14),
    height: 4 + Math.floor(random() * 9),
    startIndex: dimensions.map((size) => random() * (size + 4) - 2),
    columnStep: randomStep(),
    rowStep: randomStep(),
  };
}

/**
 * Samples the grid with sampleVolumeGrid into a plain array, so that the
 * values are compared before any typed array conversion.
 */
function sampleGrid(volume, options) {
  const pixelData = new Array(options.width * options.height).fill(null);
  const range = sampleVolumeGrid({ volume, pixelData, ...options });

  return { values: pixelData, range };
}

describe('sampleVolumeGrid', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe.each([['slices'], ['hidden'], ['volume'], ['mixed']])(
    'with voxel access "%s"',
    (access) => {
      it.each([
        ['nearest', InterpolationType.NEAREST],
        ['linear', InterpolationType.LINEAR],
      ])(
        'matches the per-voxel reference on random grids with %s sampling',
        (_name, interpolationType) => {
          const random = createRandom(interpolationType + 11);

          for (let gridNumber = 0; gridNumber < 300; gridNumber++) {
            const { volume } = createVolume({ access });
            const grid = createRandomGrid(random);
            const options = {
              ...grid,
              interpolationType,
              outsideValue: -1000,
              valueRange: { min: -1000, max: 1000 },
              round: true,
            };
            const sampled = sampleGrid(volume, options);
            const reference = sampleReference(
              createVolume({ access: 'hidden' }).volume,
              options
            );

            expect({ gridNumber, ...sampled }).toEqual({
              gridNumber,
              ...reference,
            });
          }
        }
      );
    }
  );

  it('matches the reference on a float volume without limits or rounding', () => {
    const random = createRandom(3);

    for (let gridNumber = 0; gridNumber < 200; gridNumber++) {
      const grid = createRandomGrid(random);
      const options = {
        ...grid,
        interpolationType: InterpolationType.LINEAR,
        outsideValue: 0,
      };
      const sampled = sampleGrid(
        createVolume({ ArrayType: Float32Array }).volume,
        options
      );
      const reference = sampleReference(
        createVolume({ ArrayType: Float32Array, access: 'hidden' }).volume,
        options
      );

      expect({ gridNumber, ...sampled }).toEqual({ gridNumber, ...reference });
    }
  });

  it('reads the slice arrays and never the voxel manager when the slices expose them', () => {
    const { volume, getAtIJK } = createVolume({ access: 'slices' });

    sampleGrid(volume, {
      width: 12,
      height: 12,
      startIndex: [-1, -1, 0.2],
      columnStep: [0.7, 0.1, 0.3],
      rowStep: [0.1, 0.6, 0.1],
      interpolationType: InterpolationType.LINEAR,
    });

    expect(getAtIJK).not.toHaveBeenCalled();
  });

  it('reads the array of the volume without asking the cache for slice images', () => {
    const { volume, getAtIJK } = createVolume({ access: 'volume' });

    sampleGrid(volume, {
      width: 12,
      height: 12,
      startIndex: [-1, -1, 0.2],
      columnStep: [0.7, 0.1, 0.3],
      rowStep: [0.1, 0.6, 0.1],
    });

    expect(getAtIJK).not.toHaveBeenCalled();
    expect(cache.getImage).not.toHaveBeenCalled();
  });

  it('reads through the voxel manager only for the slices without a usable array', () => {
    const { volume, getAtIJK } = createVolume({ access: 'mixed' });

    sampleGrid(volume, {
      width: 7,
      height: 5,
      startIndex: [0, 0, 0],
      columnStep: [1, 0, 0],
      rowStep: [0, 0, 1],
    });

    const slicesReadPerVoxel = new Set(
      getAtIJK.mock.calls.map(([, , sliceIndex]) => sliceIndex)
    );

    expect(Array.from(slicesReadPerVoxel).sort()).toEqual([1, 3]);
  });

  it('copies a slice of voxels for a grid on the voxel centers', () => {
    const { volume, volumeArray } = createVolume();
    const sampled = sampleGrid(volume, {
      width: dimensions[0],
      height: dimensions[1],
      startIndex: [0, 0, 2],
      columnStep: [1, 0, 0],
      rowStep: [0, 1, 0],
    });

    expect(sampled.values).toEqual(
      Array.from(volumeArray.subarray(2 * sliceSize, 3 * sliceSize))
    );
  });

  it('counts a grid point as inside up to half a voxel beyond the outermost voxel centers', () => {
    const { volume, volumeArray } = createVolume();
    const sampled = sampleGrid(volume, {
      width: 4,
      height: 1,
      startIndex: [-0.6, 0, 0],
      columnStep: [0.2, 0, 0],
      rowStep: [0, 0, 0],
      outsideValue: 5000,
    });

    expect(sampled.values).toEqual([
      5000,
      volumeArray[0],
      volumeArray[0],
      volumeArray[0],
    ]);
  });

  it('repeats the outermost voxel for a linear sample in the half voxel beyond its center', () => {
    const { volume, volumeArray } = createVolume();
    const sampled = sampleGrid(volume, {
      width: 2,
      height: 1,
      startIndex: [dimensions[0] - 0.75, 0, 0],
      columnStep: [1, 0, 0],
      rowStep: [0, 0, 0],
      interpolationType: InterpolationType.LINEAR,
      outsideValue: 5000,
    });

    expect(sampled.values).toEqual([volumeArray[dimensions[0] - 1], 5000]);
  });

  it('fills a grid that misses the volume with the outside value', () => {
    const { volume } = createVolume();
    const sampled = sampleGrid(volume, {
      width: 6,
      height: 3,
      startIndex: [40, 40, 40],
      columnStep: [0.5, 0.5, 0],
      rowStep: [0, 0.5, 0.5],
      outsideValue: -7,
    });

    expect(sampled.values).toEqual(new Array(18).fill(-7));
    expect(sampled.range).toEqual({ min: -7, max: -7 });
  });

  it('samples every grid point when both steps are zero', () => {
    const { volume, volumeArray } = createVolume();
    const sampled = sampleGrid(volume, {
      width: 3,
      height: 2,
      startIndex: [2, 3, 1],
      columnStep: [0, 0, 0],
      rowStep: [0, 0, 0],
    });
    const value = volumeArray[sliceSize + 3 * dimensions[0] + 2];

    expect(sampled.values).toEqual(new Array(6).fill(value));
    expect(sampled.range).toEqual({ min: value, max: value });
  });

  it('limits and rounds the samples and replaces a sample that is not finite', () => {
    const { volume, volumeArray } = createVolume({ ArrayType: Float32Array });

    volumeArray[0] = 1e9;
    volumeArray[1] = NaN;
    volumeArray[2] = 12.6;

    const sampled = sampleGrid(volume, {
      width: 3,
      height: 1,
      startIndex: [0, 0, 0],
      columnStep: [1, 0, 0],
      rowStep: [0, 0, 0],
      outsideValue: -50,
      valueRange: { min: -50, max: 50 },
      round: true,
    });

    expect(sampled.values).toEqual([50, -50, 13]);
    expect(sampled.range).toEqual({ min: -50, max: 50 });
  });

  it('writes into a typed array and returns the range of the written values', () => {
    const { volume, volumeArray } = createVolume();
    const pixelData = new Int16Array(dimensions[0]);
    const range = sampleVolumeGrid({
      volume,
      pixelData,
      width: dimensions[0],
      height: 1,
      startIndex: [0, 0, 0],
      columnStep: [1, 0, 0],
      rowStep: [0, 0, 0],
    });
    const expected = Array.from(volumeArray.subarray(0, dimensions[0]));

    expect(Array.from(pixelData)).toEqual(expected);
    expect(range).toEqual({
      min: Math.min(...expected),
      max: Math.max(...expected),
    });
  });
});
