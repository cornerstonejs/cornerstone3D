import { describe, it, expect, jest } from '@jest/globals';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import ViewportType from '../src/enums/ViewportType';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import * as init from '../src/init';

jest.mock('../src/RenderingEngine/helpers/attachWebGLContextEvents', () => ({
  attachWebGLContextEvents: jest.fn(),
}));

/**
 * The offscreen window of one context, whose context is lost or not. Any
 * render step reaches `getRenderer`, `addRenderer` or `getRenderWindow`.
 */
function offscreenWindow(lost) {
  const gl = { isContextLost: () => lost, canvas: {} };
  const openGLRenderWindow = {
    getContext: () => gl,
    get3DContext: jest.fn(() => gl),
  };

  return {
    getOpenGLRenderWindow: () => openGLRenderWindow,
    getRenderer: jest.fn(),
    addRenderer: jest.fn(),
    getRenderers: jest.fn(() => []),
    getRenderWindow: jest.fn(),
  };
}

/** A volume viewport that vtk.js draws, large enough to render. */
const viewport = {
  id: 'viewport',
  type: ViewportType.ORTHOGRAPHIC,
  canvas: { clientWidth: 256, clientHeight: 256 },
  sWidth: 256,
  sHeight: 256,
  getUseCustomRenderingPipeline: () => false,
};

describe('a rendering engine whose WebGL context is lost', () => {
  it('renders nothing in a lost context of the context pool, and does not throw', () => {
    const engine = Object.create(ContextPoolRenderingEngine.prototype);
    const window = offscreenWindow(true);

    engine.contextPool = {};

    expect(
      engine._renderViewportWithContext(viewport, window, {})
    ).toBeUndefined();
    expect(window.addRenderer).not.toHaveBeenCalled();
    expect(window.getRenderWindow).not.toHaveBeenCalled();
  });

  it('draws nothing and copies nothing in a lost context of the tiled engine', () => {
    const engine = Object.create(TiledRenderingEngine.prototype);
    const window = offscreenWindow(true);

    engine.offscreenMultiRenderWindow = window;
    engine._needsRender = new Set([viewport.id]);

    expect(() => engine.performVtkDrawCall()).not.toThrow();
    expect(window.getRenderWindow).not.toHaveBeenCalled();
    expect(
      engine.renderViewportUsingCustomOrVtkPipeline(viewport)
    ).toBeUndefined();
    expect(window.getOpenGLRenderWindow().get3DContext).not.toHaveBeenCalled();
  });
});

/**
 * A render window whose context the browser loses in the middle of the
 * render, as during the upload of a large texture, after which vtk.js throws
 * at the next call that the lost context refuses.
 */
function renderWindowLostDuringRender(
  lostRef,
  error = new Error('shaderSource')
) {
  return {
    getViews: () => [
      { getRenderPasses: () => null, setRenderPasses: jest.fn() },
    ],
    render: jest.fn(() => {
      lostRef.lost = true;
      throw error;
    }),
  };
}

describe('a WebGL context lost in the middle of a render', () => {
  it('ends that render of the context pool quietly, and leaves no renderer drawing', () => {
    const lostRef = { lost: false };
    const gl = { isContextLost: () => lostRef.lost };
    const setDraw = jest.fn();
    const renderer = { setViewport: jest.fn(), setDraw };
    const window = {
      getOpenGLRenderWindow: () => ({ getContext: () => gl }),
      getRenderer: () => renderer,
      getRenderers: () => [{ renderer, id: viewport.id }],
      getRenderWindow: () => renderWindowLostDuringRender(lostRef),
    };
    const engine = Object.create(ContextPoolRenderingEngine.prototype);

    Object.assign(engine, {
      contextPool: {
        getContextIndexForViewport: () => 0,
        getMaxSizeForContext: () => ({ width: 256, height: 256 }),
      },
      getViewportRenderPasses: () => undefined,
      _resizeOffScreenCanvasForViewport: () => undefined,
      getWidgetRenderers: () => new Map(),
    });

    expect(
      engine._renderViewportWithContext(viewport, window, {})
    ).toBeUndefined();
    expect(setDraw).toHaveBeenLastCalledWith(false);
  });

  it('throws on an error of a render whose context is not lost', () => {
    const engine = Object.create(TiledRenderingEngine.prototype);
    const renderWindow = {
      render: () => {
        throw new Error('a real bug');
      },
    };

    engine.offscreenMultiRenderWindow = {
      ...offscreenWindow(false),
      /** A draw needs one renderer, or it returns before the render. */
      getRenderers: () => [
        { renderer: { setDraw: jest.fn() }, id: 'viewport' },
      ],
      getRenderWindow: () => renderWindow,
    };
    engine._needsRender = new Set();

    expect(() => engine.performVtkDrawCall()).toThrow('a real bug');
  });

  it('ends that draw of the tiled engine quietly', () => {
    const lostRef = { lost: false };
    const gl = { isContextLost: () => lostRef.lost };
    const setDraw = jest.fn();
    const renderWindow = renderWindowLostDuringRender(lostRef);
    const engine = Object.create(TiledRenderingEngine.prototype);

    engine.offscreenMultiRenderWindow = {
      getOpenGLRenderWindow: () => ({ getContext: () => gl }),
      getRenderers: () => [{ renderer: { setDraw }, id: 'viewport' }],
      getRenderWindow: () => renderWindow,
    };
    engine._needsRender = new Set(['viewport']);

    expect(() => engine.performVtkDrawCall()).not.toThrow();
    expect(renderWindow.render).toHaveBeenCalled();
    expect(setDraw).toHaveBeenLastCalledWith(false);
  });
});

describe('a rendering engine whose render throws', () => {
  /**
   * An engine of CPU rendering, which needs no WebGL to construct, whose one
   * viewport throws when it renders.
   */
  function engineThatThrows(EngineClass) {
    jest.spyOn(init, 'isCornerstoneInitialized').mockReturnValue(true);
    jest.spyOn(init, 'getShouldUseCPURendering').mockReturnValue(true);

    const engine = new EngineClass(`throwing-${EngineClass.name}`);

    Object.assign(engine, {
      _getViewportsAsArray: () => [viewport],
      _needsRender: new Set([viewport.id]),
      _animationFrameSet: true,
      renderViewportUsingCustomOrVtkPipeline: () => {
        throw new Error('boom');
      },
    });

    return engine;
  }

  it.each([ContextPoolRenderingEngine, TiledRenderingEngine])(
    'allows the next frame after the throw, so %p does not stop rendering',
    (EngineClass) => {
      const engine = engineThatThrows(EngineClass);

      try {
        expect(() => engine._renderFlaggedViewports()).toThrow('boom');
        expect(engine._animationFrameSet).toBe(false);
      } finally {
        renderingEngineCache.delete(engine.id);
        jest.restoreAllMocks();
      }
    }
  );
});
