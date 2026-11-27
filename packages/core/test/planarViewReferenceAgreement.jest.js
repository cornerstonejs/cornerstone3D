import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { describe, it, expect, afterEach } from '@jest/globals';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';
import {
  cleanUp,
  createCpuViewport,
  createLocalVolume,
  destroyViewport,
  mountVolume,
} from './utils/cpuPlanarViewport';

const { setRenderBackend, imageLoader, metaData, init, cache, utilities } =
  cornerstone3D;

const FRAME = 'agreement-frame';
const DISPLAY_SET_ID = 'agreement';
const START = 2;

/** Gives an element its size, as the browser would after layout. */
function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/** Image ids of six 16 by 16 axial images, one per millimetre. */
function createImageIds(name = 'agreement') {
  return [0, 1, 2, 3, 4, 5].map(
    (sliceIndex) =>
      `fakeImageLoader:${encodeURIComponent(
        JSON.stringify({
          loader: 'fakeImageLoader',
          name,
          rows: 16,
          columns: 16,
          barStart: 2,
          barWidth: 4,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex,
        })
      )}`
  );
}

function frameProvider(type, imageId) {
  if (type !== 'imagePlaneModule') {
    return;
  }

  const plane = fakeMetaDataProvider(type, imageId);

  return plane && { ...plane, frameOfReferenceUID: FRAME };
}

/**
 * One reference of each kind that an application, a tool or a synchronizer
 * gives a stack: an image of the stack or of another series, a slice index
 * with no display set, the display set of the stack or another one, a
 * volume, an image URI, a plane restriction, and references that name only
 * a frame of reference, a plane or points.
 */
function references(imageIds, otherImageIds) {
  const point = (z) => [7.5, 7.5, z];

  return {
    'image of the stack': {
      FrameOfReferenceUID: FRAME,
      referencedImageId: imageIds[4],
      viewPlaneNormal: [0, 0, 1],
      sliceIndex: 4,
      displaySetId: DISPLAY_SET_ID,
    },
    'image of another series': {
      FrameOfReferenceUID: FRAME,
      referencedImageId: otherImageIds[4],
      viewPlaneNormal: [0, 0, 1],
      sliceIndex: 4,
      displaySetId: 'other',
    },
    'image URI of the stack': {
      referencedImageURI: utilities.imageIdToURI(imageIds[4]),
    },
    'slice index of another display set': {
      displaySetId: 'other',
      sliceIndex: 3,
    },
    'slice index of the display set of the stack': {
      displaySetId: DISPLAY_SET_ID,
      sliceIndex: 3,
    },
    'slice index with no display set': { sliceIndex: 3 },
    'slice index past the last image': { sliceIndex: 99 },
    'slice index between two images': { sliceIndex: 3.5 },
    'range of slice indices': {
      sliceIndex: [4, 5],
      cameraFocalPoint: point(4),
    },
    'volume of the images': {
      FrameOfReferenceUID: FRAME,
      volumeId: 'cornerstoneStreamingImageVolume:agreement',
      viewPlaneNormal: [0, 0, 1],
      cameraFocalPoint: point(4),
      sliceIndex: 4,
    },
    'focal point of another display set': {
      FrameOfReferenceUID: FRAME,
      displaySetId: 'other',
      viewPlaneNormal: [0, 0, 1],
      cameraFocalPoint: point(4),
    },
    'focal point of the display set of the stack': {
      FrameOfReferenceUID: FRAME,
      displaySetId: DISPLAY_SET_ID,
      viewPlaneNormal: [0, 0, 1],
      cameraFocalPoint: point(4),
    },
    'plane restriction': {
      FrameOfReferenceUID: FRAME,
      planeRestriction: {
        FrameOfReferenceUID: FRAME,
        point: point(4),
        inPlaneVector1: [1, 0, 0],
        inPlaneVector2: [0, 1, 0],
      },
    },
    'frame of reference, plane and point': {
      FrameOfReferenceUID: FRAME,
      viewPlaneNormal: [0, 0, 1],
      cameraFocalPoint: point(4.2),
    },
    'frame of reference, other plane and point': {
      FrameOfReferenceUID: FRAME,
      viewPlaneNormal: [1, 0, 0],
      cameraFocalPoint: point(4),
    },
    'frame of reference and point': {
      FrameOfReferenceUID: FRAME,
      cameraFocalPoint: point(4),
    },
    'point only': { cameraFocalPoint: point(4) },
    'frame of reference only': { FrameOfReferenceUID: FRAME },
    'another frame of reference': {
      FrameOfReferenceUID: 'other-frame',
      viewPlaneNormal: [0, 0, 1],
      cameraFocalPoint: point(4),
    },
  };
}

