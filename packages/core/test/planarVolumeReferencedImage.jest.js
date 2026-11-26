import {
  cache,
  displaySetRegistry,
  imageLoader,
  init,
  metaData,
  setRenderBackend,
  volumeLoader,
} from '../src';
import getClosestImageId from '../src/utilities/getClosestImageId';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';

const SLICES = 40;

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

/** The image ids of 16 by 16 axial images, one per millimetre. */
function createImageIds(name) {
  return Array.from(
    { length: SLICES },
    (_, sliceIndex) =>
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

/**
 * The image plane of each image with a frame of reference, its position
 * moved along the slice axis by `offsetOf(sliceIndex)`.
 */
function planeProvider(offsetOf) {
  return (type, imageId) => {
    if (type !== 'imagePlaneModule') {
      return;
    }

    const plane = fakeMetaDataProvider(type, imageId);

    if (!plane) {
      return;
    }

    const [x, y, z] = plane.imagePositionPatient;

    return {
      ...plane,
      frameOfReferenceUID: 'referencedImageFrame',
      imagePositionPatient: [x, y, z + offsetOf(z)],
    };
  };
}

describe('The referenced image of a planar viewport in volume mode', () => {
  let renderingEngine;

  beforeAll(() => {
    window.devicePixelRatio = 1;
    init({});
  });

  afterEach(() => {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    displaySetRegistry.clear();
    metaData.removeAllProviders();
  });

  async function mount(name, offsetOf) {
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
    metaData.addProvider(planeProvider(offsetOf), 20000);

    const element = document.createElement('div');

    document.body.appendChild(element);
    setSize(element, 64, 64);

    let viewport;

    ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      element,
      name
    ));

    const imageIds = createImageIds(name);
    const volumeId = `cornerstoneStreamingImageVolume:${name}`;
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    displaySetRegistry.add(name, { imageIds, volumeId });
    await viewport.setDisplaySets({
      displaySetId: name,
      options: { mode: 'volume', initialImageIdIndex: 0 },
    });

    return { viewport, volume };
  }

  /**
   * The referenced image at each point along the slice axis, by quarters of
   * a slice from before the first image to after the last, against the image
   * that a pass over the image plane of every image of the volume finds for
   * the focal point of the view.
   */
  function expectEveryPointToReferenceTheClosestImage(viewport, volume) {
    const checked = [];

    for (let z = -2; z <= SLICES + 1; z += 0.25) {
      viewport.setViewState({
        slice: { kind: 'volumePoint', sliceWorldPoint: [8, 8, z] },
      });

      const { referencedImageId } = viewport.getViewReference();
      const { focalPoint, viewPlaneNormal } = viewport
        .getResolvedView()
        .toICamera();

      checked.push(referencedImageId);
      expect(referencedImageId).toBe(
        getClosestImageId(volume, focalPoint, viewPlaneNormal)
      );
    }

    expect(new Set(checked.filter(Boolean)).size).toBe(SLICES);
  }

  it('is the image that a pass over every image finds, on every slice of a regular series', async () => {
    const { viewport, volume } = await mount('referencedRegular', () => 0);

    expectEveryPointToReferenceTheClosestImage(viewport, volume);
  });

  it('is the image that a pass over every image finds, on every slice of a series whose images lie off the grid of the volume', async () => {
    const { viewport, volume } = await mount('referencedJittered', (z) =>
      z % 3 === 0 ? 0.3 : z % 3 === 1 ? -0.2 : 0
    );

    expectEveryPointToReferenceTheClosestImage(viewport, volume);
  });
});
