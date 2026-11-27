import * as cornerstone3D from '../src/index';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createSeries,
  renderAndWait,
  showStack,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, cache, metaData, volumeLoader } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const ENGINES = [
  { name: 'the tiled engine', Engine: TiledRenderingEngine },
  { name: 'the context pool engine', Engine: ContextPoolRenderingEngine },
];

const environmentEngineId = utilities.uuidv4();

/**
 * The panes of the tests: a CSS size, a device pixel ratio, and whether the
 * viewport is enabled with `enableElement` or with `setViewports`. The last
 * two give a canvas size that is not a whole number of device pixels.
 */
const PANES = [
  { size: [400, 300], devicePixelRatio: 1, useEnableElement: true },
  { size: [400, 300], devicePixelRatio: 1, useEnableElement: false },
  { size: [401.5, 300.5], devicePixelRatio: 1.5, useEnableElement: true },
  { size: [333.3, 250.7], devicePixelRatio: 1.25, useEnableElement: false },
];

/**
 * The CSS size that a pane takes for a resize, by its device pixel ratio:
 * one where the CSS size times the ratio, rounded, is not the rounded CSS
 * size times the ratio, rounded (row 297).
 */
const RESIZED = {
  1: [420, 310],
  1.5: [400.6, 300.4],
  1.25: [350.6, 241.4],
};

/** Waits for the given number of animation frames. */
async function frames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

const pixelReader = document.createElement('canvas');

