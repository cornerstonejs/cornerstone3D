import { describe, it, expect, afterEach, jest } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BlendModes, InterpolationType } from '../src/enums';
import cache from '../src/cache/cache';
import VoxelManager from '../src/utilities/VoxelManager';
import * as sampleVolumeSliceModule from '../src/utilities/sampleVolumeSlice';
import { PlanarSliceSampler } from '../src/RenderingEngine/Viewports/Planar/planarCpuSlice';
import { PlanarCpuSliceActor } from '../src/RenderingEngine/Viewports/Planar/planarCpuSliceActor';
import {
  getPendingImageTextureRows,
  uploadImageTextureRows,
} from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLImageMapper';

/**
 * Row 341 (lane FX24), the rule of the planes of a volume's grid, by the
 * volume's own axes (the frame axis k and the two others, i and j), whatever
 * the orientation of the patient:
 *
 * - the acquisition plane (the view normal along k, on a frame) is the frame
 *   of the volume as the volume holds it: no sample, no copy, the draw step
 *   shows that array;
 * - the two other planes of the grid are gathered from the arrays of the
 *   frames, one row per frame, and a frame that arrives while the volume
 *   loads changes its one row only: one row written, one row uploaded;
 * - a plane between two frames or two columns (an overlay on another
 *   volume's plane) is the mix of the two gathered planes, not the general
 *   sampler;
 * - only an oblique plane, or a slab, goes through the general sampler.
 *
 * Counts, not times; and at every step of a streaming load and at its end the
 * pictures equal those of the general sampler, bit for bit.
 */

const DIMENSIONS = [7, 5, 6];
const SPACING = [0.8, 1.1, 2.5];
const OUTSIDE = -3000;
const cachedImageIds = [];

afterEach(() => {
  cachedImageIds.splice(0).forEach((imageId) => {
    if (cache.getImage(imageId)) {
      cache.removeImageLoadObject(imageId);
    }
  });
  jest.restoreAllMocks();
});

