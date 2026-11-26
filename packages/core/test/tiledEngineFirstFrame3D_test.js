import * as cornerstone3D from '../src/index';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const environmentEngineId = utilities.uuidv4();
const viewportId = 'firstFrame3D';

/** Waits for the given number of animation frames. */
async function waitForFrames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** The RGBA bytes of the pixel in the top left corner of a canvas. */
function readCornerPixel(canvas) {
  const reader = document.createElement('canvas');
  const context = reader.getContext('2d', { willReadFrequently: true });

  reader.width = canvas.width;
  reader.height = canvas.height;
  context.drawImage(canvas, 0, 0);

  return Array.from(context.getImageData(2, 2, 1, 1).data);
}

describe('The first frame of a 3D viewport on the tiled engine -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    testUtils.setupTestEnvironment({
      renderingEngineId: environmentEngineId,
      toolGroupIds: [],
    });
  });

  afterEach(function () {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    testUtils.cleanupTestEnvironment({
      renderingEngineId: environmentEngineId,
    });
    cache.purgeCache();
  });

  it('is copied from the tile of the viewport before any resize, so its background shows', async function () {
    renderingEngine = new TiledRenderingEngine(utilities.uuidv4());

    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'firstFrame3D',
      id: 'firstFrame3D',
      rows: 30,
      columns: 40,
      slices: 12,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 2,
    });
    const element = document.createElement('div');
    const displaySetId = `firstFrame3D:${volumeId}`;

    await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
    element.style.width = '400px';
    element.style.height = '300px';
    document.body.appendChild(element);
    renderingEngine.enableElement({
      viewportId,
      type: ViewportType.VOLUME_3D,
      element,
      defaultOptions: {
        orientation: OrientationAxis.CORONAL,
        background: [1, 0, 1],
      },
    });

    const viewport = renderingEngine.getViewport(viewportId);

    cornerstone3D.displaySetRegistry.add(displaySetId, {
      imageIds: cache.getVolume(volumeId).imageIds,
      volumeId,
    });
    await viewport.setDisplaySets({ displaySetId });
    viewport.render();
    await waitForFrames(3);

    expect(Number.isFinite(viewport.sx)).toBe(true);
    expect(Number.isFinite(viewport.sy)).toBe(true);
    expect(readCornerPixel(viewport.canvas)).toEqual([255, 0, 255, 255]);

    element.remove();
  });
});
