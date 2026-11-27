import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { encodeImageIdInfo } from '../../../utils/test/testUtils';

const { imageLoader, getShouldUseCPURendering, StackViewport } = cornerstone3D;
const { fakeImageLoader } = testUtils;

const renderingEngineId = 'stackViewportReloadGpu';
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

describe('StackViewport.reloadImageIdIndex -- GPU', () => {
  // The next request for an imageId in this set fails once.
  const failNextLoad = new Set();
  let renderingEngine;
  let viewport;

  beforeEach(async () => {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
    imageLoader.registerImageLoader('fakeImageLoader', (imageId, options) => {
      if (failNextLoad.delete(imageId)) {
        return { promise: Promise.reject(new Error('network error')) };
      }
      return fakeImageLoader(imageId, options);
    });

    testUtils.createViewports(renderingEngine, {
      viewportId,
      width: 64,
      height: 64,
    });
    viewport = renderingEngine.getViewport(viewportId);
    await viewport.setStack(imageIds, 0);
  });

  afterEach(() => {
    failNextLoad.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('should draw the image that failed to load and keep the VOI range', async () => {
    // The CPU path rejects the failed load (stackViewportReload.jest.js
    // covers it), and the Generic Viewport compatibility mode has no
    // reloadImageIdIndex.
    if (getShouldUseCPURendering() || !(viewport instanceof StackViewport)) {
      pending('GPU StackViewport only');
    }

    viewport.setProperties({ voiRange: { lower: 10, upper: 20 } });
    failNextLoad.add(imageIds[1]);

    // setImageIdIndex resolves on the GPU path even though the load failed.
    await viewport.setImageIdIndex(1);
    expect(viewport.getCurrentImageIdIndex()).toBe(1);
    expect(viewport.getCornerstoneImage().imageId).toBe(imageIds[0]);

    await viewport.reloadImageIdIndex(1);

    expect(viewport.getCornerstoneImage().imageId).toBe(imageIds[1]);
    expect(viewport.getProperties().voiRange).toEqual({
      lower: 10,
      upper: 20,
    });
  });
});
