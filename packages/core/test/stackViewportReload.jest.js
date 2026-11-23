import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import * as cornerstone3D from '../src/index';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { encodeImageIdInfo } from '../../../utils/test/testUtils';

const {
  utilities,
  setUseCPURendering,
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  cache,
  eventTarget,
  init,
} = cornerstone3D;
const { ViewportType, Events } = Enums;

const renderingEngineId = 'stackViewportReload';
const viewportId = 'VIEWPORT';

const imageIds = [0, 1].map((sliceIndex) =>
  encodeImageIdInfo({
    loader: 'fakeImageLoader',
    name: 'imageURI',
    rows: 64,
    columns: 64,
    barStart: 20,
    barWidth: 5,
    xSpacing: 1,
    ySpacing: 1,
    sliceIndex,
  })
);

// The next request for an imageId in this set fails once.
const failNextLoad = new Set();
const requestedImageIds = [];

function flakyImageLoader(imageId, options) {
  requestedImageIds.push(imageId);
  if (failNextLoad.delete(imageId)) {
    return { promise: Promise.reject(new Error('network error')) };
  }
  return fakeImageLoader(imageId, options);
}

function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

function drawnImageId(viewport) {
  return viewport.getCornerstoneImage()?.imageId;
}

describe('StackViewport.reloadImageIdIndex', () => {
  let renderingEngine;
  let viewport;
  let onLoadError;

  beforeEach(async () => {
    setUseCPURendering(true);
    window.devicePixelRatio = 1;
    init({});
    imageLoader.registerImageLoader('fakeImageLoader', flakyImageLoader);
    metaData.addProvider(utilities.calibratedPixelSpacingMetadataProvider.get);
    metaData.addProvider(utilities.genericMetadataProvider.get);
    metaData.addProvider(fakeMetaDataProvider, 10000);

    document.body.innerHTML = `<div id="element"></div>`;
    const element = document.getElementById('element');
    setSize(element, 100, 100);

    renderingEngine = new RenderingEngine(renderingEngineId);
    renderingEngine.enableElement({
      viewportId,
      type: ViewportType.STACK,
      element,
    });
    viewport = renderingEngine.getViewport(viewportId);

    await viewport.setStack(imageIds, 0);
    requestedImageIds.length = 0;
  });

  afterEach(() => {
    if (onLoadError) {
      eventTarget.removeEventListener(Events.IMAGE_LOAD_ERROR, onLoadError);
      onLoadError = undefined;
    }
    renderingEngine.destroy();
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    failNextLoad.clear();
  });

  it('loads the current image again after it failed to load', async () => {
    failNextLoad.add(imageIds[1]);
    await expect(viewport.setImageIdIndex(1)).rejects.toThrow('network error');

    // The index moved, but the previous image is still drawn.
    expect(viewport.getCurrentImageIdIndex()).toBe(1);
    expect(drawnImageId(viewport)).toBe(imageIds[0]);

    // setImageIdIndex stops early because the index has not changed.
    await viewport.setImageIdIndex(1);
    expect(drawnImageId(viewport)).toBe(imageIds[0]);

    await expect(viewport.reloadImageIdIndex(1)).resolves.toBe(imageIds[1]);
    expect(drawnImageId(viewport)).toBe(imageIds[1]);
  });

  it('keeps the properties that setStack resets', async () => {
    viewport.setProperties({ invert: true });
    viewport.setCamera({ flipHorizontal: true });
    failNextLoad.add(imageIds[1]);
    await expect(viewport.setImageIdIndex(1)).rejects.toThrow('network error');

    await viewport.reloadImageIdIndex(1);

    expect(viewport.getProperties().invert).toBe(true);
    expect(viewport.getCamera().flipHorizontal).toBe(true);
  });

  it('requests the image again when an IMAGE_LOAD_ERROR listener schedules it', async () => {
    const reloaded = new Promise((resolve) => {
      onLoadError = () => {
        // Retry after the listeners return, as the JSDoc asks.
        setTimeout(() => resolve(viewport.reloadImageIdIndex(1)), 0);
      };
      eventTarget.addEventListener(Events.IMAGE_LOAD_ERROR, onLoadError);
    });

    failNextLoad.add(imageIds[1]);
    await expect(viewport.setImageIdIndex(1)).rejects.toThrow('network error');

    await expect(reloaded).resolves.toBe(imageIds[1]);
    expect(requestedImageIds).toEqual([imageIds[1], imageIds[1]]);
    expect(drawnImageId(viewport)).toBe(imageIds[1]);
  });
});
