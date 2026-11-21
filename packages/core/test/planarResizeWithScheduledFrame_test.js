import * as cornerstone3D from '../src/index';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createSeries,
  showStack,
  showVolume,
  waitFor,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const environmentEngineId = utilities.uuidv4();
const viewportId = 'resizeWithScheduledFrame';
const PIXEL_TOLERANCE = 1;

const ENGINES = [
  {
    name: 'the context pool rendering engine',
    Engine: ContextPoolRenderingEngine,
  },
  { name: 'the tiled rendering engine', Engine: TiledRenderingEngine },
];

const MODES = [
  { name: 'a stack on the GPU', show: showStack, options: {} },
  { name: 'a volume on the GPU', show: showVolume, options: {} },
  {
    name: 'a stack on the CPU',
    show: showStack,
    options: { renderBackend: 'cpu' },
  },
  {
    name: 'a volume on the CPU',
    show: showVolume,
    options: { renderBackend: 'cpu' },
  },
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

/** The canvas of the viewport that is on display. */
function shownCanvas(viewport) {
  return Array.from(viewport.element.querySelectorAll('canvas')).find(
    (canvas) => canvas.style.display !== 'none' && canvas.clientWidth > 0
  );
}

/**
 * Whether the canvas on display is drawn at its centre. A canvas is cleared
 * when its size is set, and a CPU display set is drawn again when the view
 * is at rest, some frames after the frame of the rendering engine.
 */
function isDrawn(viewport) {
  const canvas = shownCanvas(viewport);
  const { data } = canvas
    .getContext('2d')
    .getImageData(canvas.width / 2, canvas.height / 2, 1, 1);

  return data[3] === 255;
}

describe('A planar viewport whose element changed size -- ', () => {
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
    MODES.forEach(({ name: modeName, show, options }) => {
      RESIZES.forEach(({ name: resizeName, resize }) => {
        it(`draws ${modeName} on the new canvas, its centre in the centre, after ${resizeName} of ${engineName}`, async () => {
          renderingEngine = new Engine(utilities.uuidv4());

          const element = testUtils.createViewports(renderingEngine, {
            viewportType: ViewportType.PLANAR,
            orientation: OrientationAxis.ACQUISITION,
            viewportId,
            width: 400,
            height: 300,
            useEnableElement: true,
          });
          const viewport = renderingEngine.getViewport(viewportId);
          const series = await createSeries({ id: `resize:${Engine.name}` });

          await show(viewport, series, 2, options);
          renderingEngine.resize(true);
          await waitForFrames(3);

          const centreWorld = viewport.canvasToWorld([200, 150]);

          element.style.width = '200px';
          element.style.height = '150px';

          resize(renderingEngine);
          await waitForFrames(4);
          await waitFor(() => isDrawn(viewport));

          const centreCanvas = viewport.worldToCanvas(centreWorld);
          const backToWorld = viewport.canvasToWorld([100, 75]);
          const canvas = shownCanvas(viewport);

          expect(Math.abs(centreCanvas[0] - 100)).toBeLessThanOrEqual(
            PIXEL_TOLERANCE
          );
          expect(Math.abs(centreCanvas[1] - 75)).toBeLessThanOrEqual(
            PIXEL_TOLERANCE
          );
          backToWorld.forEach((value, axis) => {
            expect(Math.abs(value - centreWorld[axis])).toBeLessThanOrEqual(
              PIXEL_TOLERANCE
            );
          });
          expect([canvas.width, canvas.height]).toEqual([200, 150]);
        });
      });
    });
  });
});
