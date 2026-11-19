import { describe, it, expect, jest, afterEach } from '@jest/globals';
import vtkStreamingOpenGLTexture from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLTexture';
import {
  attachWebGLContextEvents,
  isWebGLContextLost,
  releaseLostContextResources,
} from '../src/RenderingEngine/helpers/attachWebGLContextEvents';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import WebGLContextPool from '../src/RenderingEngine/WebGLContextPool';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';
import ViewportType from '../src/enums/ViewportType';

const VOLUME_ID = 'webglContextRestore:volume';

jest.mock('../src/RenderingEngine/vtkClasses', () => {
  const actual = jest.requireActual('../src/RenderingEngine/vtkClasses');

  return {
    ...actual,
    vtkOffscreenMultiRenderWindow: {
      newInstance: () => {
        const canvas = globalThis.document.createElement('canvas');
        const openGLRenderWindow = {
          getCanvas: () => canvas,
          getContext: () => null,
          getInitialized: () => false,
          isDeleted: () => false,
        };

        return {
          getOpenGLRenderWindow: () => openGLRenderWindow,
          setContainer: () => undefined,
          delete: () => undefined,
        };
      },
    },
  };
});

function fakeGl() {
  return {
    isContextLost: jest.fn(() => false),
    deleteTexture: jest.fn(),
    activeTexture: jest.fn(),
    TEXTURE0: 0,
  };
}

function fakeOpenGLRenderWindow({ initialized = true, canvas } = {}) {
  const gl = fakeGl();
  const children = [{ id: 'renderer-node-1' }, { id: 'renderer-node-2' }];
  const forwardPass = { isA: (name) => name === 'vtkForwardPass' };
  const customPass = { isA: () => false };
  const window = {
    gl,
    children,
    forwardPass,
    customPass,
    passes: [forwardPass, customPass],
    getCanvas: () => canvas,
    getContext: () => gl,
    getInitialized: jest.fn(() => initialized),
    setInitialized: jest.fn(),
    isDeleted: () => false,
    releaseGraphicsResources: jest.fn(),
    getChildren: () => children,
    removeNode: jest.fn((child) => {
      children.splice(children.indexOf(child), 1);

      return true;
    }),
    getRenderPasses: () => window.passes,
    setRenderPasses: jest.fn((passes) => {
      window.passes = passes;

      return true;
    }),
    activateTexture: jest.fn(),
    deactivateTexture: jest.fn(),
  };

  return window;
}

function fakeOffscreen(openGLRenderWindow) {
  return { getOpenGLRenderWindow: () => openGLRenderWindow };
}

function uploadedTexture(openGLRenderWindow) {
  return vtkStreamingOpenGLTexture.newInstance({
    handle: 7,
    context: openGLRenderWindow.gl,
    _openGLRenderWindow: openGLRenderWindow,
    width: 4,
    height: 4,
    depth: 3,
    allocatedGPUMemoryInBytes: 96,
  });
}

function provisionTextureSet(texture) {
  return volumeTextureStore.provision({
    volumeId: VOLUME_ID,
    name: 'full',
    volumeGrid: {
      dimensions: [4, 4, 3],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    },
    grids: [
      {
        dimensions: [4, 4, 3],
        spacing: [1, 1, 1],
        origin: [0, 0, 0],
        direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      },
    ],
    createTexture: () => texture,
  });
}

afterEach(() => {
  volumeTextureStore.evictVolume(VOLUME_ID);
});

describe('streaming texture after a context restore', () => {
  it('drops the storage of its own window, so the next build allocates and refills it', () => {
    const openGLRenderWindow = fakeOpenGLRenderWindow();
    const texture = uploadedTexture(openGLRenderWindow);

    expect(texture.releaseLostContextResources(openGLRenderWindow)).toBe(true);
    expect(texture.getHandle()).toBe(0);
    expect(texture.getAllocatedGPUMemoryInBytes()).toBe(0);
    expect(texture.getTextureParameters().width).toBe(0);
    expect(openGLRenderWindow.gl.deleteTexture).toHaveBeenCalledWith(7);
  });

  it('keeps the storage that it holds in another window', () => {
    const openGLRenderWindow = fakeOpenGLRenderWindow();
    const texture = uploadedTexture(openGLRenderWindow);

    expect(texture.releaseLostContextResources(fakeOpenGLRenderWindow())).toBe(
      false
    );
    expect(texture.getHandle()).toBe(7);
    expect(texture.getAllocatedGPUMemoryInBytes()).toBe(96);
  });
});

