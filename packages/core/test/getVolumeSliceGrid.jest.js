import * as cornerstone3D from '../src/index';
import { describe, it, expect, afterEach } from '@jest/globals';
import {
  cleanUp,
  createCpuViewport,
  createLocalVolume,
  destroyViewport,
  mountVolume,
} from './utils/cpuPlanarViewport';

const { Enums, utilities, cache } = cornerstone3D;
const { OrientationAxis } = Enums;

const ORIENTATIONS = {
  axial: OrientationAxis.AXIAL,
  sagittal: OrientationAxis.SAGITTAL,
  coronal: OrientationAxis.CORONAL,
  oblique: {
    viewPlaneNormal: [0.6, 0, 0.8],
    viewUp: [0, -1, 0],
  },
};

/**
 * Two volumes of one frame of reference on different grids: a fine one and
 * a coarse one that is shifted against it, as a CT and a PET of one study.
 */
function createVolumes() {
  createLocalVolume('grid-fine', {
    dimensions: [64, 48, 40],
    spacing: [1, 1, 1.25],
  });
  createLocalVolume('grid-coarse', {
    dimensions: [24, 20, 12],
    spacing: [2.5, 3, 4],
    origin: [-20, -15, -12],
  });
}

function expectPoint(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, axis) =>
    expect(actual[axis]).toBeCloseTo(value, precision)
  );
}

/** The position of a point along a view plane normal. */
function depth(point, normal) {
  return point[0] * normal[0] + point[1] * normal[1] + point[2] * normal[2];
}

/** What a viewport reports of its view after a mount with no start. */
async function mountedView(volumeId, orientation) {
  const viewport = createCpuViewport(`grid-${volumeId}`);

  try {
    const newImages = await mountVolume(viewport, volumeId, { orientation });
    const camera = viewport.getResolvedView().toICamera();

    return {
      viewport,
      newImages,
      numberOfSlices: viewport.getNumberOfSlices(),
      sliceIndex: viewport.getSliceIndex(),
      reference: viewport.getViewReference(),
      focalPoint: [...camera.focalPoint],
      viewPlaneNormal: [...camera.viewPlaneNormal],
      viewUp: [...camera.viewUp],
    };
  } catch (error) {
    destroyViewport(viewport);
    throw error;
  }
}

describe('utilities.getVolumeSliceGrid', () => {
  afterEach(cleanUp);

  for (const [name, orientation] of Object.entries(ORIENTATIONS)) {
    it(`gives the ${name} slice grid that a mounted viewport shows, for two volumes of different grids`, async () => {
      createVolumes();

      for (const volumeId of ['grid-fine', 'grid-coarse']) {
        const grid = utilities.getVolumeSliceGrid({ volumeId, orientation });
        const fromImages = utilities.getVolumeSliceGrid({
          imageIds: cache.getVolume(volumeId).imageIds,
          orientation,
        });
        const mounted = await mountedView(volumeId, orientation);

        try {
          expect(grid.numberOfSlices).toBe(mounted.numberOfSlices);
          expect(grid.defaultSliceIndex).toBe(mounted.sliceIndex);
          expect(mounted.reference.sliceIndex).toBe(grid.defaultSliceIndex);
          expect(mounted.newImages.map((detail) => detail.sliceIndex)).toEqual([
            grid.defaultSliceIndex,
          ]);
          expectPoint(grid.defaultSliceWorldPoint, mounted.focalPoint);
          expectPoint(
            grid.defaultSliceWorldPoint,
            mounted.reference.cameraFocalPoint
          );
          expectPoint(grid.viewPlaneNormal, mounted.viewPlaneNormal);
          expectPoint(grid.viewUp, mounted.viewUp);
          expect(grid.frameOfReferenceUID).toBe(
            mounted.reference.FrameOfReferenceUID
          );

          expect(fromImages.numberOfSlices).toBe(grid.numberOfSlices);
          expect(fromImages.step).toBeCloseTo(grid.step, 6);
          expect(fromImages.defaultSliceIndex).toBe(grid.defaultSliceIndex);
          expectPoint(
            fromImages.defaultSliceWorldPoint,
            grid.defaultSliceWorldPoint
          );
          expect(fromImages.frameOfReferenceUID).toBe(grid.frameOfReferenceUID);

          for (const sliceIndex of [0, 3, grid.numberOfSlices - 1]) {
            await mounted.viewport.setImageIdIndex(sliceIndex);

            const { focalPoint } = mounted.viewport
              .getResolvedView()
              .toICamera();

            expect(mounted.viewport.getSliceIndex()).toBe(sliceIndex);
            expectPoint(grid.getSliceWorldPoint(sliceIndex), focalPoint);
            expect(grid.getSliceIndex(focalPoint)).toBe(sliceIndex);
          }
        } finally {
          destroyViewport(mounted.viewport);
        }
      }
    });

    it(`starts the ${name} mount of the coarse volume at the default point of the fine volume, on the coarse slice nearest to it`, async () => {
      createVolumes();

      const fine = utilities.getVolumeSliceGrid({
        volumeId: 'grid-fine',
        orientation,
      });
      const coarse = utilities.getVolumeSliceGrid({
        volumeId: 'grid-coarse',
        orientation,
      });
      const nearest = coarse.getSliceIndex(fine.defaultSliceWorldPoint);
      const viewport = createCpuViewport('grid-groupStart');

      try {
        const newImages = await mountVolume(viewport, 'grid-coarse', {
          orientation,
          initialViewReference: fine.getViewReference(),
        });

        expect(nearest).not.toBe(coarse.defaultSliceIndex);
        expect(newImages.map((detail) => detail.sliceIndex)).toEqual([nearest]);
        expect(viewport.getSliceIndex()).toBe(nearest);
        expect(
          depth(
            viewport.getResolvedView().toICamera().focalPoint,
            coarse.viewPlaneNormal
          )
        ).toBeCloseTo(
          depth(fine.defaultSliceWorldPoint, coarse.viewPlaneNormal),
          4
        );
      } finally {
        destroyViewport(viewport);
      }
    });
  }

  it('starts a mount on slice k from the view reference of slice k', async () => {
    createVolumes();

    const grid = utilities.getVolumeSliceGrid({
      volumeId: 'grid-fine',
      orientation: OrientationAxis.SAGITTAL,
    });

    for (const sliceIndex of [0, 17, 50, grid.numberOfSlices - 1]) {
      const viewport = createCpuViewport('grid-sliceStart');

      try {
        const newImages = await mountVolume(viewport, 'grid-fine', {
          orientation: OrientationAxis.SAGITTAL,
          initialViewReference: grid.getViewReference(sliceIndex),
        });

        expect(newImages.map((detail) => detail.sliceIndex)).toEqual([
          sliceIndex,
        ]);
        expect(viewport.getSliceIndex()).toBe(sliceIndex);
      } finally {
        destroyViewport(viewport);
      }
    }
  });

  it('refuses a reformat name and a volume that is not in the cache', () => {
    createVolumes();

    expect(() =>
      utilities.getVolumeSliceGrid({
        volumeId: 'grid-fine',
        orientation: OrientationAxis.AXIAL_REFORMAT,
      })
    ).toThrow(/is not taken/);
    expect(() =>
      utilities.getVolumeSliceGrid({ volumeId: 'not-in-the-cache' })
    ).toThrow(/is not in the cache/);
  });
});
