import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { describe, it, expect, afterEach } from '@jest/globals';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

const { setRenderBackend, imageLoader, metaData, init, cache } = cornerstone3D;

/**
 * The half slice of a stack for `asNearbyProjection` (row 264): a point
 * belongs to the image of the stack nearest to it along the normal. Towards
 * a neighbour image the image reaches half the distance to that neighbour;
 * beyond the first or the last image, half the distance to its one
 * neighbour; a stack without a neighbour of known position in a parallel
 * plane takes half the spacing between slices, or else half the slice
 * thickness, of the image on display, and without either half the z spacing
 * of its image data (0.0005 mm), as 5.x took every point.
 */

const SAGITTAL = { rowCosines: [0, 1, 0], columnCosines: [0, 0, 1] };

/** Image plane fields that the tests give an image id over the fake ones. */
const planeOverrides = new Map();

function planeOverrideProvider(type, imageId) {
  if (type !== 'imagePlaneModule' || !planeOverrides.has(imageId)) {
    return;
  }

  return {
    ...fakeMetaDataProvider(type, imageId),
    ...planeOverrides.get(imageId),
  };
}

/**
 * Image ids of 16 by 16 images of 1 mm pixels at the positions z along the
 * axial normal, with image plane fields over the fake ones for some of them.
 */
function createImageIds(positions, name, overrides = {}) {
  return positions.map((z, sliceIndex) => {
    const imageId = `fakeImageLoader:${encodeURIComponent(
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
        ipp: [0, 0, z],
      })
    )}`;

    if (overrides[sliceIndex]) {
      planeOverrides.set(imageId, overrides[sliceIndex]);
    }

    return imageId;
  });
}

