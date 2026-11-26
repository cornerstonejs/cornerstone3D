import * as cornerstone3D from '../src/index';
import { describe, it, expect, afterEach } from '@jest/globals';
import {
  cleanUp,
  createCpuViewport,
  createLocalVolume,
  destroyViewport,
  mountVolume,
} from './utils/cpuPlanarViewport';

const { Enums } = cornerstone3D;
const { OrientationAxis } = Enums;

/** The oblique view of the tests: between the sagittal and the axial view. */
const OBLIQUE = {
  viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
  viewUp: [0, -1, 0],
};

/**
 * The view reference of a pane of a display set in an orientation at a
 * slice, as an application stores it: `getViewReference()` of a pane on
 * that slice.
 */
async function referenceOfSlice(displaySetId, orientation, sliceIndex) {
  const probe = createCpuViewport('probe');

  try {
    await mountVolume(probe, displaySetId, { orientation });
    await probe.setImageIdIndex(sliceIndex);

    return { reference: probe.getViewReference(), probe: snapshot(probe) };
  } finally {
    destroyViewport(probe);
  }
}

/** The slice index, the focal point and the normal that a pane shows. */
function snapshot(viewport) {
  const { focalPoint, viewPlaneNormal } = viewport
    .getResolvedView()
    .toICamera();

  return {
    sliceIndex: viewport.getSliceIndex(),
    numberOfSlices: viewport.getNumberOfSlices(),
    focalPoint: [...focalPoint],
    viewPlaneNormal: [...viewPlaneNormal],
  };
}

/**
 * Mounts a display set on a new pane with an `initialViewReference`, and
 * gives what the pane shows and the NEW_IMAGE events of the mount.
 */
async function mountAt(displaySetId, orientation, initialViewReference) {
  const viewport = createCpuViewport('mountedAtReference');

  try {
    const newImages = await mountVolume(viewport, displaySetId, {
      orientation,
      initialViewReference,
    });

    return { ...snapshot(viewport), newImages };
  } finally {
    destroyViewport(viewport);
  }
}

function expectPoint(actual, expected, precision = 4) {
  expected.forEach((value, axis) =>
    expect(actual[axis]).toBeCloseTo(value, precision)
  );
}

/**
 * Checks that a mount at the reference of each slice of a view starts on
 * that slice: one NEW_IMAGE, of that slice, and the focal point of the pane
 * the reference came from.
 */
async function expectEverySliceStarts(displaySetId, orientation, count) {
  for (let sliceIndex = 0; sliceIndex < count; sliceIndex++) {
    const { reference, probe } = await referenceOfSlice(
      displaySetId,
      orientation,
      sliceIndex
    );
    const mounted = await mountAt(displaySetId, orientation, reference);

    expect(probe.sliceIndex).toBe(sliceIndex);
    expect(mounted.newImages.map((detail) => detail.sliceIndex)).toEqual([
      sliceIndex,
    ]);
    expect(mounted.sliceIndex).toBe(sliceIndex);
    expectPoint(mounted.focalPoint, probe.focalPoint);
  }
}