describe('setViewReference and isReferenceViewable of a stack agree', () => {
  let renderingEngine;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    displaySetRegistry.clear();
    metaData.removeAllProviders();
  });

  async function mountStack() {
    window.devicePixelRatio = 1;
    init({});
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
    metaData.addProvider(frameProvider, 20000);

    const element = document.createElement('div');

    document.body.appendChild(element);
    setSize(element, 64, 64);

    let viewport;

    ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      element,
      'agreement'
    ));

    const imageIds = createImageIds();

    displaySetRegistry.add(DISPLAY_SET_ID, { imageIds });
    await viewport.setDisplaySets({
      displaySetId: DISPLAY_SET_ID,
      options: { mode: 'stack', initialImageIdIndex: START },
    });

    return { viewport, imageIds };
  }

  const kinds = Object.keys(references([], []));

  it.each(kinds)(
    'moves nothing for a reference that is not viewable with navigation: %s',
    async (kind) => {
      const { viewport, imageIds } = await mountStack();
      const reference = references(imageIds, createImageIds('other'))[kind];

      if (viewport.isReferenceViewable(reference, { withNavigation: true })) {
        return;
      }

      const before = JSON.stringify(viewport.getViewState());

      viewport.setViewReference(reference);

      expect(viewport.getCurrentImageIdIndex()).toBe(START);
      expect(JSON.stringify(viewport.getViewState())).toBe(before);
    }
  );

  it('takes a slice index only of the display set of the stack or of none', async () => {
    const { viewport, imageIds } = await mountStack();
    const all = references(imageIds, createImageIds('other'));

    expect(
      viewport.isReferenceViewable(all['slice index of another display set'], {
        withNavigation: true,
      })
    ).toBe(false);

    viewport.setViewReference(all['slice index of another display set']);
    expect(viewport.getCurrentImageIdIndex()).toBe(START);

    viewport.setViewReference(all['slice index with no display set']);
    expect(viewport.getCurrentImageIdIndex()).toBe(3);
  });

  it.each([
    'frame of reference, plane and point',
    'frame of reference and point',
    'frame of reference only',
    'point only',
  ])(
    'shows a reference with %s on no slice without asVolume or asNearbyProjection',
    async (kind) => {
      const { viewport, imageIds } = await mountStack();
      const reference = references(imageIds, createImageIds('other'))[kind];

      for (const index of [0, 2, 4]) {
        await viewport.setImageIdIndex(index);
        expect(viewport.isReferenceViewable(reference)).toBe(false);
        expect(
          viewport.isReferenceViewable(reference, { withNavigation: true })
        ).toBe(false);
      }
    }
  );

  it('takes a reference with a frame of reference, a plane and a point as a volume, and as a nearby projection on the slice of its point', async () => {
    const { viewport } = await mountStack();
    const reference = {
      FrameOfReferenceUID: FRAME,
      viewPlaneNormal: [0, 0, 1],
      cameraFocalPoint: [7.5, 7.5, 4],
    };

    expect(viewport.isReferenceViewable(reference, { asVolume: true })).toBe(
      true
    );

    await viewport.setImageIdIndex(4);
    expect(
      viewport.isReferenceViewable(reference, { asNearbyProjection: true })
    ).toBe(true);

    await viewport.setImageIdIndex(2);
    expect(
      viewport.isReferenceViewable(reference, { asNearbyProjection: true })
    ).toBe(false);
  });
});

const VOLUME_ID = 'agreementVolume';
const VOLUME_FRAME = 'agreementVolumeFrame';

/**
 * References with a slice index that a volume viewport gets (row 324): of
 * the volume on display, in the plane of the view (axial) and in another
 * plane (sagittal, whose 64 slices the axial view does not have), with and
 * without a point, and with a slice index alone in another plane.
 */
