import { describe, it, expect, jest } from '@jest/globals';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import ViewportType from '../src/enums/ViewportType';

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
