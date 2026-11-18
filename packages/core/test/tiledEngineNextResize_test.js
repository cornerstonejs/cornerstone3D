import * as cornerstone3D from '../src/index';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, utilities } = cornerstone3D;
const { ViewportType, Events } = Enums;

const environmentEngineId = utilities.uuidv4();
const tiledEngineId = utilities.uuidv4();
const viewportId = 'tiledNextResize';
const PIXEL_TOLERANCE = 1;

/** Renders the viewport and resolves at its next IMAGE_RENDERED event. */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/** The id of an image of 100 columns and 50 rows of 1 mm. */
function createImageId() {
  return testUtils.encodeImageIdInfo({
    loader: 'fakeImageLoader',
    name: 'tiledNextResizeURI',
    rows: 50,
    columns: 100,
    barStart: 10,
    barWidth: 5,
    xSpacing: 1,
    ySpacing: 1,
    sliceIndex: 0,
  });
}

describe('A direct next planar viewport on the tiled rendering engine', () => {
  let renderingEngine;

  beforeEach(function () {
    testUtils.setupTestEnvironment({
      renderingEngineId: environmentEngineId,
      toolGroupIds: [],
    });
    renderingEngine = new TiledRenderingEngine(tiledEngineId);
  });

  afterEach(function () {
    renderingEngine.destroy();
    testUtils.cleanupTestEnvironment({
      renderingEngineId: environmentEngineId,
    });
  });

  it('keeps the point at the centre of the canvas in the centre after a resize of its element', async () => {
    const element = testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.PLANAR_NEXT,
      viewportId,
      width: 400,
      height: 400,
    });
    const viewport = renderingEngine.getViewport(viewportId);

    await testUtils.setStackOnNextViewport(viewport, [createImageId()], 0);
    await renderAndWait(viewport);

    const centreWorld = viewport.canvasToWorld([200, 200]);

    element.style.width = '200px';
    element.style.height = '200px';

    expect(() => renderingEngine.resize(true, true)).not.toThrow();

    await renderAndWait(viewport);

    const centreCanvas = viewport.worldToCanvas(centreWorld);

    expect(Math.abs(centreCanvas[0] - 100)).toBeLessThanOrEqual(
      PIXEL_TOLERANCE
    );
    expect(Math.abs(centreCanvas[1] - 100)).toBeLessThanOrEqual(
      PIXEL_TOLERANCE
    );
  });
});
