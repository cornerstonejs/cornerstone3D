import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import supportsNorm16LinearCached from '@kitware/vtk.js/Rendering/OpenGL/Texture/supportsNorm16Linear';
import { Events, ViewportType } from '../src/enums';
import { init, resetInitialization } from '../src/init';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import { createPlanarLoadingUpdates } from '../src/RenderingEngine/Viewports/Planar/planarLoadingUpdates';
import { inBackgroundTask } from '../src/utilities/whenIdle';
import { create2DStandIn, createWebGL2StandIn } from './utils/webglStandIn';

/**
 * Row 359 (lane FX27): the frame of a rendering engine runs the tasks given
 * to `runBeforeNextRender` before it draws, so that a loading update and the
 * render it asks for are one frame, not two; `prepareViewport` draws a
 * viewport into its context without showing it, so that vtk.js builds what it
 * draws before the frame that shows it; an engine made on a WebGL device runs
 * the norm16 probe of vtk.js in its first idle period, not at the first
 * texture that a viewport draws.
 */

jest.mock(
  '@kitware/vtk.js/Rendering/OpenGL/Texture/supportsNorm16Linear',
  () => ({
    __esModule: true,
    default: jest.fn(() => true),
  })
);

const mockProfile = { norm16: true };

jest.mock('../src/utilities/renderingCapabilities', () => {
  const actual = jest.requireActual('../src/utilities/renderingCapabilities');

  return {
    ...actual,
    getRenderingCapabilities: () => ({
      webgl: true,
      maxTextureSize: 4096,
      max3DTextureSize: 2048,
      renderer: 'WebGL 2.0 stand-in',
      softwareRasterizer: false,
      webglCanvasCopy: true,
      norm16: mockProfile.norm16,
      norm16Linear: mockProfile.norm16,
      float: true,
      floatLinear: true,
      halfFloat: true,
      halfFloatLinear: true,
    }),
  };
});

const SIZE = 64;
const engines = [];

/** Waits for the given number of animation frames. */
async function frames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Lets the tasks that wait for an idle period run. */
async function idleTasks() {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  mockProfile.norm16 = true;
  supportsNorm16LinearCached.mockClear();
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (type) {
      if (type === '2d') {
        this.standIn2D ||= create2DStandIn(this);

        return this.standIn2D;
      }

      this.glCalls ||= {};
      this.standInGL ||= createWebGL2StandIn(this, this.glCalls);

      return this.standInGL;
    });
  ['clientWidth', 'clientHeight'].forEach((key) =>
    jest
      .spyOn(HTMLCanvasElement.prototype, key, 'get')
      .mockImplementation(() => SIZE)
  );
  resetInitialization();
  init();
});

afterEach(() => {
  engines.splice(0).forEach((engine) => {
    if (!engine.hasBeenDestroyed) {
      engine.destroy();
    }
  });
  document.body.innerHTML = '';
  jest.restoreAllMocks();
  resetInitialization();
});

/** An element of SIZE by SIZE pixels in the document. */
function createElement() {
  const element = document.createElement('div');

  ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight'].forEach(
    (key) => Object.defineProperty(element, key, { value: SIZE })
  );
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: SIZE,
    bottom: SIZE,
    width: SIZE,
    height: SIZE,
  });
  document.body.appendChild(element);

  return element;
}

/**
 * An engine with one planar viewport, after the frames of its set up, and
 * what happens next in order: 'drawn' for each draw of the viewport by the
 * engine, 'rendered' for each `IMAGE_RENDERED` of its element.
 */
async function createEngine(Engine, name) {
  const element = createElement();
  const engine = new Engine(name);
  const viewportId = `${name}-viewport`;
  const order = [];

  engines.push(engine);
  engine.setViewports([{ viewportId, type: ViewportType.PLANAR, element }]);
  await frames(2);
  element.addEventListener(Events.IMAGE_RENDERED, () => order.push('rendered'));

  const draw = engine.renderViewportUsingCustomOrVtkPipeline.bind(engine);

  jest
    .spyOn(engine, 'renderViewportUsingCustomOrVtkPipeline')
    .mockImplementation((viewport) => {
      order.push('drawn');

      return draw(viewport);
    });

  return { engine, element, viewportId, order };
}

/** The draws of a viewport in the order of what happened. */
const draws = (order) => order.filter((step) => step !== 'rendered');

