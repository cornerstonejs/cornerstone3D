import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import BaseRenderingEngine from '../src/RenderingEngine/BaseRenderingEngine';
import WebGLContextPool from '../src/RenderingEngine/WebGLContextPool';
import ViewportType from '../src/enums/ViewportType';

jest.mock('../src/RenderingEngine/vtkClasses', () => ({
  vtkOffscreenMultiRenderWindow: {
    newInstance: () => {
      let container;
      return {
        setContainer: (c) => {
          container = c;
        },
        getContainer: () => container,
        resize: jest.fn(),
        removeRenderer: jest.fn(),
        delete: jest.fn(),
      };
    },
  },
}));

jest.mock('../src/RenderingEngine/helpers/attachWebGLContextEvents', () => ({
  attachWebGLContextEvents: jest.fn(),
}));

/**
 * Builds an engine around a real WebGLContextPool with one context shared by
 * the given viewports, and its offscreen canvas sized as the engine sizes it
 * when the viewports are enabled (the largest of them).
 */
function setUpEngine(viewportSizes) {
  const pool = new WebGLContextPool(1);
  const { context, container } = pool.getContextByIndex(0);

  Object.entries(viewportSizes).forEach(([id, [width, height]]) => {
    pool.assignViewportToContext(id, 0);
    pool.updateViewportSize(id, width, height);
  });
  const maxSize = pool.getMaxSizeForContext(0);
  container.width = maxSize.width;
  container.height = maxSize.height;

  const engine = Object.create(ContextPoolRenderingEngine.prototype);
  engine.contextPool = pool;
  engine.getViewport = (id) =>
    viewportSizes[id] ? { id, type: ViewportType.STACK } : undefined;

  return { engine, pool, context, container };
}

describe('ContextPoolRenderingEngine shared offscreen canvas size', () => {
  beforeEach(() => {
    jest
      .spyOn(BaseRenderingEngine.prototype, 'disableElement')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shrinks the offscreen canvas to the remaining viewports when the largest one is disabled', () => {
    const { engine, context, container } = setUpEngine({
      small: [300, 200],
      other: [320, 180],
      large: [512, 512],
    });
    expect([container.width, container.height]).toEqual([512, 512]);

    engine.disableElement('large');

    expect([container.width, container.height]).toEqual([320, 200]);
    expect(context.resize).toHaveBeenCalledTimes(1);
    expect(context.removeRenderer).toHaveBeenCalledWith('large');
  });

  it('leaves the offscreen canvas alone when the disabled viewport was not the largest', () => {
    const { engine, context, container } = setUpEngine({
      small: [300, 200],
      large: [512, 512],
    });

    engine.disableElement('small');

    expect([container.width, container.height]).toEqual([512, 512]);
    expect(context.resize).not.toHaveBeenCalled();
  });

  it('keeps the offscreen canvas when no viewport is left on the context', () => {
    const { engine, context, container } = setUpEngine({
      large: [512, 512],
    });

    engine.disableElement('large');

    expect([container.width, container.height]).toEqual([512, 512]);
    expect(context.resize).not.toHaveBeenCalled();
  });

  it('fits an oversized offscreen canvas on the next render even when the max size did not change', () => {
    const { engine, pool, context, container } = setUpEngine({
      small: [300, 200],
    });
    // A canvas left larger than the context's max size, e.g. by a viewport
    // removed from the pool without going through disableElement.
    container.width = 512;
    container.height = 512;

    engine._resizeOffScreenCanvasForViewport(
      { id: 'small', sWidth: 300, sHeight: 200 },
      container,
      context
    );

    expect(pool.getMaxSizeForContext(0)).toEqual({ width: 300, height: 200 });
    expect([container.width, container.height]).toEqual([300, 200]);
    expect(context.resize).toHaveBeenCalledTimes(1);
  });
});