describe('releaseLostContextResources', () => {
  it('drops the GL objects of the window and the streaming textures it holds', () => {
    const openGLRenderWindow = fakeOpenGLRenderWindow();
    const otherWindow = fakeOpenGLRenderWindow();
    const texture = uploadedTexture(openGLRenderWindow);
    const otherTexture = uploadedTexture(otherWindow);

    provisionTextureSet(texture);
    volumeTextureStore.provision({
      volumeId: VOLUME_ID,
      name: 'other',
      volumeGrid: {
        dimensions: [4, 4, 3],
        spacing: [1, 1, 1],
        origin: [0, 0, 0],
        direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      },
      grids: [
        {
          dimensions: [4, 4, 3],
          spacing: [1, 1, 1],
          origin: [0, 0, 0],
          direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        },
      ],
      createTexture: () => otherTexture,
    });

    releaseLostContextResources(fakeOffscreen(openGLRenderWindow));

    expect(texture.getHandle()).toBe(0);
    expect(otherTexture.getHandle()).toBe(7);
    expect(openGLRenderWindow.releaseGraphicsResources).toHaveBeenCalledTimes(
      1
    );
    expect(openGLRenderWindow.removeNode).toHaveBeenCalledTimes(2);
    expect(openGLRenderWindow.children).toEqual([]);
    expect(openGLRenderWindow.passes[0]).not.toBe(
      openGLRenderWindow.forwardPass
    );
    expect(openGLRenderWindow.passes[0].isA('vtkForwardPass')).toBe(true);
    expect(openGLRenderWindow.passes[1]).toBe(openGLRenderWindow.customPass);
    expect(openGLRenderWindow.setInitialized).toHaveBeenCalledWith(false);
  });

  it('does nothing for a window that never drew', () => {
    const openGLRenderWindow = fakeOpenGLRenderWindow({ initialized: false });

    releaseLostContextResources(fakeOffscreen(openGLRenderWindow));

    expect(openGLRenderWindow.releaseGraphicsResources).not.toHaveBeenCalled();
    expect(openGLRenderWindow.removeNode).not.toHaveBeenCalled();
    expect(openGLRenderWindow.setInitialized).not.toHaveBeenCalled();
  });
});

