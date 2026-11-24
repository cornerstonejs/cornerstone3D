import * as cornerstone3D from '../src/index';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const environmentEngineId = utilities.uuidv4();
const viewportId = 'next3DResize';
const PIXEL_TOLERANCE = 1;

const ENGINES = [
  {
    name: 'the context pool rendering engine',
    Engine: ContextPoolRenderingEngine,
  },
  { name: 'the tiled rendering engine', Engine: TiledRenderingEngine },
];

const RESIZES = [
  { name: 'a resize', resize: (engine) => engine.resize(true) },
  {
    name: 'a resize that meets a scheduled frame',
    resize: (engine) => {
      engine.render();
      engine.resize(false);
      engine.render();
    },
  },
];

/** Waits for the given number of animation frames. */
async function waitForFrames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices 2 mm apart.
 */
async function createVolume(name) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 2,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/** Enables a direct next 3D viewport of 400 by 300 pixels with the volume. */
async function show3DViewport(renderingEngine, volumeId) {
  const element = document.createElement('div');
  const displaySetId = `next3DResize:${volumeId}`;

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
  await viewport.setDisplaySets({
    displaySetId,
    options: { renderMode: 'vtkVolume3d' },
  });
  viewport.render();
  await waitForFrames(3);

  return viewport;
}

describe('A direct next 3D viewport whose element changed size -- ', () => {
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
  });

  ENGINES.forEach(({ name: engineName, Engine }) => {
    RESIZES.forEach(({ name: resizeName, resize }) => {
      it(`has a canvas of the new size and its centre in the centre after ${resizeName} of ${engineName}`, async () => {
        renderingEngine = new Engine(utilities.uuidv4());

        const viewport = await show3DViewport(
          renderingEngine,
          await createVolume(`next3DResize${Engine.name}`)
        );
        const centreWorld = viewport.canvasToWorld([200, 150]);

        viewport.element.style.width = '200px';
        viewport.element.style.height = '150px';
        resize(renderingEngine);
        await waitForFrames(4);

        const centreCanvas = viewport.worldToCanvas(centreWorld);

        expect([viewport.canvas.width, viewport.canvas.height]).toEqual([
          200, 150,
        ]);
        expect([viewport.sWidth, viewport.sHeight]).toEqual([200, 150]);
        expect(Math.abs(centreCanvas[0] - 100)).toBeLessThanOrEqual(
          PIXEL_TOLERANCE
        );
        expect(Math.abs(centreCanvas[1] - 75)).toBeLessThanOrEqual(
          PIXEL_TOLERANCE
        );
      });
    });
  });
});
