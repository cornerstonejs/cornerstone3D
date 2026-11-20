import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { init, isWebGLUnavailable, resetInitialization } from '../src/init';
import { resetRenderingCapabilities } from '../src/utilities/renderingCapabilities';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import vtkStreamingOpenGLRenderWindow from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLRenderWindow';
import { SAMPLED_SLICE_REST_DELAY_MS } from '../src/RenderingEngine/GenericViewport/Planar/planarSampledSliceRest';

const { Enums, cache, imageLoader, metaData, utilities } = cornerstone3D;
const { Events, ViewportType } = Enums;

const WEBGL_CONTEXT_TYPES = ['webgl2', 'webgl', 'experimental-webgl'];

const ENGINES = [
  {
    name: 'the context pool rendering engine',
    Engine: ContextPoolRenderingEngine,
  },
  { name: 'the tiled rendering engine', Engine: TiledRenderingEngine },
];

/**
 * Makes the browser act as a device without WebGL: every request of a WebGL
 * context gives null and is counted. Gives the counter and the function that
 * puts the browser back.
 */
function removeWebGL() {
  const counter = { webGLContexts: 0 };
  const { getContext } = HTMLCanvasElement.prototype;

  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (WEBGL_CONTEXT_TYPES.includes(type)) {
      counter.webGLContexts++;
      return null;
    }

    return getContext.call(this, type, ...args);
  };

  return {
    counter,
    restore: () => {
      HTMLCanvasElement.prototype.getContext = getContext;
    },
  };
}

/** Runs init() again, so that it finds the WebGL of the browser as it is now. */
function initAgain() {
  resetRenderingCapabilities();
  resetInitialization();
  init();
}

/** A stack of two images of 16 by 16 pixels with a bright bar. */
function createImageIds() {
  return [0, 1].map((sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 16,
      columns: 16,
      barStart: 4,
      barWidth: 8,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );
}

/** An element of 64 by 64 pixels in the document. */
function createElement() {
  const element = document.createElement('div');

  element.style.width = '64px';
  element.style.height = '64px';
  document.body.appendChild(element);

  return element;
}

/** The brightest red value on the canvas of the viewport that is shown. */
function brightestShownValue(element) {
  const shown = Array.from(element.querySelectorAll('canvas')).filter(
    (canvas) => canvas.style.display !== 'none' && canvas.width > 0
  );
  let brightest = 0;

  shown.forEach((canvas) => {
    const { data } = canvas
      .getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height);

    for (let index = 0; index < data.length; index += 4) {
      brightest = Math.max(brightest, data[index]);
    }
  });

  return brightest;
}

/** Fills every canvas of the viewport that is shown with black. */
function blankShownCanvases(element) {
  Array.from(element.querySelectorAll('canvas'))
    .filter((canvas) => canvas.style.display !== 'none' && canvas.width > 0)
    .forEach((canvas) => {
      const context = canvas.getContext('2d');

      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
    });
}

/** Waits for the given number of animation frames. */
async function waitForFrames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Waits until the draws that a draw asks for have come: the frames of the
 * rendering engine and the draw of the CPU path at rest.
 */
async function waitForDraws() {
  await new Promise((resolve) =>
    setTimeout(resolve, 3 * SAMPLED_SLICE_REST_DELAY_MS)
  );
  await waitForFrames(3);
}

/**
 * Enables a planar viewport `withoutWebGL` in the engine, mounts the stack
 * of `createImageIds`, and waits for its draws. Gives the element.
 */
async function showStackWithoutWebGL(engine) {
  const element = createElement();

  engine.enableElement({
    viewportId: 'withoutWebGL',
    type: ViewportType.PLANAR,
    element,
    defaultOptions: { background: [0, 0, 0] },
  });

  const viewport = engine.getViewport('withoutWebGL');
  const mounted = new Promise((resolve) => {
    element.addEventListener(Events.IMAGE_RENDERED, resolve, { once: true });
  });

  utilities.genericViewportDisplaySetMetadataProvider.add(
    'withoutWebGL:stack',
    { kind: 'planar', imageIds: createImageIds(), initialImageIdIndex: 0 }
  );
  await viewport.setDisplaySets({ displaySetId: 'withoutWebGL:stack' });
  await mounted;
  await waitForDraws();

  return element;
}