describe('a planar mount at an initialViewReference of a view with more slices than the acquisition', () => {
  afterEach(cleanUp);

  it('starts on every slice of a sagittal view of a 64 x 48 x 20 volume', async () => {
    createLocalVolume('m91-sagittal', {
      dimensions: [64, 48, 20],
      spacing: [1, 1.5, 2],
    });

    await expectEverySliceStarts('m91-sagittal', OrientationAxis.SAGITTAL, 64);
  });

  it('starts on every slice of a coronal view of a 64 x 48 x 20 volume', async () => {
    createLocalVolume('m91-coronal', {
      dimensions: [64, 48, 20],
      spacing: [1, 1.5, 2],
    });

    await expectEverySliceStarts('m91-coronal', OrientationAxis.CORONAL, 48);
  });

  it('starts on every slice of an oblique view given as view vectors', async () => {
    createLocalVolume('m91-oblique', {
      dimensions: [64, 48, 20],
      spacing: [1, 1.5, 2],
    });

    const { probe } = await referenceOfSlice('m91-oblique', OBLIQUE, 0);

    expect(probe.numberOfSlices).toBeGreaterThan(20);
    await expectEverySliceStarts('m91-oblique', OBLIQUE, probe.numberOfSlices);
  });

  it('starts a CT of 512 x 512 x 262 on sagittal slices 100 and 300 and coronal slices 200 and 400 (OHIF M91)', async () => {
    createLocalVolume('m91-ct', {
      dimensions: [512, 512, 262],
      spacing: [0.976562, 0.976562, 1.25],
      origin: [-250, -250, -163.75],
    });

    for (const [orientation, sliceIndex] of [
      [OrientationAxis.SAGITTAL, 100],
      [OrientationAxis.SAGITTAL, 300],
      [OrientationAxis.CORONAL, 200],
      [OrientationAxis.CORONAL, 400],
    ]) {
      const { reference, probe } = await referenceOfSlice(
        'm91-ct',
        orientation,
        sliceIndex
      );
      const mounted = await mountAt('m91-ct', orientation, reference);

      expect(probe.numberOfSlices).toBe(512);
      expect(reference.sliceIndex).toBe(sliceIndex);
      expect([
        orientation,
        mounted.newImages.map((detail) => detail.sliceIndex),
      ]).toEqual([orientation, [sliceIndex]]);
      expect(mounted.sliceIndex).toBe(sliceIndex);
      expectPoint(mounted.focalPoint, probe.focalPoint);
    }
  });

  it('starts where setViewReference on the mounted pane goes, for each reference', async () => {
    createLocalVolume('m91-property', {
      dimensions: [64, 48, 20],
      spacing: [1, 1.5, 2],
    });
    createLocalVolume('m91-other', {
      dimensions: [32, 24, 10],
      spacing: [2, 3, 4],
      origin: [1, 2, 3],
    });

    const { volumeId } = cornerstone3D.cache.getVolume('m91-property');
    const sagittal = OrientationAxis.SAGITTAL;
    const references = {
      'a stored sagittal slice beyond the acquisition count': (
        await referenceOfSlice('m91-property', sagittal, 40)
      ).reference,
      'the last sagittal slice': (
        await referenceOfSlice('m91-property', sagittal, 63)
      ).reference,
      'a point beyond the acquisition count, with no slice index': {
        FrameOfReferenceUID: 'cpuPlanarFrame',
        cameraFocalPoint: [50, 20, 10],
        viewPlaneNormal: [1, 0, 0],
      },
      'a slice index with the volume and the normal, and no point': {
        FrameOfReferenceUID: 'cpuPlanarFrame',
        volumeId,
        viewPlaneNormal: [1, 0, 0],
        sliceIndex: 45,
      },
      'a slice index with the opposite normal, and no point': {
        FrameOfReferenceUID: 'cpuPlanarFrame',
        volumeId,
        viewPlaneNormal: [-1, 0, 0],
        sliceIndex: 45,
      },
      'a sagittal slice of another volume of the frame of reference': (
        await referenceOfSlice('m91-other', sagittal, 25)
      ).reference,
      'an image of the acquisition': {
        FrameOfReferenceUID: 'cpuPlanarFrame',
        referencedImageId:
          cornerstone3D.cache.getVolume('m91-property').imageIds[5],
      },
      'an axial slice, another orientation': (
        await referenceOfSlice('m91-property', OrientationAxis.AXIAL, 12)
      ).reference,
      'another frame of reference': {
        FrameOfReferenceUID: 'anotherFrame',
        cameraFocalPoint: [50, 20, 10],
        viewPlaneNormal: [1, 0, 0],
      },
    };

    for (const [name, reference] of Object.entries(references)) {
      const viewport = createCpuViewport('mountedThenSet');

      await mountVolume(viewport, 'm91-property', { orientation: sagittal });

      const viewable = viewport.isReferenceViewable(reference, {
        withNavigation: true,
      });

      if (viewable) {
        viewport.setViewReference(reference);
      }

      const expected = snapshot(viewport);

      destroyViewport(viewport);

      const mounted = await mountAt('m91-property', sagittal, reference);

      expect([name, mounted.sliceIndex]).toEqual([name, expected.sliceIndex]);
      expect([name, mounted.newImages.length]).toEqual([name, 1]);
      expect([name, mounted.newImages[0].sliceIndex]).toEqual([
        name,
        expected.sliceIndex,
      ]);
      expectPoint(mounted.focalPoint, expected.focalPoint);
      expectPoint(mounted.viewPlaneNormal, expected.viewPlaneNormal);
    }
  });
});