describe.each([
  ['the context pool engine', ContextPoolRenderingEngine],
  ['the tiled engine', TiledRenderingEngine],
])('The frame of %s', (name, Engine) => {
  it('runs a task given before it at its start, and draws in that frame a viewport that the task flags', async () => {
    const { engine, viewportId, order } = await createEngine(
      Engine,
      `${name}-task`
    );

    engine.runBeforeNextRender(() => {
      order.push('task');
      engine.renderViewport(viewportId);
    });
    await frames(1);

    expect(draws(order)).toEqual(['task', 'drawn']);
  });

  it('drops a cancelled task, and draws nothing in a frame that only ran tasks', async () => {
    const { engine, order } = await createEngine(Engine, `${name}-cancel`);
    const cancelled = jest.fn();
    const kept = jest.fn();
    const cancel = engine.runBeforeNextRender(cancelled);

    engine.runBeforeNextRender(kept);
    cancel();
    await frames(2);

    expect(cancelled).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
    expect(order).toEqual([]);
  });

  it('goes on with the frame after a task that throws', async () => {
    const { engine, viewportId, order } = await createEngine(
      Engine,
      `${name}-throw`
    );

    engine.runBeforeNextRender(() => {
      throw new Error('a failing task');
    });
    engine.runBeforeNextRender(() => engine.renderViewport(viewportId));
    await frames(1);
    engine.renderViewport(viewportId);
    await frames(1);

    expect(draws(order)).toEqual(['drawn', 'drawn']);
  });
});

describe('prepareViewport of the context pool engine', () => {
  it('draws a viewport into its context, without the copy to its canvas and without an event', async () => {
    const { engine, element, viewportId, order } = await createEngine(
      ContextPoolRenderingEngine,
      'prepare'
    );
    const glCanvas = engine.contextPool
      .getContextByIndex(0)
      .context.getOpenGLRenderWindow()
      .getCanvas();
    const onscreen = engine.getViewport(viewportId).canvas;

    Object.keys(glCanvas.glCalls).forEach(
      (key) => delete glCanvas.glCalls[key]
    );
    onscreen.getContext('2d');

    const drawImage = jest.fn();

    onscreen.standIn2D.drawImage = drawImage;

    expect(engine.prepareViewport(viewportId)).toBe(true);
    await frames(1);

    expect(glCanvas.glCalls.clear?.length).toBeGreaterThan(0);
    expect(drawImage).not.toHaveBeenCalled();
    expect(order).toEqual([]);
    expect(element.isConnected).toBe(true);
    expect(engine.prepareViewport('no-such-viewport')).toBe(false);
  });
});

describe('The norm16 probe of vtk.js', () => {
  it('runs in the first idle period of an engine made on a WebGL device, and not for an engine destroyed before it', async () => {
    const engine = new ContextPoolRenderingEngine('norm16-probe');

    engines.push(engine);

    expect(supportsNorm16LinearCached).not.toHaveBeenCalled();

    await idleTasks();

    expect(supportsNorm16LinearCached).toHaveBeenCalledTimes(1);

    const destroyed = new ContextPoolRenderingEngine('norm16-probe-destroyed');

    destroyed.destroy();
    await idleTasks();

    expect(supportsNorm16LinearCached).toHaveBeenCalledTimes(1);
  });

  it('does not run when norm16 textures are off, as vtk.js then never asks', async () => {
    mockProfile.norm16 = false;

    const engine = new ContextPoolRenderingEngine('norm16-off');

    engines.push(engine);
    await idleTasks();

    expect(supportsNorm16LinearCached).not.toHaveBeenCalled();
  });
});

describe('inBackgroundTask', () => {
  afterEach(() => {
    delete globalThis.scheduler;
    delete globalThis.requestIdleCallback;
  });

  it('posts a task of background priority, which its cancel function aborts', async () => {
    const posted = [];

    globalThis.scheduler = {
      postTask: jest.fn((callback, options) => {
        posted.push({ callback, options });

        return Promise.resolve();
      }),
    };

    const callback = jest.fn();
    const cancel = inBackgroundTask(callback);

    expect(posted).toHaveLength(1);
    expect(posted[0].options.priority).toBe('background');
    expect(posted[0].options.signal.aborted).toBe(false);

    cancel();

    expect(posted[0].options.signal.aborted).toBe(true);
  });

  it('waits for an idle period where the browser has no scheduler, and calls nothing once cancelled', () => {
    const idle = [];

    globalThis.requestIdleCallback = jest.fn((callback) => idle.push(callback));

    const called = jest.fn();
    const cancelled = jest.fn();

    inBackgroundTask(called);
    inBackgroundTask(cancelled)();
    idle.forEach((callback) => callback());

    expect(called).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe('createPlanarLoadingUpdates', () => {
  it('runs its updates at the frame of the scheduler it is given, once for all the requests before it, and cancels there', () => {
    const scheduled = [];
    const cancels = [];
    const scheduleFrame = jest.fn((callback) => {
      scheduled.push(callback);

      const cancel = jest.fn();

      cancels.push(cancel);

      return cancel;
    });
    const update = jest.fn(() => true);
    const updates = createPlanarLoadingUpdates(update, scheduleFrame);

    updates.now();
    updates.now();
    updates.soon();

    expect(scheduleFrame).toHaveBeenCalledTimes(1);

    scheduled[0]();

    expect(update).toHaveBeenCalledTimes(1);

    updates.now();
    updates.cancel();

    expect(scheduleFrame).toHaveBeenCalledTimes(2);
    expect(cancels[1]).toHaveBeenCalledTimes(1);
  });
});
