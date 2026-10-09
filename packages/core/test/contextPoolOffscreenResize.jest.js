// jsdom has no WebGL, so the offscreen multi render window is stubbed and
// only the bookkeeping is exercised: the offscreen container size must always
// match the context's current max size, including after another viewport on
// the same context is removed.
jest.mock('../src/RenderingEngine/vtkClasses', () => ({
  vtkOffscreenMultiRenderWindow: {
    newInstance: jest.fn(() => ({
      setContainer(el) {
        this.container = el;
      },
      resize: jest.fn(),
      addRenderer: jest.fn(),
      getRenderer: jest.fn(),
      getRenderers: () => [],
      removeRenderer: jest.fn(),
      delete: jest.fn(),
    })),
  },
}));

import { init, setUseCPURendering } from '../src/init';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';

init({});
// jsdom reports no WebGL so init() enables CPU rendering; flip it back so the
// engine builds its (mocked) context pool.
setUseCPURendering(false);

function setup() {
  const engine = new ContextPoolRenderingEngine('engine');
  const pool = engine.contextPool;
  const { container, context } = pool.getContextByIndex(0);
  return { engine, pool, container, offscreenMultiRenderWindow: context };
}

describe('ContextPoolRenderingEngine offscreen container sync', () => {
  it('shrinks the offscreen container after a viewport on the same context is removed', () => {
    const { engine, pool, container, offscreenMultiRenderWindow } = setup();

    // Viewport A takes the whole context: container grows to 1900x1000.
    pool.assignViewportToContext('A', 0);
    pool.updateViewportSize('A', 1900, 1000);
    container.width = 1900;
    container.height = 1000;

    // Viewport B shares the context; max stays 1900x1000.
    pool.assignViewportToContext('B', 0);
    pool.updateViewportSize('B', 950, 500);

    // Removing A shrinks the context max to 950x500 but leaves the
    // offscreen container at its stale, larger size.
    pool.removeViewport('A');

    // B's next render must resync the container to the shrunken max.
    const viewportB = { id: 'B', sWidth: 950, sHeight: 500 };
    engine._resizeOffScreenCanvasForViewport(
      viewportB,
      container,
      offscreenMultiRenderWindow
    );

    expect(container.width).toBe(950);
    expect(container.height).toBe(500);
    expect(offscreenMultiRenderWindow.resize).toHaveBeenCalledTimes(1);

    // A further render of B leaves the already-matching container alone.
    engine._resizeOffScreenCanvasForViewport(
      viewportB,
      container,
      offscreenMultiRenderWindow
    );
    expect(offscreenMultiRenderWindow.resize).toHaveBeenCalledTimes(1);
  });

  it('still grows the container when a viewport gets larger', () => {
    const { engine, pool, container, offscreenMultiRenderWindow } = setup();

    // Viewport B was added at 950x500; the container matches the max.
    pool.assignViewportToContext('B', 0);
    pool.updateViewportSize('B', 950, 500);
    container.width = 950;
    container.height = 500;

    // B's element is resized to 1900x1000; its next render grows the
    // container and resizes the render window, as before.
    engine._resizeOffScreenCanvasForViewport(
      { id: 'B', sWidth: 1900, sHeight: 1000 },
      container,
      offscreenMultiRenderWindow
    );

    expect(container.width).toBe(1900);
    expect(container.height).toBe(1000);
    expect(offscreenMultiRenderWindow.resize).toHaveBeenCalledTimes(1);
  });
});
