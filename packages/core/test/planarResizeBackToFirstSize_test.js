import * as cornerstone3D from '../src/index';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createSeries,
  showStack,
  showVolume,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const environmentEngineId = utilities.uuidv4();
const viewportId = 'resizeBackToFirstSize';
const SLICE = 2;

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

/** The length in world units of 200 canvas pixels across the canvas. */
function lengthOf200Pixels(viewport) {
  const start = viewport.canvasToWorld([100, 150]);
  const end = viewport.canvasToWorld([300, 150]);

  return Math.hypot(...start.map((value, axis) => value - end[axis]));
}

/** Where the centre of the image is on the canvas, and the length. */
function readGeometry(viewport, series) {
  const centre = worldOfVoxel(series, [
    series.size.columns / 2,
    series.size.rows / 2,
    SLICE,
  ]);

  return {
    centreOnCanvas: viewport.worldToCanvas(centre),
    length: lengthOf200Pixels(viewport),
  };
}

describe('A planar viewport resized to half its width and back -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    testUtils.setupTestEnvironment({
      renderingEngineId: environmentEngineId,
      toolGroupIds: [],
    });
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    renderingEngine?.destroy();
    renderingEngine = undefined;
    testUtils.cleanupTestEnvironment({
      renderingEngineId: environmentEngineId,
    });
  });

  ENGINES.forEach(({ name: engineName, Engine }) => {
    MODES.forEach(({ name: modeName, show, options }) => {
      it(`gives ${modeName} its first geometry again at its first size on ${engineName}`, async () => {
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
        const series = await createSeries({
          id: `resizeBack:${Engine.name}`,
        });

        await show(viewport, series, SLICE, options);
        viewport.setPan([30, 20]);
        viewport.render();
        await waitForFrames(3);

        const first = readGeometry(viewport, series);

        element.style.width = '200px';
        renderingEngine.resize(true);
        await waitForFrames(4);

        const half = readGeometry(viewport, series);

        element.style.width = '400px';
        renderingEngine.resize(true);
        await waitForFrames(4);

        const back = readGeometry(viewport, series);
        const canvas = shownCanvas(viewport);

        expect(half.centreOnCanvas[0]).toBeLessThan(first.centreOnCanvas[0]);
        expect(back.centreOnCanvas[0]).toBeCloseTo(first.centreOnCanvas[0], 3);
        expect(back.centreOnCanvas[1]).toBeCloseTo(first.centreOnCanvas[1], 3);
        expect(back.length).toBeCloseTo(first.length, 3);
        expect([canvas.width, canvas.height]).toEqual([400, 300]);
      });
    });
  });
});
