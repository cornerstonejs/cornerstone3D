import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

const { setRenderBackend, imageLoader, metaData, init, cache } = cornerstone3D;

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
function createImageIds() {
  return [0, 1, 2, 3, 4, 5].map(
    (sliceIndex) =>
      `fakeImageLoader:${encodeURIComponent(
        JSON.stringify({
          loader: 'fakeImageLoader',
          name: 'check',
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

/**
 * The image plane of each image with a frame of reference: `frame-even` for
 * the images of even index and `frame-odd` for the others, as a stack that
 * mixes the images of two series. It counts its calls.
 */
function createPlaneProvider() {
  const provider = (type, imageId) => {
    if (type !== 'imagePlaneModule') {
      return;
    }

    const plane = fakeMetaDataProvider(type, imageId);

    if (!plane) {
      return;
    }

    provider.calls += 1;

    const sliceIndex = plane.imagePositionPatient[2];

    return {
      ...plane,
      frameOfReferenceUID: sliceIndex % 2 ? 'frame-odd' : 'frame-even',
    };
  };

  provider.calls = 0;

  return provider;
}

/** A reference to an image of the stack, as a tool keeps for an annotation. */
function imageReference(viewport, imageIds, sliceIndex) {
  return {
    FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
    referencedImageId: imageIds[sliceIndex],
    viewPlaneNormal: [0, 0, 1],
    sliceIndex,
  };
}

describe('The reference viewable check of a planar viewport', () => {
  let renderingEngine;
  let planeProvider;

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    displaySetRegistry.clear();
    metaData.removeAllProviders();
  });

  async function mountStack(initialImageIdIndex = 2) {
    window.devicePixelRatio = 1;
    init({});
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
    planeProvider = createPlaneProvider();
    metaData.addProvider(planeProvider, 20000);

    const element = document.createElement('div');

    document.body.appendChild(element);
    setSize(element, 64, 64);

    let viewport;

    ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      element,
      'check'
    ));

    const imageIds = createImageIds();

    displaySetRegistry.add('check', { imageIds });
    await viewport.setDisplaySets({
      displaySetId: 'check',
      options: { initialImageIdIndex },
    });

    return { viewport, imageIds };
  }

  it('reads the reference contexts once and answers as isReferenceViewable for each reference', async () => {
    const { viewport, imageIds } = await mountStack();
    const references = imageIds.map((_, sliceIndex) =>
      imageReference(viewport, imageIds, sliceIndex)
    );
    const expected = references.map((reference) =>
      viewport.isReferenceViewable(reference)
    );
    const getContexts = jest.spyOn(viewport, 'getReferenceViewContexts');
    const isViewable = viewport.getReferenceViewableCheck();
    const answers = references.map((reference) => isViewable(reference));

    expect(getContexts).toHaveBeenCalledTimes(1);
    expect(answers).toEqual(expected);
    expect(expected).toEqual([false, false, true, false, false, false]);
  });

  it('answers for the view of the moment it was made; a new check answers for the next view', async () => {
    const { viewport, imageIds } = await mountStack();
    const atSlice2 = viewport.getReferenceViewableCheck();
    const reference2 = imageReference(viewport, imageIds, 2);
    const reference4 = imageReference(viewport, imageIds, 4);

    await viewport.setImageIdIndex(4);

    const atSlice4 = viewport.getReferenceViewableCheck();

    expect([atSlice2(reference2), atSlice2(reference4)]).toEqual([true, false]);
    expect([atSlice4(reference2), atSlice4(reference4)]).toEqual([false, true]);
  });

  it('takes the frame of reference of the drawn image when it draws another one, and reads no metadata for a coordinate transform', async () => {
    const { viewport } = await mountStack(2);

    expect(viewport.getResolvedView().getFrameOfReferenceUID()).toBe(
      'frame-even'
    );

    planeProvider.calls = 0;

    for (let index = 0; index < 100; index++) {
      viewport.worldToCanvas([index % 16, 8, 2]);
    }

    expect(planeProvider.calls).toBe(0);

    const shown = viewport.setImageIdIndex(3);

    viewport.worldToCanvas([8, 8, 3]);
    await shown;

    expect(viewport.getResolvedView().getFrameOfReferenceUID()).toBe(
      'frame-odd'
    );
  });
});