function setSize(element, width, height) {
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

describe('asNearbyProjection on a stack takes a point within half the distance to the next image (row 264)', () => {
  let renderingEngines = [];

  async function showStack(imageIds, imageIdIndex) {
    window.devicePixelRatio = 1;
    init({});
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
    metaData.addProvider(planeOverrideProvider, 20000);

    const element = document.createElement('div');
    document.body.appendChild(element);
    setSize(element, 64, 64);

    const { renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      element,
      'nearbyProjection'
    );

    renderingEngines.push(renderingEngine);
    displaySetRegistry.add('nearbyStack', { imageIds });
    await viewport.setDisplaySets({
      displaySetId: 'nearbyStack',
      options: { initialImageIdIndex: imageIdIndex },
    });

    return viewport;
  }

  /** The answers of `asNearbyProjection` for the points (3, 4, z). */
  function nearby(viewport, zs) {
    return zs.map((z) =>
      viewport.isReferenceViewable(
        { cameraFocalPoint: [3, 4, z] },
        { asNearbyProjection: true }
      )
    );
  }

  afterEach(() => {
    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    planeOverrides.clear();
    cache.purgeCache();
    displaySetRegistry.clear?.();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    setRenderBackend('auto');
    document.body.innerHTML = '';
  });

  it('takes a point up to half the distance to each neighbour of an image inside the stack, 1 mm apart', async () => {
    const viewport = await showStack(createImageIds([0, 1, 2, 3], 'even'), 1);

    expect(nearby(viewport, [1.002, 1.49, 0.51, 1.51, 0.49, 1.5, 0.5])).toEqual(
      [true, true, true, false, false, true, true]
    );
  });

  it('takes a point beyond the first or the last image up to half the distance to its one neighbour', async () => {
    const imageIds = createImageIds([0, 1, 2, 3], 'ends');
    const viewport = await showStack(imageIds, 0);

    expect(nearby(viewport, [-0.49, -0.51, 0.49, 0.51])).toEqual([
      true,
      false,
      true,
      false,
    ]);

    await viewport.setImageIdIndex(3);

    expect(nearby(viewport, [3.49, 3.51, 2.51, 2.49])).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it('takes the distance to the neighbour on the side of the point when the spacing of the stack is not even', async () => {
    const imageIds = createImageIds([0, 1, 3, 6], 'uneven');
    const viewport = await showStack(imageIds, 2);

    expect(nearby(viewport, [2.05, 1.95, 4.45, 4.55])).toEqual([
      true,
      false,
      true,
      false,
    ]);

    await viewport.setImageIdIndex(3);

    expect(nearby(viewport, [7.45, 7.55, 4.55, 4.45])).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it('measures the neighbours along the normal in a stack sorted the other way', async () => {
    const viewport = await showStack(createImageIds([3, 2, 1, 0], 'down'), 1);

    expect(nearby(viewport, [2.45, 1.55, 2.55, 1.45])).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('keeps the 5.x half slice of 0.0005 mm for a stack of one image without a spacing in its metadata', async () => {
    const viewport = await showStack(createImageIds([5], 'single'), 0);

    expect(nearby(viewport, [5.0004, 4.9996, 5.0006, 5.2])).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('takes half the spacing between slices, or else half the slice thickness, of a stack of one image', async () => {
    const spaced = await showStack(
      createImageIds([5], 'spaced', {
        0: { spacingBetweenSlices: 3, sliceThickness: 2 },
      }),
      0
    );

    expect(nearby(spaced, [6.45, 3.55, 6.55])).toEqual([true, true, false]);

    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    displaySetRegistry.clear?.();
    metaData.removeAllProviders();

    const thick = await showStack(
      createImageIds([5], 'thick', { 0: { sliceThickness: 2 } }),
      0
    );

    expect(nearby(thick, [5.95, 4.05, 6.05])).toEqual([true, true, false]);
  });

  it('takes no neighbour whose plane is not parallel, nor one at the same position, and then keeps the 5.x half slice', async () => {
    const tilted = await showStack(
      createImageIds([0, 1, 2], 'tilted', { 0: SAGITTAL, 2: SAGITTAL }),
      1
    );

    expect(nearby(tilted, [1.0004, 1.2, 0.8])).toEqual([true, false, false]);

    renderingEngines.forEach((renderingEngine) => renderingEngine.destroy());
    renderingEngines = [];
    displaySetRegistry.clear?.();
    metaData.removeAllProviders();

    const frames = await showStack(
      createImageIds([4, 4, 4], 'frames', { 1: { sliceThickness: 2 } }),
      1
    );

    expect(nearby(frames, [4.95, 3.05, 5.05])).toEqual([true, true, false]);
  });

  it('answers the same through one check of the view, made again after a scroll', async () => {
    const viewport = await showStack(createImageIds([0, 1, 3, 6], 'check'), 1);
    const reference = (z) => ({ cameraFocalPoint: [3, 4, z] });
    const atOne = viewport.getReferenceViewableCheck();

    expect(
      [1.95, 2.05, 0.55].map((z) =>
        atOne(reference(z), { asNearbyProjection: true })
      )
    ).toEqual([true, false, true]);

    await viewport.setImageIdIndex(2);

    const atTwo = viewport.getReferenceViewableCheck();

    expect(
      [1.95, 2.05, 4.45].map((z) =>
        atTwo(reference(z), { asNearbyProjection: true })
      )
    ).toEqual([false, true, true]);
  });

  it('leaves setViewReference as it was: a reference of only a point moves the stack to no image, also one within the half slice of another image', async () => {
    const imageIds = createImageIds([0, 1, 2, 3], 'move');
    const viewport = await showStack(imageIds, 1);
    const frameOfReferenceUID = viewport.getFrameOfReferenceUID();

    viewport.setViewReference({ cameraFocalPoint: [3, 4, 2.4] });
    viewport.setViewReference({
      FrameOfReferenceUID: frameOfReferenceUID,
      cameraFocalPoint: [3, 4, 2.4],
      viewPlaneNormal: [0, 0, 1],
    });

    expect(viewport.getCurrentImageIdIndex()).toBe(1);
    expect(
      viewport.isReferenceViewable(
        {
          FrameOfReferenceUID: frameOfReferenceUID,
          cameraFocalPoint: [3, 4, 1.4],
          viewPlaneNormal: [0, 0, 1],
        },
        { asNearbyProjection: true }
      )
    ).toBe(true);
    expect(
      viewport.isReferenceViewable({
        FrameOfReferenceUID: frameOfReferenceUID,
        cameraFocalPoint: [3, 4, 1.4],
        viewPlaneNormal: [0, 0, 1],
      })
    ).toBe(false);
  });
});
