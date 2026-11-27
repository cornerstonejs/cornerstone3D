import { describe, it, expect, afterEach, jest } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { InterpolationType } from '../src/enums';
import cache from '../src/cache/cache';
import VoxelManager from '../src/utilities/VoxelManager';
import * as sampleVolumeGridModule from '../src/utilities/sampleVolumeGrid';
import * as sampleVolumeSliceModule from '../src/utilities/sampleVolumeSlice';
import { PlanarSliceSampler } from '../src/RenderingEngine/Viewports/Planar/planarCpuSlice';
import { PlanarCpuSliceActor } from '../src/RenderingEngine/Viewports/Planar/planarCpuSliceActor';

/**
 * OHIF M99 (lane FX25): a planar pane of a volume sampled its first slice at
 * the mount, before any frame of the volume had arrived, and every value it
 * read was a zero (18 ms of the main thread for the ten TMTV panes in a
 * production build). The rule now, by the volume's own axes: a sampler of
 * the GPU draw path (`onlyArrivedFrames`) samples a plane only once a frame
 * that it reads has arrived. Nothing is read, allocated or uploaded for a
 * plane with no arrived frame, and its layer shows nothing. A plane across
 * the frames gathers only the rows of the frames that have arrived; their
 * rows are written when the frame arrives. The pictures and the value range
 * equal the general sampler's at every step of a streaming load, bit for bit.
 *
 * Counts, not times.
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

function frameValues(seed) {
  const [columns, rows] = DIMENSIONS;
  const values = new Int16Array(columns * rows);

  for (let index = 0; index < values.length; index++) {
    values[index] = ((index * 29 + seed * 113) % 211) + 5;
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
 * an acquisition orientation, of which only the frames in `arrived` are in
 * the cache.
 */
function createVolume(name, axes, arrived) {
  const imageIds = Array.from(
    { length: DIMENSIONS[2] },
    (_, k) => `arrived-frames-${name}:${k}`
  );
  const direction = axes.flat();
  const origin = [3, -2, 7];
  const imageData = vtkImageData.newInstance({
    spacing: SPACING,
    origin,
    direction,
  });

  imageData.setDimensions(DIMENSIONS);

  const own = imageIds.map((_, k) => frameValues(k + 1));

  imageIds.forEach((imageId, k) => {
    if (arrived.includes(k)) {
      putFrame(imageId, own[k]);
    }
  });

  const voxelManager = VoxelManager.createImageVolumeVoxelManager({
    dimensions: DIMENSIONS,
    imageIds,
    numberOfComponents: 1,
    dataType: 'Int16Array',
  });

  return {
    own,
    volume: {
      volumeId: `arrived-frames-${name}`,
      dimensions: DIMENSIONS,
      spacing: SPACING,
      direction,
      origin,
      imageData,
      imageIds,
      metadata: {},
      voxelManager,
    },
    deliver(k) {
      putFrame(imageIds[k], own[k]);
      voxelManager.invalidateSlice(k);
    },
  };
}

/** The same volume read only through getAtIJK: the general sampler's picture. */
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
 * acquisition plane on frame 2, the planes along i and along j (one row per
 * frame), an overlay plane between frames 2 and 3, and an oblique plane.
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

function createSampler(onlyArrivedFrames = true) {
  return new PlanarSliceSampler({
    keepFractions: true,
    outsideValue: OUTSIDE,
    onlyArrivedFrames,
  });
}

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
    interpolationType,
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

/** Spies on every way a sampler reads voxels into a slice. */
function spyOnReads() {
  return {
    straightCut: jest.spyOn(sampleVolumeGridModule, 'sampleStraightCutGrid'),
    general: jest.spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice'),
    gather: jest.spyOn(sampleVolumeSliceModule, 'gatherVolumeSlice'),
  };
}