describe('attachWebGLContextEvents', () => {
  it('drops the GL objects, fires the event and asks for a render on every restore', () => {
    const canvas = document.createElement('canvas');
    const openGLRenderWindow = fakeOpenGLRenderWindow({ canvas });
    const texture = uploadedTexture(openGLRenderWindow);
    const onContextRestored = jest.fn();
    const restoredEvents = [];
    const lostEvents = [];
    const onRestoredEvent = (evt) => restoredEvents.push(evt.detail);
    const onLostEvent = (evt) => lostEvents.push(evt.detail);

    provisionTextureSet(texture);
    eventTarget.addEventListener(
      Events.WEBGL_CONTEXT_RESTORED,
      onRestoredEvent
    );
    eventTarget.addEventListener(Events.WEBGL_CONTEXT_LOST, onLostEvent);

    const detach = attachWebGLContextEvents(
      fakeOffscreen(openGLRenderWindow),
      'engine-1',
      2,
      onContextRestored
    );

    canvas.dispatchEvent(new Event('webglcontextlost'));

    expect(lostEvents).toEqual([
      { renderingEngineId: 'engine-1', contextIndex: 2 },
    ]);
    expect(onContextRestored).not.toHaveBeenCalled();
    expect(texture.getHandle()).toBe(7);

    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(texture.getHandle()).toBe(0);
    expect(restoredEvents).toEqual([
      { renderingEngineId: 'engine-1', contextIndex: 2 },
    ]);
    expect(onContextRestored).toHaveBeenCalledTimes(1);

    canvas.dispatchEvent(new Event('webglcontextlost'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(onContextRestored).toHaveBeenCalledTimes(2);
    expect(openGLRenderWindow.releaseGraphicsResources).toHaveBeenCalledTimes(
      2
    );

    detach();
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(onContextRestored).toHaveBeenCalledTimes(2);
    expect(restoredEvents).toHaveLength(2);

    eventTarget.removeEventListener(
      Events.WEBGL_CONTEXT_RESTORED,
      onRestoredEvent
    );
    eventTarget.removeEventListener(Events.WEBGL_CONTEXT_LOST, onLostEvent);
  });

  it('reads the lost state from the context of the window', () => {
    const openGLRenderWindow = fakeOpenGLRenderWindow();

    expect(isWebGLContextLost(fakeOffscreen(openGLRenderWindow))).toBe(false);

    openGLRenderWindow.gl.isContextLost.mockReturnValue(true);

    expect(isWebGLContextLost(fakeOffscreen(openGLRenderWindow))).toBe(true);
    expect(isWebGLContextLost(undefined)).toBe(false);
    expect(isWebGLContextLost(fakeOffscreen({ getContext: () => null }))).toBe(
      false
    );
  });
});

describe('WebGLContextPool', () => {
  it('reports the index of a restored context until it is destroyed', () => {
    const onContextRestored = jest.fn();
    const pool = new WebGLContextPool(2, 'engine-1', onContextRestored);
    const canvas = pool
      .getContextByIndex(1)
      .context.getOpenGLRenderWindow()
      .getCanvas();

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(onContextRestored.mock.calls).toEqual([[1], [1]]);

    pool.destroy();
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(onContextRestored).toHaveBeenCalledTimes(2);
  });
});

function contextPoolEngineStub({
  hasBeenDestroyed = false,
  lostContexts = [],
} = {}) {
  const viewports = [
    { id: 'stack-a', type: ViewportType.PLANAR_NEXT },
    { id: 'planar-b', type: ViewportType.PLANAR_NEXT },
    { id: 'stack-c', type: ViewportType.PLANAR_NEXT },
    { id: 'video-d', type: ViewportType.VIDEO_NEXT },
  ].map((viewport) => ({
    ...viewport,
    getUseCustomRenderingPipeline: () =>
      viewport.type === ViewportType.VIDEO_NEXT,
  }));
  const contextOf = { 'stack-a': 0, 'planar-b': 0, 'stack-c': 1 };
  const windows = [0, 1].map((index) =>
    fakeOffscreen({
      getContext: () => ({ isContextLost: () => lostContexts.includes(index) }),
    })
  );

  return {
    hasBeenDestroyed,
    viewports,
    renderViewports: jest.fn(),
    _getViewportsAsArray: () => viewports,
    contextPool: {
      getContextIndexForViewport: (id) => contextOf[id],
      getContextByIndex: (index) =>
        windows[index] ? { context: windows[index] } : null,
    },
  };
}

describe('ContextPoolRenderingEngine after a context restore', () => {
  const renderRestored = (engine, contextIndex) =>
    ContextPoolRenderingEngine.prototype._renderViewportsOfRestoredContext.call(
      engine,
      contextIndex
    );

  it('renders once the viewports that draw through that context', () => {
    const engine = contextPoolEngineStub();

    renderRestored(engine, 0);

    expect(engine.renderViewports).toHaveBeenCalledTimes(1);
    expect(engine.renderViewports).toHaveBeenCalledWith([
      'stack-a',
      'planar-b',
    ]);

    renderRestored(engine, 1);

    expect(engine.renderViewports).toHaveBeenLastCalledWith(['stack-c']);
  });

  it('renders nothing once destroyed', () => {
    const engine = contextPoolEngineStub({ hasBeenDestroyed: true });

    renderRestored(engine, 0);

    expect(engine.renderViewports).not.toHaveBeenCalled();
  });

  it('holds back the viewports of a lost context only', () => {
    const engine = contextPoolEngineStub({ lostContexts: [0] });
    const isLost = (viewport) =>
      ContextPoolRenderingEngine.prototype._isViewportContextLost.call(
        engine,
        viewport
      );

    expect(engine.viewports.map(isLost)).toEqual([true, true, false, false]);
  });
});

describe('TiledRenderingEngine after a context restore', () => {
  const renderRestored = (engine) =>
    TiledRenderingEngine.prototype._renderViewportsOfRestoredContext.call(
      engine
    );

  it('renders once every viewport that vtk.js draws', () => {
    const engine = contextPoolEngineStub();

    renderRestored(engine);

    expect(engine.renderViewports).toHaveBeenCalledTimes(1);
    expect(engine.renderViewports).toHaveBeenCalledWith([
      'stack-a',
      'planar-b',
      'stack-c',
    ]);
  });

  it('renders nothing once destroyed', () => {
    const engine = contextPoolEngineStub({ hasBeenDestroyed: true });

    renderRestored(engine);

    expect(engine.renderViewports).not.toHaveBeenCalled();
  });
});
