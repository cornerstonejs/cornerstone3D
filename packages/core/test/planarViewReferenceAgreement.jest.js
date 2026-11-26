import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { describe, it, expect, afterEach } from '@jest/globals';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

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