/** The frames that the calls of `sampleStraightCutGrid` read, row by row. */
function framesRead(straightCut) {
  return straightCut.mock.calls.flatMap(([options]) =>
    Array.from(
      { length: options.height },
      (_, row) => options.startIndex[2] + row * options.rowStep[2]
    )
  );
}

describe.each(Object.entries(ORIENTATIONS))('A volume %s', (name, axes) => {
  describe.each(interpolations)(
    '%s',
    (interpolationName, interpolationType) => {
      const inputs = { interpolationType };

      it.each([
        'acquisitionPlane',
        'planeAlongI',
        'planeAlongJ',
        'overlayBetweenTwoFrames',
        'oblique',
      ])(
        'reads, allocates, writes and uploads nothing for the plane %s at the mount of a volume with no frame, and shows nothing of the layer',
        (cameraName) => {
          const { volume } = createVolume(
            `${name}-empty-${cameraName}-${interpolationName}`,
            axes,
            []
          );
          const sampler = createSampler();
          const reads = spyOnReads();
          const draw = new PlanarCpuSliceActor();
          const slice = sampler.sample(
            volume,
            cameras(volume)[cameraName],
            inputs
          );
          const statistics = sampler.getStatistics();

          draw.setSlice(slice);

          expect(slice).toBeUndefined();
          expect(statistics.emptySlices).toBe(1);
          expect(statistics.copiedBytes).toBe(0);
          expect(statistics.allocatedBytes).toBe(0);
          expect(statistics.frameSlices).toBe(0);
          expect(statistics.gatheredSlices).toBe(0);
          expect(statistics.generalSamples).toBe(0);
          expect(statistics.size).toBe(0);
          expect(reads.straightCut).not.toHaveBeenCalled();
          expect(reads.general).not.toHaveBeenCalled();
          expect(reads.gather).not.toHaveBeenCalled();
          expect(
            draw.mapper.getInputData().getPointData().getScalars().getData()
          ).toHaveLength(1);
          expect(draw.actor.getVisibility()).toBe(false);
        }
      );

      it.each(['planeAlongI', 'planeAlongJ'])(
        'gathers only the rows of the arrived frames of the plane %s of a half-loaded volume, and equals the general sampler',
        (cameraName) => {
          const arrived = [0, 2, 3];
          const { volume } = createVolume(
            `${name}-half-${cameraName}-${interpolationName}`,
            axes,
            arrived
          );
          const sampler = createSampler();
          const reads = spyOnReads();
          const slice = sampler.sample(
            volume,
            cameras(volume)[cameraName],
            inputs
          );
          const statistics = sampler.getStatistics();
          const rowBytes = slice.width * slice.pixelData.BYTES_PER_ELEMENT;

          expect(slice.height).toBe(DIMENSIONS[2]);
          expect(statistics.copiedBytes).toBe(arrived.length * rowBytes);
          expect(statistics.allocatedBytes).toBe(slice.pixelData.byteLength);
          expect(statistics.generalSamples).toBe(0);
          expect(reads.general).not.toHaveBeenCalled();
          expect(framesRead(reads.straightCut).sort()).toEqual(arrived);
          expectGeneralPicture(volume, slice, interpolationType);
        }
      );

      it('gathers the acquisition plane between two frames when one of them has arrived, as before', () => {
        const { volume } = createVolume(
          `${name}-between-${interpolationName}`,
          axes,
          [2]
        );
        const sampler = createSampler();
        const slice = sampler.sample(
          volume,
          cameras(volume).overlayBetweenTwoFrames,
          inputs
        );

        expect(slice).toBeDefined();
        expect(sampler.getStatistics().emptySlices).toBe(0);
        expectGeneralPicture(volume, slice, interpolationType);
      });

      it('shows nothing of the acquisition plane until its own frame arrives, then shows that frame with no copy', () => {
        const { volume, own, deliver } = createVolume(
          `${name}-own-${interpolationName}`,
          axes,
          [0, 1, 4, 5]
        );
        const sampler = createSampler();
        const camera = cameras(volume).acquisitionPlane;

        expect(sampler.sample(volume, camera, inputs)).toBeUndefined();

        deliver(3);
        sampler.invalidateFrames();

        expect(sampler.sample(volume, camera, inputs)).toBeUndefined();

        deliver(2);
        sampler.invalidateFrames();

        const slice = sampler.sample(volume, camera, inputs);
        const statistics = sampler.getStatistics();

        expect(slice.pixelData).toBe(own[2]);
        expect(statistics.emptySlices).toBe(2);
        expect(statistics.allocatedBytes).toBe(0);
        expect(statistics.copiedBytes).toBe(0);
      });

      it.each(['acquisitionPlane', 'planeAlongI', 'planeAlongJ'])(
        'equals the general sampler at every step of a load that starts with no frame, for the plane %s, and ends with the picture of the loaded volume',
        (cameraName) => {
          const { volume, deliver } = createVolume(
            `${name}-stream-${cameraName}-${interpolationName}`,
            axes,
            []
          );
          const camera = cameras(volume)[cameraName];
          const sampler = createSampler();
          const everySampler = createSampler(false);
          const draw = new PlanarCpuSliceActor();
          let shown = 0;

          expect(sampler.sample(volume, camera, inputs)).toBeUndefined();

          [4, 0, 2, 5, 1, 3].forEach((k) => {
            deliver(k);
            sampler.invalidateFrames();
            everySampler.invalidateFrames();

            const slice = sampler.sample(volume, camera, inputs);
            const every = everySampler.sample(volume, camera, inputs);

            draw.setSlice(slice);

            if (!slice) {
              expect(Array.from(every.pixelData).every((v) => v === 0)).toBe(
                true
              );
              return;
            }

            shown++;
            expect(Array.from(slice.pixelData)).toEqual(
              Array.from(every.pixelData)
            );
            expect([slice.min, slice.max]).toEqual([every.min, every.max]);
            expectGeneralPicture(volume, slice, interpolationType);
          });

          const { volume: loaded } = createVolume(
            `${name}-loaded-${cameraName}-${interpolationName}`,
            axes,
            [0, 1, 2, 3, 4, 5]
          );
          const final = sampler.sample(volume, camera, inputs);
          const fresh = createSampler().sample(
            loaded,
            cameras(loaded)[cameraName],
            inputs
          );

          expect(shown).toBeGreaterThan(0);
          expect(Array.from(final.pixelData)).toEqual(
            Array.from(fresh.pixelData)
          );
          expect([final.min, final.max]).toEqual([fresh.min, fresh.max]);
        }
      );

      it('prefetches no neighbour plane none of whose frames has arrived', () => {
        const { volume } = createVolume(
          `${name}-prefetch-${interpolationName}`,
          axes,
          [2]
        );
        const sampler = createSampler();
        const camera = cameras(volume).acquisitionPlane;
        const neighbour = {
          ...camera,
          focalPoint: center(volume, [3, 2, 4]),
        };

        expect(sampler.sample(volume, camera, inputs)).toBeDefined();
        expect(sampler.prefetch(volume, neighbour, inputs)).toBe(false);
        expect(sampler.getStatistics().prefetched).toBe(0);
      });
    }
  );
});

describe('A sampler that samples every slice (the CPU backend)', () => {
  it('still samples a plane with no arrived frame, which reads as zeros, as before', () => {
    const { volume } = createVolume(
      'every-empty',
      ORIENTATIONS['acquired axially'],
      []
    );
    const sampler = createSampler(false);
    const slice = sampler.sample(volume, cameras(volume).planeAlongI, {
      interpolationType: InterpolationType.LINEAR,
    });

    expect(slice).toBeDefined();
    expect(Array.from(slice.pixelData).every((value) => value === 0)).toBe(
      true
    );
    expect(sampler.getStatistics().emptySlices).toBe(0);
  });
});