const ORIENTATIONS = {
  'acquired axially': [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  'acquired sagittally': [
    [0, 1, 0],
    [0, 0, -1],
    [-1, 0, 0],
  ],
  'acquired coronally': [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ],
  'with the frame axis reversed': [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
  ],
};

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function negate(a) {
  return a.map((value) => -value);
}

function frameValues(seed, ArrayType) {
  const [columns, rows] = DIMENSIONS;
  const values = new ArrayType(columns * rows);

  for (let index = 0; index < values.length; index++) {
    const value = ((index * 29 + seed * 113) % 211) - 90;

    values[index] = ArrayType === Float32Array ? value / 3 : value;
  }

  return values;
}

function putFrame(imageId, scalarData) {
  const [columns, rows] = DIMENSIONS;

  if (cache.getImage(imageId)) {
    cache.removeImageLoadObject(imageId);
  }

  cache.putImageSync(imageId, {
    imageId,
    width: columns,
    height: rows,
    voxelManager: VoxelManager.createImageVoxelManager({
      width: columns,
      height: rows,
      scalarData,
      numberOfComponents: 1,
    }),
    getPixelData: () => scalarData,
    sizeInBytes: scalarData.byteLength,
  });
  cachedImageIds.push(imageId);
}

/**
 * A streaming image volume of one cached image per frame, with the axes of
 * an acquisition orientation; `arrived` lists the frames that hold their own
 * data at the start.
 */
function createVolume(name, axes, ArrayType = Int16Array, arrived = null) {
  const frames = DIMENSIONS[2];
  const imageIds = Array.from(
    { length: frames },
    (_, k) => `grid-planes-${name}:${k}`
  );
  const direction = axes.flat();
  const origin = [3, -2, 7];
  const imageData = vtkImageData.newInstance({
    spacing: SPACING,
    origin,
    direction,
  });

  imageData.setDimensions(DIMENSIONS);

  const own = imageIds.map((_, k) => frameValues(k + 1, ArrayType));

  imageIds.forEach((imageId, k) => {
    if (!arrived || arrived.includes(k)) {
      putFrame(imageId, own[k]);
    }
  });

  const voxelManager = VoxelManager.createImageVolumeVoxelManager({
    dimensions: DIMENSIONS,
    imageIds,
    numberOfComponents: 1,
    dataType: ArrayType.name,
  });

  return {
    own,
    imageIds,
    volume: {
      volumeId: `grid-planes-${name}`,
      dimensions: DIMENSIONS,
      spacing: SPACING,
      direction,
      origin,
      imageData,
      imageIds,
      metadata: {},
      voxelManager,
    },
    deliver(k, scalarData = own[k]) {
      putFrame(imageIds[k], scalarData);
      voxelManager.invalidateSlice(k);
    },
  };
}

/**
 * The same volume read only through getAtIJK, so that sampleVolumeSlice runs
 * its general loop: the picture of the general sampler.
 */
function generalTwin(volume) {
  return {
    ...volume,
    voxelManager: {
      numberOfComponents: 1,
      getConstructor: () => volume.voxelManager.getConstructor(),
      getAtIJK: (i, j, k) => volume.voxelManager.getAtIJK(i, j, k),
    },
  };
}

function center(volume, index) {
  return volume.imageData.indexToWorld(index);
}

/**
 * The cameras of the planes of the grid of a volume, by its own axes: the
 * acquisition plane seen from the side whose rows follow j (the frame as it
 * is held) and from the other side, the planes along i and along j, an
 * overlay plane between two frames, a plane between two columns, and an
 * oblique plane.
 */
function cameras(volume) {
  const [i, j, k] = [0, 1, 2].map((axis) =>
    volume.direction.slice(axis * 3, axis * 3 + 3)
  );
  const acquisitionNormal = negate(cross(i, j));

  return {
    acquisitionPlane: {
      focalPoint: center(volume, [3, 2, 2]),
      viewPlaneNormal: acquisitionNormal,
      viewUp: negate(j),
    },
    acquisitionPlaneFromTheBack: {
      focalPoint: center(volume, [3, 2, 4]),
      viewPlaneNormal: negate(acquisitionNormal),
      viewUp: negate(j),
    },
    planeAlongI: {
      focalPoint: center(volume, [4, 2, 3]),
      viewPlaneNormal: i,
      viewUp: k,
    },
    planeAlongJ: {
      focalPoint: center(volume, [3, 1, 3]),
      viewPlaneNormal: j,
      viewUp: k,
    },
    overlayBetweenTwoFrames: {
      focalPoint: center(volume, [3, 2, 2.35]),
      viewPlaneNormal: acquisitionNormal,
      viewUp: negate(j),
    },
    betweenTwoColumns: {
      focalPoint: center(volume, [2.6, 2, 3]),
      viewPlaneNormal: i,
      viewUp: k,
    },
    oblique: {
      focalPoint: center(volume, [3, 2, 3]),
      viewPlaneNormal: [
        0.3 * i[0] + 0.2 * j[0] + 0.93 * k[0],
        0.3 * i[1] + 0.2 * j[1] + 0.93 * k[1],
        0.3 * i[2] + 0.2 * j[2] + 0.93 * k[2],
      ],
      viewUp: j,
    },
  };
}

const interpolations = [
  ['nearest', InterpolationType.NEAREST],
  ['linear', InterpolationType.LINEAR],
];

function createSampler() {
  return new PlanarSliceSampler({ keepFractions: true, outsideValue: OUTSIDE });
}

/** What the general sampler gives for the geometry of a sampled slice. */
function generalPicture(volume, slice, interpolationType) {
  return sampleVolumeSliceModule.sampleVolumeSlice({
    volume: generalTwin(volume),
    geometry: {
      origin: slice.origin,
      xDirection: slice.xDirection,
      yDirection: slice.yDirection,
      zDirection: slice.zDirection,
      spacing: slice.spacing,
      width: slice.width,
      height: slice.height,
      sliceIndex: slice.sampledFor.sliceIndex,
    },
    interpolationType:
      interpolationType === InterpolationType.NEAREST
        ? InterpolationType.NEAREST
        : InterpolationType.LINEAR,
    outsideValue: OUTSIDE,
    keepFractions: true,
  });
}

function expectGeneralPicture(volume, slice, interpolationType) {
  const general = generalPicture(volume, slice, interpolationType);

  expect(slice.pixelData.constructor).toBe(general.pixelData.constructor);
  expect(Array.from(slice.pixelData)).toEqual(Array.from(general.pixelData));
  expect([slice.min, slice.max]).toEqual([general.min, general.max]);
}

describe.each(Object.entries(ORIENTATIONS))('A volume %s', (name, axes) => {
  describe.each(interpolations)(
    '%s',
    (interpolationName, interpolationType) => {
      const inputs = { interpolationType };

      it('shows the frame of the acquisition plane as the volume holds it: no sample, no copy', () => {
        const { volume, own } = createVolume(
          `${name}-acq-${interpolationName}`,
          axes
        );
        const sampler = createSampler();
        const general = jest.spyOn(
          sampleVolumeSliceModule,
          'sampleVolumeSlice'
        );
        const slice = sampler.sample(
          volume,
          cameras(volume).acquisitionPlane,
          inputs
        );
        const statistics = sampler.getStatistics();

        expect(slice.pixelData).toBe(own[2]);
        expect(slice.frameOfVolume).toBe(true);
        expect(statistics.frameSlices).toBe(1);
        expect(statistics.generalSamples).toBe(0);
        expect(statistics.copiedBytes).toBe(0);
        expect(general).not.toHaveBeenCalled();
        expectGeneralPicture(volume, slice, interpolationType);
      });

      it('gathers the acquisition plane seen from its back with one copy, and no general sample', () => {
        const { volume } = createVolume(
          `${name}-back-${interpolationName}`,
          axes
        );
        const sampler = createSampler();
        const slice = sampler.sample(
          volume,
          cameras(volume).acquisitionPlaneFromTheBack,
          inputs
        );
        const statistics = sampler.getStatistics();

        expect(slice.frameOfVolume).toBeUndefined();
        expect(statistics.gatheredSlices).toBe(1);
        expect(statistics.generalSamples).toBe(0);
        expect(statistics.copiedBytes).toBe(slice.pixelData.byteLength);
        expectGeneralPicture(volume, slice, interpolationType);
      });

      it.each([
        ['along i', 'planeAlongI'],
        ['along j', 'planeAlongJ'],
        ['between two columns', 'betweenTwoColumns'],
        ['of an overlay between two frames', 'overlayBetweenTwoFrames'],
      ])('gathers the plane %s with no general sample', (_, cameraName) => {
        const { volume } = createVolume(
          `${name}-${cameraName}-${interpolationName}`,
          axes
        );
        const sampler = createSampler();
        const general = jest.spyOn(
          sampleVolumeSliceModule,
          'sampleVolumeSlice'
        );
        const slice = sampler.sample(
          volume,
          cameras(volume)[cameraName],
          inputs
        );

        expect(sampler.getStatistics().generalSamples).toBe(0);
        expect(general).not.toHaveBeenCalled();
        expectGeneralPicture(volume, slice, interpolationType);
      });

      it.each([
        ['along i', 'planeAlongI'],
        ['along j', 'planeAlongJ'],
        ['between two columns', 'betweenTwoColumns'],
      ])(
        'writes and uploads one row of the plane %s per frame that arrives, a copy first and then its own data, and equals the general sampler at every step',
        (_, cameraName) => {
          const frames = DIMENSIONS[2];
          const { volume, own, deliver } = createVolume(
            `${name}-stream-${cameraName}-${interpolationName}`,
            axes,
            Int16Array,
            [0]
          );
          const camera = cameras(volume)[cameraName];
          const sampler = createSampler();
          const draw = new PlanarCpuSliceActor();
          const first = sampler.sample(volume, camera, inputs);

          draw.setSlice(first);
          expectGeneralPicture(volume, first, interpolationType);

          const order = [3, 5, 1, 4, 2];
          const steps = [
            ...order.map((k) => [k, own[k - 1]]),
            ...order.map((k) => [k, own[k]]),
          ];

          steps.forEach(([k, scalarData]) => {
            const before = sampler.getStatistics();

            deliver(k, scalarData);
            sampler.invalidateFrames();

            const slice = sampler.sample(volume, camera, inputs);
            const after = sampler.getStatistics();

            expect(slice.pixelData).toBe(first.pixelData);
            expect(slice.updatedRows).toHaveLength(1);
            expect(after.gatheredRows - before.gatheredRows).toBe(1);
            expect(after.copiedBytes - before.copiedBytes).toBe(
              slice.width * slice.pixelData.BYTES_PER_ELEMENT
            );
            expect(after.generalSamples).toBe(0);
            expectGeneralPicture(volume, slice, interpolationType);

            draw.setSlice(slice);

            expect(getPendingImageTextureRows(draw.mapper)).toEqual(
              expect.arrayContaining(slice.updatedRows)
            );
            expect(
              draw.mapper.getInputData().getPointData().getScalars().getData()
            ).toBe(slice.pixelData);
          });

          expect(sampler.getStatistics().gatheredSlices).toBe(1);
          expect(sampler.getStatistics().gatheredRows).toBe(2 * order.length);
          expect(getPendingImageTextureRows(draw.mapper)).toHaveLength(
            order.length
          );
          expect(first.height).toBe(frames);
        }
      );

      it('takes the frame of the acquisition plane as it arrives, a copy and then its own data, with no copy', () => {
        const { volume, own, deliver } = createVolume(
          `${name}-stream-acq-${interpolationName}`,
          axes,
          Int16Array,
          [0, 1]
        );
        const camera = cameras(volume).acquisitionPlane;
        const sampler = createSampler();
        const empty = sampler.sample(volume, camera, inputs);
        const copiedBeforeFrame = sampler.getStatistics().copiedBytes;

        expect(empty.frameOfVolume).toBeUndefined();
        expect(copiedBeforeFrame).toBe(empty.pixelData.byteLength);

        [own[1], own[2]].forEach((scalarData) => {
          deliver(2, scalarData);
          sampler.invalidateFrames();

          const slice = sampler.sample(volume, camera, inputs);

          expect(slice.pixelData).toBe(scalarData);
          expectGeneralPicture(volume, slice, interpolationType);
        });

        expect(sampler.getStatistics().copiedBytes).toBe(copiedBeforeFrame);
        expect(sampler.getStatistics().generalSamples).toBe(0);
      });

      it('samples an oblique plane with the general sampler', () => {
        const { volume } = createVolume(
          `${name}-oblique-${interpolationName}`,
          axes
        );
        const sampler = createSampler();
        const general = jest.spyOn(
          sampleVolumeSliceModule,
          'sampleVolumeSlice'
        );

        sampler.sample(volume, cameras(volume).oblique, inputs);

        expect(general).toHaveBeenCalledTimes(1);
        expect(sampler.getStatistics().generalSamples).toBe(1);
      });

      it('keeps the path of a slab', () => {
        const { volume } = createVolume(
          `${name}-slab-${interpolationName}`,
          axes
        );
        const sampler = createSampler();
        const general = jest.spyOn(
          sampleVolumeSliceModule,
          'sampleVolumeSlice'
        );

        sampler.sample(volume, cameras(volume).acquisitionPlane, {
          ...inputs,
          slab: { thickness: 6, blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
        });

        expect(general).toHaveBeenCalledTimes(1);
        expect(general.mock.calls[0][0].slab).toBeDefined();
        expect(sampler.getStatistics().frameSlices).toBe(0);
      });
    }
  );
});

describe('The draw step of a sampled slice', () => {
  it('shows the frame of the acquisition plane with no copy, and uploads it whole', () => {
    const { volume, own } = createVolume(
      'draw-frame',
      ORIENTATIONS['acquired axially']
    );
    const slice = createSampler().sample(
      volume,
      cameras(volume).acquisitionPlane,
      { interpolationType: InterpolationType.LINEAR }
    );
    const draw = new PlanarCpuSliceActor();

    draw.setSlice(slice);

    const scalars = draw.mapper.getInputData().getPointData().getScalars();

    expect(scalars.getData()).toBe(own[2]);
    expect(scalars.getRange(0)).toEqual([slice.min, slice.max]);
    expect(getPendingImageTextureRows(draw.mapper)).toEqual([]);
  });
});

describe('The upload of some rows of a 2D texture', () => {
  function fakeContext() {
    return {
      FLOAT: 0x1406,
      HALF_FLOAT: 0x140b,
      SHORT: 0x1402,
      UNSIGNED_SHORT: 0x1403,
      UNSIGNED_BYTE: 0x1401,
      TEXTURE_2D: 0x0de1,
      UNPACK_FLIP_Y_WEBGL: 0x9240,
      UNPACK_ALIGNMENT: 0x0cf5,
      pixelStorei: jest.fn(),
      texSubImage2D: jest.fn(),
    };
  }

  function fakeTexture(context, openGLDataType, width = 4, height = 8) {
    const references = { openGLDataType, format: 0x1903 };

    return {
      getHandle: () => ({}),
      getWidth: () => width,
      getHeight: () => height,
      getComponents: () => 1,
      getReferenceByName: (key) => references[key],
      activate: jest.fn(),
      deactivate: jest.fn(),
    };
  }

  it('uploads each run of adjacent rows with one call, converting only those rows for a float texture', () => {
    const context = fakeContext();
    const texture = fakeTexture(context, context.FLOAT);
    const values = Int16Array.from({ length: 32 }, (_, index) => index);
    const uploaded = uploadImageTextureRows(
      context,
      texture,
      values,
      4,
      1,
      [2, 3, 6]
    );

    expect(uploaded).toBe(3);
    expect(context.texSubImage2D).toHaveBeenCalledTimes(2);

    const [first, second] = context.texSubImage2D.mock.calls;

    expect(first.slice(0, 6)).toEqual([context.TEXTURE_2D, 0, 0, 2, 4, 2]);
    expect(first[8]).toBeInstanceOf(Float32Array);
    expect(Array.from(first[8])).toEqual(Array.from(values.subarray(8, 16)));
    expect(second.slice(0, 6)).toEqual([context.TEXTURE_2D, 0, 0, 6, 4, 1]);
    expect(Array.from(second[8])).toEqual(Array.from(values.subarray(24, 28)));
  });

  it('uploads the rows of a norm16 texture as they are held', () => {
    const context = fakeContext();
    const texture = fakeTexture(context, context.SHORT);
    const values = new Int16Array(32);

    uploadImageTextureRows(context, texture, values, 4, 1, [5]);

    expect(context.texSubImage2D.mock.calls[0][8].buffer).toBe(values.buffer);
  });

  it('asks for a whole upload of a half float texture or of an image of another size', () => {
    const context = fakeContext();
    const values = new Int16Array(32);

    expect(
      uploadImageTextureRows(
        context,
        fakeTexture(context, context.HALF_FLOAT),
        values,
        4,
        1,
        [1]
      )
    ).toBe(-1);
    expect(
      uploadImageTextureRows(
        context,
        fakeTexture(context, context.FLOAT, 4, 6),
        values,
        4,
        1,
        [1]
      )
    ).toBe(-1);
    expect(context.texSubImage2D).not.toHaveBeenCalled();
  });
});
