import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { InterpolationType } from '../src/enums';
import sampleVolumeGrid from '../src/utilities/sampleVolumeGrid';
import VoxelManager from '../src/utilities/VoxelManager';
import cache from '../src/cache/cache';

/**
 * OHIF M94 (lane FX23): the sampled slice of a streaming volume read each
 * voxel of a frame without a typed array (a frame that has not arrived, an
 * image of another size) through `getAtIJK`, which found the image of the
 * frame again for each voxel: a TMTV load spent 0.4 s of the main thread in
 * that lookup alone. The sampler now finds what holds a frame once for the
 * grid (`_getSliceReader`), and reads a frame that has no image as zeros. The
 * values are those of the read through `getAtIJK`, bit for bit.
 */

const width = 12;
const height = 10;
const depth = 9;
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
    const value = ((index * 37 + seed * 101) % 503) - 251;

    values[index] = ArrayType === Float32Array ? value / 7 : value;
  }

  return values;
}

function putImage(imageId, w, h, numberOfComponents, ArrayType, seed) {
  const scalarData = valuesOf(seed, w * h * numberOfComponents, ArrayType);

  cache.putImageSync(imageId, {
    imageId,
    width: w,
    height: h,
    voxelManager: VoxelManager.createImageVoxelManager({
      width: w,
      height: h,
      scalarData,
      numberOfComponents,
    }),
    getPixelData: () => scalarData,
    sizeInBytes: scalarData.byteLength,
  });
  cachedImageIds.push(imageId);
}

/**
 * A volume of one cached image per frame: `frames` gives each frame as
 * 'full' (an image of the frame size), 'half' (an image of half the size, as
 * a sub-resolution decode gives) or 'none' (no image yet, as while it
 * streams).
 */
function createImageVolume(name, frames, numberOfComponents, ArrayType) {
  const imageIds = frames.map((_, k) => `slice-reader-${name}:${k}`);

  frames.forEach((kind, k) => {
    if (kind === 'full') {
      putImage(imageIds[k], width, height, numberOfComponents, ArrayType, k);
    } else if (kind === 'half') {
      putImage(
        imageIds[k],
        width / 2,
        height / 2,
        numberOfComponents,
        ArrayType,
        k
      );
    }
  });

  return {
    dimensions: [width, height, depth],
    voxelManager: VoxelManager.createImageVolumeVoxelManager({
      dimensions: [width, height, depth],
      imageIds,
      numberOfComponents,
    }),
  };
}

/** A volume of one array of every voxel, with no image per frame. */
function createScalarVolume(ArrayType) {
  const scalarData = valuesOf(3, width * height * depth, ArrayType);

  return {
    dimensions: [width, height, depth],
    voxelManager: VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [width, height, depth],
      scalarData,
      numberOfComponents: 1,
    }),
  };
}

/**
 * The same volume read one voxel at a time through `getAtIJK`, with no slice
 * view and no slice reader: the read that the sampler made before.
 */
function readThroughGetAtIJK(volume) {
  return {
    dimensions: volume.dimensions,
    voxelManager: {
      getAtIJK: (i, j, k) => volume.voxelManager.getAtIJK(i, j, k),
    },
  };
}

const grids = {
  axialOnFrame: {
    startIndex: [0, 0, 4],
    columnStep: [1, 0, 0],
    rowStep: [0, 1, 0],
    width,
    height,
  },
  axialBetweenFrames: {
    startIndex: [0.25, 0, 4.4],
    columnStep: [0.75, 0, 0],
    rowStep: [0, 0.8, 0],
    width: 15,
    height: 12,
  },
  sagittal: {
    startIndex: [5, -0.4, -0.4],
    columnStep: [0, 0.7, 0],
    rowStep: [0, 0, 0.6],
    width: 16,
    height: 16,
  },
  coronal: {
    startIndex: [-0.4, 6.2, 0],
    columnStep: [0.8, 0, 0],
    rowStep: [0, 0, 0.55],
    width: 16,
    height: 16,
  },
  oblique: {
    startIndex: [-1, 0.5, 0.2],
    columnStep: [0.7, 0.2, 0.35],
    rowStep: [0.1, 0.65, 0.3],
    width: 18,
    height: 15,
  },
};

const interpolations = [
  ['nearest', InterpolationType.NEAREST],
  ['linear', InterpolationType.LINEAR],
];

function sample(volume, grid, interpolationType, numberOfComponents = 1) {
  const pixelData = new Float64Array(
    grid.width * grid.height * numberOfComponents
  );
  const range = sampleVolumeGrid({
    volume,
    pixelData,
    numberOfComponents,
    interpolationType,
    outsideValue: -5000,
    ...grid,
  });

  return { range, pixelData: Array.from(pixelData) };
}

const streamingFrames = [
  'full',
  'none',
  'full',
  'half',
  'none',
  'full',
  'half',
  'none',
  'full',
];

const volumes = [
  [
    'an image volume of full frames',
    () =>
      createImageVolume('full', new Array(depth).fill('full'), 1, Int16Array),
  ],
  [
    'a streaming image volume with empty and reduced frames',
    () => createImageVolume('streaming', streamingFrames, 1, Int16Array),
  ],
  [
    'a streaming float volume with empty and reduced frames',
    () => createImageVolume('float', streamingFrames, 1, Float32Array),
  ],
  ['a volume without an image per frame', () => createScalarVolume(Int16Array)],
];

describe('sampleVolumeGrid reads each frame through one lookup', () => {
  describe.each(volumes)('%s', (_, createVolume) => {
    describe.each(Object.entries(grids))('the %s grid', (_, grid) => {
      it.each(interpolations)(
        'gives the values of a read through getAtIJK, %s',
        (_, interpolationType) => {
          const volume = createVolume();

          expect(sample(volume, grid, interpolationType)).toEqual(
            sample(readThroughGetAtIJK(volume), grid, interpolationType)
          );
        }
      );
    });
  });

  describe.each(Object.entries(grids))(
    'an RGB streaming volume, the %s grid',
    (_, grid) => {
      it.each(interpolations)(
        'gives the values of a read through getAtIJK, %s',
        (_, interpolationType) => {
          const volume = createImageVolume(
            'rgb',
            streamingFrames,
            3,
            Uint8Array
          );

          expect(sample(volume, grid, interpolationType, 3)).toEqual(
            sample(readThroughGetAtIJK(volume), grid, interpolationType, 3)
          );
        }
      );
    }
  );

  it.each(interpolations)(
    'looks up each frame a constant number of times, not once for each voxel, %s',
    (_, interpolationType) => {
      const volume = createImageVolume('cost', streamingFrames, 1, Int16Array);
      const { voxelManager } = volume;
      const getAtIJK = jest.spyOn(voxelManager, 'getAtIJK');
      const getSliceReader = jest.spyOn(voxelManager, '_getSliceReader');
      const getSliceView = jest.spyOn(voxelManager, '_getSliceView');
      const getImage = jest.spyOn(cache, 'getImage');
      const getImageGeneration = jest.spyOn(cache, 'getImageGeneration');
      const grid = {
        startIndex: [5, -0.4, -0.4],
        columnStep: [0, 0.05, 0],
        rowStep: [0, 0, 0.05],
        width: 200,
        height: 190,
      };

      sample(volume, grid, interpolationType);

      const lookups =
        getSliceReader.mock.calls.length +
        getSliceView.mock.calls.length +
        getImage.mock.calls.length +
        getImageGeneration.mock.calls.length;

      expect(getAtIJK).not.toHaveBeenCalled();
      expect(lookups).toBeLessThanOrEqual(6 * depth);
    }
  );
});
