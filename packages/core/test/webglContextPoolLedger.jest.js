import WebGLContextPool from '../src/RenderingEngine/WebGLContextPool';
import {
  getGpuMemoryByKind,
  resetGpuMemoryLedger,
} from '../src/utilities/gpuMemoryLedger';

jest.mock('../src/RenderingEngine/vtkClasses', () => ({
  vtkOffscreenMultiRenderWindow: {
    newInstance: () => ({
      setContainer: jest.fn(),
      delete: jest.fn(),
    }),
  },
}));

jest.mock('../src/RenderingEngine/helpers/attachWebGLContextEvents', () => ({
  attachWebGLContextEvents: jest.fn(),
}));

/** The render buffer of one context holds 8 bytes for each pixel. */
const RENDER_BUFFER_BYTES_PER_PIXEL = 8;

describe('the GPU memory ledger of the context pool', () => {
  beforeEach(() => resetGpuMemoryLedger());

  it('follows the remaining viewports, keeps the charge when none remain, and drops it on destroy', () => {
    const pool = new WebGLContextPool(1);

    pool.assignViewportToContext('large', 0);
    pool.updateViewportSize('large', 1000, 1000);
    pool.assignViewportToContext('small', 0);
    pool.updateViewportSize('small', 100, 100);

    expect(getGpuMemoryByKind().renderBuffer).toBe(
      1000 * 1000 * RENDER_BUFFER_BYTES_PER_PIXEL
    );

    /** The engine fits the offscreen canvas to the viewport that remains. */
    pool.removeViewport('large');

    const small = 100 * 100 * RENDER_BUFFER_BYTES_PER_PIXEL;

    expect(getGpuMemoryByKind().renderBuffer).toBe(small);

    /** With no viewport left, the engine leaves the canvas as it is. */
    pool.removeViewport('small');

    expect(getGpuMemoryByKind().renderBuffer).toBe(small);
    expect(getGpuMemoryByKind().canvas).toBe(0);

    pool.destroy();

    expect(getGpuMemoryByKind().renderBuffer).toBe(0);
  });

  it('lowers the charge when the viewports shrink', () => {
    const pool = new WebGLContextPool(1);

    pool.assignViewportToContext('a', 0);
    pool.updateViewportSize('a', 1000, 1000);
    pool.updateViewportSize('a', 500, 500);

    expect(getGpuMemoryByKind().renderBuffer).toBe(
      500 * 500 * RENDER_BUFFER_BYTES_PER_PIXEL
    );

    pool.destroy();
  });
});