/** The RGBA bytes of what a canvas shows. */
function readPixels(canvas) {
  const context = pixelReader.getContext('2d', { willReadFrequently: true });

  pixelReader.width = canvas.width;
  pixelReader.height = canvas.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(canvas, 0, 0);

  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** The number of pixels of two pictures that differ in any channel. */
function countChangedPixels(actual, expected) {
  let changed = 0;

  for (let index = 0; index < actual.length; index += 4) {
    if (
      actual[index] !== expected[index] ||
      actual[index + 1] !== expected[index + 1] ||
      actual[index + 2] !== expected[index + 2] ||
      actual[index + 3] !== expected[index + 3]
    ) {
      changed++;
    }
  }

  return changed;
}

/**
 * The camera of a 3D viewport, as numbers to compare: its focal point,
 * position, view up, parallel scale and view angle.
 */
function cameraOf(viewport) {
  const camera = viewport.getRenderer().getActiveCamera();

  return [
    ...camera.getFocalPoint(),
    ...camera.getPosition(),
    ...camera.getViewUp(),
    camera.getParallelScale(),
    camera.getViewAngle(),
  ];
}

/** Makes and caches a volume of the fake volume loader of 40 by 30 by 12. */
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

ENGINES.forEach(({ name: engineName, Engine }) => {
  describe(`The first frame of a viewport on ${engineName} -- `, () => {
    let renderingEngine;
    let restoreDevicePixelRatio;

    beforeEach(function () {
      testUtils.setupTestEnvironment({
        renderingEngineId: environmentEngineId,
        toolGroupIds: [],
      });
    });

    afterEach(function () {
      renderingEngine?.destroy();
      renderingEngine = undefined;
      restoreDevicePixelRatio?.();
      restoreDevicePixelRatio = undefined;
      testUtils.cleanupTestEnvironment({
        renderingEngineId: environmentEngineId,
      });
      cache.purgeCache();
      metaData.removeAllProviders();
    });

    /** Sets the device pixel ratio of the window until the test ends. */
    function setDevicePixelRatio(ratio) {
      const own = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');

      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        get: () => ratio,
      });
      restoreDevicePixelRatio = () => {
        if (own) {
          Object.defineProperty(window, 'devicePixelRatio', own);
        } else {
          delete window.devicePixelRatio;
        }
      };
    }

    PANES.forEach(({ size, devicePixelRatio, useEnableElement }) => {
      const enabledBy = useEnableElement ? 'enableElement' : 'setViewports';

      it(`draws a planar viewport as the frame after a resize that changes no size, for a pane of ${size[0]} by ${size[1]} CSS pixels at ${devicePixelRatio} device pixels each, enabled by ${enabledBy}`, async function () {
        setDevicePixelRatio(devicePixelRatio);
        renderingEngine = new Engine(utilities.uuidv4());

        const series = await createSeries({ id: `firstFrame-${enabledBy}` });

        testUtils.createViewports(renderingEngine, {
          viewportId: 'firstFrame',
          viewportType: ViewportType.PLANAR,
          orientation: OrientationAxis.ACQUISITION,
          width: size[0],
          height: size[1],
          useEnableElement,
        });

        const viewport = renderingEngine.getViewport('firstFrame');

        await showStack(viewport, series, 3);
        await renderAndWait(viewport);

        const firstSize = [viewport.canvas.width, viewport.canvas.height];
        const firstDrawSize = [viewport.sWidth, viewport.sHeight];
        const first = readPixels(viewport.canvas);

        renderingEngine.resize(true, true);
        await frames(2);
        await renderAndWait(viewport);

        expect([viewport.sWidth, viewport.sHeight]).toEqual(firstDrawSize);
        expect([viewport.canvas.width, viewport.canvas.height]).toEqual(
          firstSize
        );
        expect(countChangedPixels(readPixels(viewport.canvas), first)).toBe(0);
      });

      it(`gives the CPU canvas of a planar viewport the size of the canvas of the engine, at the first frame and after a resize, for a pane of ${size[0]} by ${size[1]} CSS pixels at ${devicePixelRatio} device pixels each, enabled by ${enabledBy}`, async function () {
        setDevicePixelRatio(devicePixelRatio);
        renderingEngine = new Engine(utilities.uuidv4());

        const series = await createSeries({ id: `cpuCanvas-${enabledBy}` });
        const pane = {
          viewportType: ViewportType.PLANAR,
          orientation: OrientationAxis.ACQUISITION,
          width: size[0],
          height: size[1],
          useEnableElement,
        };
        const elements = testUtils.createViewports(renderingEngine, [
          { ...pane, viewportId: 'gpuPane' },
          { ...pane, viewportId: 'cpuPane' },
        ]);
        const gpu = renderingEngine.getViewport('gpuPane');
        const cpu = renderingEngine.getViewport('cpuPane');
        const sizes = () => {
          const { width, height } =
            gpu.canvas.parentElement.getBoundingClientRect();

          return {
            rule: [
              Math.round(width * devicePixelRatio),
              Math.round(height * devicePixelRatio),
            ],
            gpu: [gpu.getCanvas().width, gpu.getCanvas().height],
            cpu: [cpu.getCanvas().width, cpu.getCanvas().height],
          };
        };

        await showStack(gpu, series, 3);
        await showStack(cpu, series, 3, { renderBackend: 'cpu' });

        expect(cpu.getCanvas()).not.toBe(gpu.getCanvas());

        const first = sizes();

        expect(first.gpu).toEqual(first.rule);
        expect(first.cpu).toEqual(first.rule);

        const [width, height] = RESIZED[devicePixelRatio];

        elements.forEach((element) => {
          element.style.width = `${width}px`;
          element.style.height = `${height}px`;
        });
        renderingEngine.resize(true, true);
        await frames(2);
        await renderAndWait(gpu);
        await renderAndWait(cpu);

        const resized = sizes();

        expect(resized.rule).not.toEqual(first.rule);
        expect(resized.gpu).toEqual(resized.rule);
        expect(resized.cpu).toEqual(resized.rule);
      });

      it(`keeps the camera and the canvas size of a 3D viewport at a resize that changes no size, for a pane of ${size[0]} by ${size[1]} CSS pixels at ${devicePixelRatio} device pixels each, enabled by ${enabledBy}`, async function () {
        setDevicePixelRatio(devicePixelRatio);
        renderingEngine = new Engine(utilities.uuidv4());

        const volumeId = await createVolume(`firstFrame3D-${enabledBy}`);
        const displaySetId = `firstFrame3D:${volumeId}`;

        testUtils.createViewports(renderingEngine, {
          viewportId: 'firstFrame3D',
          viewportType: ViewportType.VOLUME_3D,
          orientation: OrientationAxis.CORONAL,
          width: size[0],
          height: size[1],
          useEnableElement,
        });

        const viewport = renderingEngine.getViewport('firstFrame3D');

        cornerstone3D.displaySetRegistry.add(displaySetId, {
          imageIds: cache.getVolume(volumeId).imageIds,
          volumeId,
        });
        await viewport.setDisplaySets({ displaySetId });
        await renderAndWait(viewport);

        const firstSize = [viewport.canvas.width, viewport.canvas.height];
        const firstDrawSize = [viewport.sWidth, viewport.sHeight];
        const firstCamera = cameraOf(viewport);

        renderingEngine.resize(true, true);
        await frames(2);
        await renderAndWait(viewport);

        expect([viewport.sWidth, viewport.sHeight]).toEqual(firstDrawSize);
        expect([viewport.canvas.width, viewport.canvas.height]).toEqual(
          firstSize
        );
        expect(cameraOf(viewport)).toEqual(firstCamera);
      });
    });
  });
});