function volumeReferences() {
  const base = { FrameOfReferenceUID: VOLUME_FRAME, volumeId: VOLUME_ID };

  return {
    'slice index in the plane of the view': {
      ...base,
      viewPlaneNormal: [0, 0, -1],
      sliceIndex: 3,
    },
    'slice index in the opposite normal of the view': {
      ...base,
      viewPlaneNormal: [0, 0, 1],
      sliceIndex: 3,
    },
    'slice index in another plane and no point': {
      ...base,
      viewPlaneNormal: [1, 0, 0],
      sliceIndex: 40,
    },
    'slice index in another plane, past the slices of the view, and no point': {
      ...base,
      viewPlaneNormal: [1, 0, 0],
      sliceIndex: 12,
    },
    'slice index in another plane with no volume id and no point': {
      FrameOfReferenceUID: VOLUME_FRAME,
      viewPlaneNormal: [1, 0, 0],
      sliceIndex: 40,
    },
    'slice index in another plane and a point': {
      ...base,
      viewPlaneNormal: [1, 0, 0],
      sliceIndex: 40,
      cameraFocalPoint: [20, 24, 10],
    },
    'slice index in another plane and a plane restriction': {
      ...base,
      sliceIndex: 40,
      planeRestriction: {
        FrameOfReferenceUID: VOLUME_FRAME,
        point: [20, 24, 10],
        inPlaneVector1: [0, 0, 1],
        inPlaneVector2: [0, 1, 0],
      },
    },
  };
}

describe('setViewReference and isReferenceViewable of a volume agree on a slice index of another plane (row 324)', () => {
  const viewports = [];

  afterEach(() => {
    viewports.splice(0).forEach((viewport) => destroyViewport(viewport));
    cleanUp();
  });

  /**
   * Mounts a volume of 64 by 48 by 20 voxels of 1 mm axially, on slice 5
   * of the view.
   */
  async function mountAxialVolume() {
    const viewport = createCpuViewport('agreementVolume');

    viewports.push(viewport);
    createLocalVolume(VOLUME_ID, {
      dimensions: [64, 48, 20],
      frameOfReferenceUID: VOLUME_FRAME,
    });
    await mountVolume(viewport, VOLUME_ID, {
      orientation: cornerstone3D.Enums.OrientationAxis.AXIAL,
    });
    viewport.setViewState({
      slice: {
        kind: 'volumePoint',
        sliceWorldPoint: viewport.getViewReference({ sliceIndex: 5 })
          .cameraFocalPoint,
      },
    });

    return viewport;
  }

  const options = { withNavigation: true, withOrientation: true };
  const kinds = Object.keys(volumeReferences());

  it.each(kinds)(
    'moves nothing for a reference that is not viewable with orientation and navigation: %s',
    async (kind) => {
      const viewport = await mountAxialVolume();
      const reference = volumeReferences()[kind];

      if (viewport.isReferenceViewable(reference, options)) {
        return;
      }

      const before = JSON.stringify(viewport.getViewState());

      viewport.setViewReference(reference);

      expect(viewport.getSliceIndex()).toBe(5);
      expect(JSON.stringify(viewport.getViewState())).toBe(before);
    }
  );

  it.each([
    'slice index in another plane and no point',
    'slice index in another plane, past the slices of the view, and no point',
    'slice index in another plane with no volume id and no point',
  ])(
    'refuses a reference with a %s: it is not a slice of the view',
    async (kind) => {
      const viewport = await mountAxialVolume();
      const reference = volumeReferences()[kind];

      expect(viewport.isReferenceViewable(reference, options)).toBe(false);

      viewport.setViewReference(reference);

      expect(viewport.getSliceIndex()).toBe(5);
      expect(viewport.getViewReference().viewPlaneNormal[2]).toBeCloseTo(-1, 6);
    }
  );

  it.each([
    'slice index in another plane and a point',
    'slice index in another plane and a plane restriction',
  ])(
    'takes a reference with a %s, which decides: the view turns to the plane of the point',
    async (kind) => {
      const viewport = await mountAxialVolume();
      const reference = volumeReferences()[kind];

      expect(viewport.isReferenceViewable(reference, options)).toBe(true);

      viewport.setViewReference(reference);

      const { viewPlaneNormal, cameraFocalPoint } = viewport.getViewReference();

      expect(Math.abs(viewPlaneNormal[0])).toBeCloseTo(1, 6);
      expect(cameraFocalPoint[0]).toBeCloseTo(20, 6);
    }
  );

  it('goes to a slice index in the plane of the view, as before', async () => {
    const viewport = await mountAxialVolume();
    const reference =
      volumeReferences()['slice index in the plane of the view'];

    expect(viewport.isReferenceViewable(reference, options)).toBe(true);

    viewport.setViewReference(reference);

    expect(viewport.getSliceIndex()).toBe(3);
  });
});