describe('A planar viewport on a device without WebGL -- ', () => {
  let webGL;
  let engine;
  let renderWindowSpy;

  beforeEach(() => {
    window.devicePixelRatio = 1;
    webGL = removeWebGL();
    initAgain();
    webGL.counter.webGLContexts = 0;
    renderWindowSpy = spyOn(
      vtkStreamingOpenGLRenderWindow,
      'newInstance'
    ).and.callThrough();
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
  });

  afterEach(() => {
    engine?.destroy();
    engine = undefined;
    utilities.genericViewportDisplaySetMetadataProvider.clear();
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    document.body.innerHTML = '';
    webGL.restore();
    initAgain();
  });

  ENGINES.forEach(({ name, Engine }) => {
    it(`is enabled and draws a stack on the CPU in ${name}, with no WebGL context and no OpenGL render window`, async () => {
      expect(isWebGLUnavailable()).toBe(true);

      engine = new Engine(`withoutWebGL:${Engine.name}`);

      const element = createElement();

      engine.enableElement({
        viewportId: 'withoutWebGL',
        type: ViewportType.PLANAR,
        element,
        defaultOptions: { background: [0, 0, 0] },
      });

      const viewport = engine.getViewport('withoutWebGL');
      const rendered = new Promise((resolve) => {
        element.addEventListener(Events.IMAGE_RENDERED, resolve, {
          once: true,
        });
      });

      utilities.genericViewportDisplaySetMetadataProvider.add(
        'withoutWebGL:stack',
        {
          kind: 'planar',
          imageIds: createImageIds(),
          initialImageIdIndex: 0,
        }
      );
      await viewport.setDisplaySets({ displaySetId: 'withoutWebGL:stack' });
      await rendered;

      expect(
        viewport.getRenderPlan().map(({ draw, renderMode }) => ({
          draw,
          renderMode,
        }))
      ).toEqual([{ draw: 'cpu', renderMode: 'cpuImage' }]);
      expect(brightestShownValue(element)).toBeGreaterThan(0);
      expect(webGL.counter.webGLContexts).toBe(0);
      expect(renderWindowSpy).not.toHaveBeenCalled();
    });

    it(`draws on the CPU and fires one IMAGE_RENDERED for each render that ${name} is asked for`, async () => {
      engine = new Engine(`withoutWebGLRender:${Engine.name}`);

      const element = await showStackWithoutWebGL(engine);
      let renderedEvents = 0;

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        renderedEvents++;
      });

      const renders = [
        ['renderViewport', () => engine.renderViewport('withoutWebGL')],
        ['render', () => engine.render()],
        ['renderViewports', () => engine.renderViewports(['withoutWebGL'])],
      ];
      const results = [];

      for (const [label, renderWithEngine] of renders) {
        blankShownCanvases(element);
        renderedEvents = 0;
        renderWithEngine();
        await waitForDraws();
        results.push({
          label,
          renderedEvents,
          drawn: brightestShownValue(element) > 0,
        });
      }

      expect(results).toEqual(
        renders.map(([label]) => ({ label, renderedEvents: 1, drawn: true }))
      );
      expect(webGL.counter.webGLContexts).toBe(0);
    });

    it(`draws again when a one-shot IMAGE_RENDERED listener asks ${name} for a render`, async () => {
      engine = new Engine(`withoutWebGLListener:${Engine.name}`);

      const element = await showStackWithoutWebGL(engine);
      let renderedEvents = 0;

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        renderedEvents++;
      });
      element.addEventListener(
        Events.IMAGE_RENDERED,
        () => engine.renderViewport('withoutWebGL'),
        { once: true }
      );
      engine.renderViewport('withoutWebGL');
      await waitForDraws();

      expect(renderedEvents).toBe(2);
      expect(webGL.counter.webGLContexts).toBe(0);
    });

    it(`draws the picture again in the frame of ${name} after it resizes the viewport`, async () => {
      engine = new Engine(`withoutWebGLResize:${Engine.name}`);

      const element = await showStackWithoutWebGL(engine);
      let renderedEvents = 0;

      element.addEventListener(Events.IMAGE_RENDERED, () => {
        renderedEvents++;
      });
      element.style.width = '96px';
      element.style.height = '96px';
      engine.resize();
      await waitForFrames(2);

      expect({
        renderedEvents,
        drawn: brightestShownValue(element) > 0,
        canvasSizes: Array.from(element.querySelectorAll('canvas'))
          .filter((canvas) => canvas.style.display !== 'none')
          .map(({ width, height }) => [width, height]),
      }).toEqual({ renderedEvents: 1, drawn: true, canvasSizes: [[96, 96]] });
      expect(webGL.counter.webGLContexts).toBe(0);
    });
  });
});
