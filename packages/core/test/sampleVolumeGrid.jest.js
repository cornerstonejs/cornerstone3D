import { InterpolationType } from '../src/enums';
import { getSpatiallyClampedContinuousIndex } from '../src/RenderingEngine/GenericViewport/Planar/planarCPUVolumeSamplingUtils';
import sampleVolumeGrid, {
  isIndexInsideVolume,
} from '../src/utilities/sampleVolumeGrid';
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
 * - 'slices': _getSliceView gives the typed array of each slice.
 * - 'hidden': _getSliceView gives nothing, as with RLE or scaled images.
 * - 'volume': the voxel manager of the volume exposes one array of all voxels.
 * - 'mixed': one slice view is missing and one has an array of another size.
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
  const getSliceView = jest.fn((sliceIndex) => {
    if (access !== 'slices' && access !== 'mixed') {
      return undefined;
    }

    if (access === 'mixed' && sliceIndex === 1) {
      return undefined;
    }

    if (access === 'mixed' && sliceIndex === 3) {
      return new ArrayType(4);
    }

    return sliceArrays[sliceIndex];
  });

  return {
    getAtIJK,
    getSliceView,
    volumeArray,
    volume: {
      dimensions,
      voxelManager: {
        getAtIJK,
        _getSliceView: getSliceView,
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
 * Builds a random straight cut of the test volume: the column step and the
 * row step each move along one index axis by one or two voxels, and the start
 * index is a whole number on those two axes. The coordinate on the third axis
 * lies on a voxel center, half way between two centers, anywhere between them,
 * or just outside the volume. Many cuts reach partly outside the volume.
 */
function createRandomStraightCut(random) {
  const axes = [0, 1, 2].sort(() => random() - 0.5);
  const [columnAxis, rowAxis, fixedAxis] = axes;
  const wholeStep = () => (random() < 0.5 ? -1 : 1) * (random() < 0.8 ? 1 : 2);
  const columnStep = [0, 0, 0];
  const rowStep = [0, 0, 0];
  const startIndex = [0, 0, 0];
  const fixedSize = dimensions[fixedAxis];
  const fixedChoices = [
    () => Math.floor(random() * fixedSize),
    () => Math.floor(random() * (fixedSize - 1)) + 0.5,
    () => random() * (fixedSize - 1),
    () => -0.5 + random() * 0.5,
    () => fixedSize - 1 + random() * 0.5,
    () => (random() < 0.5 ? -0.6 : fixedSize - 0.4),
    () => Math.floor(random() * fixedSize) + 1e-7,
  ];

  columnStep[columnAxis] = wholeStep();
  rowStep[rowAxis] = wholeStep();
  startIndex[columnAxis] =
    Math.floor(random() * (dimensions[columnAxis] + 6)) - 3;
  startIndex[rowAxis] = Math.floor(random() * (dimensions[rowAxis] + 6)) - 3;
  startIndex[fixedAxis] =
    fixedChoices[Math.floor(random() * fixedChoices.length)]();

  return {
    width: 1 + Math.floor(random() * 12),
    height: 1 + Math.floor(random() * 10),
    startIndex,
    columnStep,
    rowStep,
  };
}

/**
 * Picks the outside value, the value range and the rounding of a test grid.
 */
function createRandomFinishOptions(random) {
  const choice = Math.floor(random() * 4);

  if (choice === 0) {
    return {};
  }

  if (choice === 1) {
    return { outsideValue: -1000, round: true };
  }

  if (choice === 2) {
    return {
      outsideValue: 3,
      valueRange: { min: -400, max: 300 },
      round: random() < 0.5,
    };
  }

  return { outsideValue: 70000 };
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

  it('reads the array of the volume without asking for slice views', () => {
    const { volume, getAtIJK, getSliceView } = createVolume({
      access: 'volume',
    });

    sampleGrid(volume, {
      width: 12,
      height: 12,
      startIndex: [-1, -1, 0.2],
      columnStep: [0.7, 0.1, 0.3],
      rowStep: [0.1, 0.6, 0.1],
    });

    expect(getAtIJK).not.toHaveBeenCalled();
    expect(getSliceView).not.toHaveBeenCalled();
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

  describe.each([
    ['slices', Int16Array],
    ['volume', Int16Array],
    ['slices', Float32Array],
    ['volume', Float32Array],
  ])('on a straight cut with voxel access "%s" and %p', (access, ArrayType) => {
    it.each([
      ['nearest', InterpolationType.NEAREST],
      ['linear', InterpolationType.LINEAR],
    ])(
      'gives the values and the range of the general loop with %s sampling',
      (_name, interpolationType) => {
        const random = createRandom(interpolationType + 101);

        for (let gridNumber = 0; gridNumber < 600; gridNumber++) {
          const grid = createRandomStraightCut(random);
          const options = {
            ...grid,
            interpolationType,
            ...createRandomFinishOptions(random),
          };
          const { volume, getAtIJK } = createVolume({ ArrayType, access });
          const sampled = sampleGrid(volume, options);
          const general = sampleGrid(
            createVolume({ ArrayType, access: 'hidden' }).volume,
            options
          );

          expect({ gridNumber, ...sampled }).toEqual({
            gridNumber,
            ...general,
          });
          expect(getAtIJK).not.toHaveBeenCalled();
        }
      }
    );

    it.each([
      ['nearest', InterpolationType.NEAREST],
      ['linear', InterpolationType.LINEAR],
    ])(
      'writes the values of the general loop into a typed array with %s sampling',
      (_name, interpolationType) => {
        const random = createRandom(interpolationType + 202);

        for (let gridNumber = 0; gridNumber < 300; gridNumber++) {
          const grid = createRandomStraightCut(random);
          const options = {
            ...grid,
            interpolationType,
            ...createRandomFinishOptions(random),
          };
          const sampled = new ArrayType(grid.width * grid.height);
          const general = new ArrayType(grid.width * grid.height);
          const sampledRange = sampleVolumeGrid({
            volume: createVolume({ ArrayType, access }).volume,
            pixelData: sampled,
            ...options,
          });
          const generalRange = sampleVolumeGrid({
            volume: createVolume({ ArrayType, access: 'hidden' }).volume,
            pixelData: general,
            ...options,
          });

          expect({ gridNumber, values: Array.from(sampled) }).toEqual({
            gridNumber,
            values: Array.from(general),
          });
          expect(sampledRange).toEqual(generalRange);
        }
      }
    );
  });

  it('copies the rows of a coronal cut with TypedArray.set', () => {
    const { volume, volumeArray } = createVolume();
    const pixelData = new Int16Array(dimensions[0] * dimensions[2]);
    const setSpy = jest.spyOn(pixelData, 'set');
    const row = 2;

    sampleVolumeGrid({
      volume,
      pixelData,
      width: dimensions[0],
      height: dimensions[2],
      startIndex: [0, row, 0],
      columnStep: [1, 0, 0],
      rowStep: [0, 0, 1],
    });

    const expected = [];

    for (let k = 0; k < dimensions[2]; k++) {
      const first = k * sliceSize + row * dimensions[0];

      expected.push(...volumeArray.subarray(first, first + dimensions[0]));
    }

    expect(setSpy).toHaveBeenCalledTimes(dimensions[2]);
    expect(Array.from(pixelData)).toEqual(expected);
  });

  it('mixes the two columns of voxels around a sagittal cut between them', () => {
    const { volume, volumeArray } = createVolume();
    const position = 2.25;
    const sampled = sampleGrid(volume, {
      width: dimensions[1],
      height: dimensions[2],
      startIndex: [position, 0, 0],
      columnStep: [0, 1, 0],
      rowStep: [0, 0, 1],
      interpolationType: InterpolationType.LINEAR,
      round: true,
    });
    const expected = [];

    for (let k = 0; k < dimensions[2]; k++) {
      for (let j = 0; j < dimensions[1]; j++) {
        const lower = k * sliceSize + j * dimensions[0] + 2;

        expected.push(
          Math.round(volumeArray[lower] * 0.75 + volumeArray[lower + 1] * 0.25)
        );
      }
    }

    expect(sampled.values).toEqual(expected);
  });

  describe.each([
    ['slices', Float32Array],
    ['volume', Float32Array],
    ['slices', Float64Array],
  ])(
    'on a straight cut of a random float volume with voxel access "%s" and %p',
    (access, ArrayType) => {
      it.each([
        ['on a voxel plane', true],
        ['between two voxel planes', false],
      ])(
        'gives the values and the range of the general loop for every cut direction %s',
        (_name, onPlane) => {
          const random = createRandom(onPlane ? 31 : 37);

          for (let volumeNumber = 0; volumeNumber < 20; volumeNumber++) {
            const floatDimensions = [0, 1, 2].map(
              () => 2 + Math.floor(random() * 7)
            );
            const values = Array.from(
              {
                length:
                  floatDimensions[0] * floatDimensions[1] * floatDimensions[2],
              },
              () => (random() - 0.5) * 1e4
            );

            for (let fixedAxis = 0; fixedAxis < 3; fixedAxis++) {
              const cut = createAxisCut(floatDimensions, fixedAxis, random);
              const fixedLast = floatDimensions[fixedAxis] - 1;

              cut.startIndex[fixedAxis] = onPlane
                ? Math.floor(random() * (fixedLast + 1))
                : Math.floor(random() * fixedLast) + 0.05 + random() * 0.9;

              const options = {
                ...cut,
                interpolationType: InterpolationType.LINEAR,
                outsideValue: -7,
              };
              const fast = createValuesVolume(
                floatDimensions,
                values,
                ArrayType,
                access
              );
              const general = createValuesVolume(
                floatDimensions,
                values,
                ArrayType,
                'hidden'
              );
              const sampled = sampleGrid(fast.volume, options);

              expect({ volumeNumber, fixedAxis, ...sampled }).toEqual({
                volumeNumber,
                fixedAxis,
                ...sampleGrid(general.volume, options),
              });
              expect(fast.getAtIJK).not.toHaveBeenCalled();

              const typedSampled = new ArrayType(cut.width * cut.height);
              const typedGeneral = new ArrayType(cut.width * cut.height);

              expect(
                sampleVolumeGrid({
                  volume: fast.volume,
                  pixelData: typedSampled,
                  ...options,
                })
              ).toEqual(
                sampleVolumeGrid({
                  volume: general.volume,
                  pixelData: typedGeneral,
                  ...options,
                })
              );
              expect(Array.from(typedSampled)).toEqual(
                Array.from(typedGeneral)
              );
            }
          }
        }
      );
    }
  );

  it('copies the rows of a coronal cut of a float volume with TypedArray.set for a linear sample', () => {
    const { volume, volumeArray } = createVolume({ ArrayType: Float32Array });
    const pixelData = new Float32Array(dimensions[0] * dimensions[2]);
    const setSpy = jest.spyOn(pixelData, 'set');
    const row = 3;

    sampleVolumeGrid({
      volume,
      pixelData,
      width: dimensions[0],
      height: dimensions[2],
      startIndex: [0, row, 0],
      columnStep: [1, 0, 0],
      rowStep: [0, 0, 1],
      interpolationType: InterpolationType.LINEAR,
    });

    const expected = [];

    for (let k = 0; k < dimensions[2]; k++) {
      const first = k * sliceSize + row * dimensions[0];

      expected.push(...volumeArray.subarray(first, first + dimensions[0]));
    }

    expect(setSpy).toHaveBeenCalledTimes(dimensions[2]);
    expect(Array.from(pixelData)).toEqual(expected);
  });

  it('lets a voxel that is not finite affect only the samples that use it on a straight cut', () => {
    const random = createRandom(19);

    for (let gridNumber = 0; gridNumber < 400; gridNumber++) {
      const grid = createRandomStraightCut(random);
      const interpolationType =
        gridNumber % 2 ? InterpolationType.LINEAR : InterpolationType.NEAREST;
      const options = { ...grid, interpolationType, outsideValue: -3 };
      const { volume, volumeArray } = createVolume({ ArrayType: Float32Array });

      volumeArray[3] = Infinity;
      volumeArray[sliceSize + 9] = NaN;
      volumeArray[2 * sliceSize + 20] = -Infinity;
      volumeArray[3 * sliceSize + 20] = Infinity;

      expect({ gridNumber, ...sampleGrid(volume, options) }).toEqual({
        gridNumber,
        ...sampleStraightCutReference(volumeArray, dimensions, options),
      });
    }
  });

  it('keeps the neighbours of an infinite voxel finite on a straight cut, where the general loop gives NaN', () => {
    const { volume, volumeArray } = createVolume({ ArrayType: Float32Array });
    const hidden = createVolume({ ArrayType: Float32Array, access: 'hidden' });
    const infiniteIndex = 2 * sliceSize + 2 * dimensions[0] + 3;

    volumeArray[infiniteIndex] = Infinity;
    hidden.volumeArray[infiniteIndex] = Infinity;

    const onPlane = {
      width: dimensions[0],
      height: dimensions[1],
      startIndex: [0, 0, 2],
      columnStep: [1, 0, 0],
      rowStep: [0, 1, 0],
      interpolationType: InterpolationType.LINEAR,
    };
    const betweenPlanes = { ...onPlane, startIndex: [0, 0, 1.75] };
    const pixel = 2 * dimensions[0] + 3;
    const straight = sampleGrid(volume, onPlane).values;
    const general = sampleGrid(hidden.volume, onPlane).values;
    const mixed = sampleGrid(volume, betweenPlanes).values;

    expect(straight[pixel]).toBe(Infinity);
    expect(straight.filter((value) => !Number.isFinite(value))).toHaveLength(1);
    expect(straight[pixel + 1]).toBe(volumeArray[infiniteIndex + 1]);
    expect(general[pixel]).toBe(Infinity);
    expect(general[pixel - 1]).toBeNaN();
    expect(mixed[pixel]).toBe(Infinity);
    expect(mixed.filter((value) => !Number.isFinite(value))).toHaveLength(1);
    expect(mixed[pixel + 1]).toBe(
      volumeArray[sliceSize + pixel + 1] * 0.25 +
        volumeArray[2 * sliceSize + pixel + 1] * 0.75
    );
  });
});

describe('sampleVolumeGrid with several components per voxel', () => {
  /**
   * Builds a colour volume of the test dimensions with random 8 bit
   * components, and one scalar volume per component with the same values.
   * With access 'volume' the voxel manager keeps every component in one
   * array; with 'voxels' it gives the components of a voxel as an array from
   * getAtIJK, as the voxel manager of an image volume does.
   */
  function createColourVolume(numberOfComponents, access, seed) {
    const random = createRandom(seed);
    const voxelCount = sliceSize * dimensions[2];
    const colourArray = new Uint8Array(voxelCount * numberOfComponents);

    for (let index = 0; index < colourArray.length; index++) {
      colourArray[index] = Math.floor(random() * 256);
    }

    const getAtIJK = jest.fn((i, j, k) => {
      const first =
        (k * sliceSize + j * dimensions[0] + i) * numberOfComponents;

      return Array.from(
        colourArray.subarray(first, first + numberOfComponents)
      );
    });
    const componentVolumes = Array.from(
      { length: numberOfComponents },
      (_, component) => {
        const values = new Uint8Array(voxelCount);

        for (let index = 0; index < voxelCount; index++) {
          values[index] = colourArray[index * numberOfComponents + component];
        }

        return createValuesVolume(dimensions, values, Uint8Array, 'slices')
          .volume;
      }
    );

    return {
      getAtIJK,
      componentVolumes,
      volume: {
        dimensions,
        voxelManager: {
          numberOfComponents,
          getAtIJK,
          _getSliceView: () => undefined,
          getWritableScalarData: () =>
            access === 'volume' ? colourArray : undefined,
        },
      },
    };
  }

  describe.each([
    [3, 'volume'],
    [3, 'voxels'],
    [4, 'volume'],
    [4, 'voxels'],
  ])(
    'with %p components and voxel access "%s"',
    (numberOfComponents, access) => {
      it.each([
        ['nearest', 'straight', InterpolationType.NEAREST, true],
        ['linear', 'straight', InterpolationType.LINEAR, true],
        ['nearest', 'oblique', InterpolationType.NEAREST, false],
        ['linear', 'oblique', InterpolationType.LINEAR, false],
      ])(
        'gives each component the values of a volume of that component alone, %s on %s grids',
        (_name, _grid, interpolationType, straight) => {
          const random = createRandom(
            numberOfComponents * 10 + interpolationType
          );
          const { volume, getAtIJK, componentVolumes } = createColourVolume(
            numberOfComponents,
            access,
            numberOfComponents + interpolationType
          );

          for (let gridNumber = 0; gridNumber < 150; gridNumber++) {
            const grid = straight
              ? createRandomStraightCut(random)
              : createRandomGrid(random);
            const options = {
              ...grid,
              interpolationType,
              ...createRandomFinishOptions(random),
            };
            const pixelCount = grid.width * grid.height;
            const colour = new Array(pixelCount * numberOfComponents).fill(
              null
            );
            const range = sampleVolumeGrid({
              volume,
              pixelData: colour,
              numberOfComponents,
              ...options,
            });
            const components = componentVolumes.map((componentVolume) =>
              sampleGrid(componentVolume, options)
            );
            const expected = [];

            for (let pixel = 0; pixel < pixelCount; pixel++) {
              components.forEach(({ values }) => expected.push(values[pixel]));
            }

            expect({ gridNumber, colour }).toEqual({
              gridNumber,
              colour: expected,
            });
            expect(range).toEqual({
              min: Math.min(...components.map(({ range }) => range.min)),
              max: Math.max(...components.map(({ range }) => range.max)),
            });
          }

          if (access === 'volume') {
            expect(getAtIJK).not.toHaveBeenCalled();
          }
        }
      );
    }
  );

  it('reads a component that getAtIJK does not give as 0', () => {
    const volume = {
      dimensions: [2, 1, 1],
      voxelManager: {
        numberOfComponents: 4,
        getAtIJK: (i) => (i === 0 ? [10, 20, 30] : [40, 50, 60]),
        getWritableScalarData: () => undefined,
      },
    };
    const pixelData = new Uint8Array(8);

    sampleVolumeGrid({
      volume,
      pixelData,
      numberOfComponents: 4,
      width: 2,
      height: 1,
      startIndex: [0, 0, 0],
      columnStep: [1, 0, 0],
      rowStep: [0, 0, 0],
    });

    expect(Array.from(pixelData)).toEqual([10, 20, 30, 0, 40, 50, 60, 0]);
  });
});

/**
 * Builds a straight cut of a volume of the given dimensions whose normal
 * follows fixedAxis: the column and the row step each move one voxel along
 * one of the two other axes, in a random order and direction, and the grid
 * starts at a random whole index that can lie outside the volume. The caller
 * sets the coordinate on fixedAxis.
 */
function createAxisCut(volumeDimensions, fixedAxis, random) {
  const [columnAxis, rowAxis] = [0, 1, 2]
    .filter((axis) => axis !== fixedAxis)
    .sort(() => random() - 0.5);
  const columnStep = [0, 0, 0];
  const rowStep = [0, 0, 0];
  const startIndex = [0, 0, 0];

  columnStep[columnAxis] = random() < 0.5 ? -1 : 1;
  rowStep[rowAxis] = random() < 0.5 ? -1 : 1;
  startIndex[columnAxis] =
    Math.floor(random() * (volumeDimensions[columnAxis] + 4)) - 2;
  startIndex[rowAxis] =
    Math.floor(random() * (volumeDimensions[rowAxis] + 4)) - 2;

  return {
    width: 1 + Math.floor(random() * (volumeDimensions[columnAxis] + 3)),
    height: 1 + Math.floor(random() * (volumeDimensions[rowAxis] + 3)),
    startIndex,
    columnStep,
    rowStep,
  };
}

/**
 * Builds a volume of the given dimensions and values, one typed array per
 * slice, with the voxel access of createVolume.
 */
function createValuesVolume(volumeDimensions, values, ArrayType, access) {
  const [columns, rows, slices] = volumeDimensions;
  const volumeArray = ArrayType.from(values);
  const sliceArrays = Array.from({ length: slices }, (_, k) =>
    volumeArray.subarray(k * columns * rows, (k + 1) * columns * rows)
  );
  const getAtIJK = jest.fn((i, j, k) => sliceArrays[k][j * columns + i]);

  return {
    getAtIJK,
    volume: {
      dimensions: volumeDimensions,
      voxelManager: {
        getAtIJK,
        _getSliceView: (sliceIndex) =>
          access === 'slices' ? sliceArrays[sliceIndex] : undefined,
        getWritableScalarData: () =>
          access === 'volume' ? volumeArray : undefined,
      },
    },
  };
}

/**
 * The documented values of a straight cut: a copy of the nearest voxel, or of
 * the voxel on the plane, and the mix lower x (1 - w) + upper x w of the two
 * planes around a linear sample between them. Only the voxels with a weight
 * above zero are read, so a voxel that is not finite reaches only the samples
 * that use it.
 */
function sampleStraightCutReference(volumeArray, volumeDimensions, options) {
  const {
    width,
    height,
    startIndex,
    columnStep,
    rowStep,
    interpolationType,
    outsideValue,
  } = options;
  const [columns, rows] = volumeDimensions;
  const fixedAxis = [0, 1, 2].find(
    (axis) => columnStep[axis] === 0 && rowStep[axis] === 0
  );
  const fixedLast = volumeDimensions[fixedAxis] - 1;
  const read = (index) =>
    volumeArray[index[2] * columns * rows + index[1] * columns + index[0]];
  const values = [];
  let min = Infinity;
  let max = -Infinity;

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = [0, 1, 2].map(
        (axis) =>
          startIndex[axis] + column * columnStep[axis] + row * rowStep[axis]
      );
      let value = outsideValue;

      if (isIndexInsideVolume(volumeDimensions, ...index)) {
        const fixed = Math.min(fixedLast, Math.max(0, index[fixedAxis]));
        const lower = [...index];

        if (interpolationType === InterpolationType.NEAREST) {
          lower[fixedAxis] = Math.floor(fixed + 0.5 - 1e-6);
          value = read(lower);
        } else {
          const upper = [...index];

          lower[fixedAxis] = Math.floor(fixed);
          upper[fixedAxis] = Math.min(lower[fixedAxis] + 1, fixedLast);

          const weight = fixed - lower[fixedAxis];

          value =
            weight > 0
              ? read(lower) * (1 - weight) + read(upper) * weight
              : read(lower);
        }
      }

      values.push(value);

      if (value < min) {
        min = value;
      }

      if (value > max) {
        max = value;
      }
    }
  }

  return { values, range: { min, max } };
}
