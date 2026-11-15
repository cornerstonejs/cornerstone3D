import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import copyWebGLCanvasToCanvas from '../src/RenderingEngine/helpers/copyWebGLCanvasToCanvas';
import {
  detectRenderingCapabilities,
  getRenderingCapabilities,
  resetRenderingCapabilities,
} from '../src/utilities/renderingCapabilities';
import { getSupportedTextureFormats } from '../src/utilities/textureSupport';

jest.mock('../src/utilities/textureSupport', () => ({
  getSupportedTextureFormats: jest.fn(),
}));

const FRAMEBUFFER_BINDING = 0x8ca6;
const FRAMEBUFFER = 0x8d40;
const MAX_TEXTURE_SIZE = 0x0d33;
const RENDERER = 0x1f01;
const PROBE_COLOR = [64, 128, 192, 255];

/**
 * A WebGL context that returns the given rows from `readPixels`, the first
 * row being the bottom row of the drawing buffer, as WebGL returns them.
 */
function createFakeGL({
  rowsFromBottom,
  drawingBufferHeight,
  boundFramebuffer = null,
  premultipliedAlpha = true,
  lost = false,
}) {
  return {
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER,
    FRAMEBUFFER_BINDING,
    drawingBufferHeight,
    isContextLost: () => lost,
    getParameter: jest.fn((parameter) =>
      parameter === FRAMEBUFFER_BINDING ? boundFramebuffer : null
    ),
    bindFramebuffer: jest.fn(),
    getContextAttributes: () => ({ premultipliedAlpha }),
    readPixels: jest.fn((x, y, width, height, format, type, pixels) => {
      rowsFromBottom.forEach((row, rowIndex) => {
        pixels.set(row, rowIndex * width * 4);
      });
    }),
  };
}

function createFake2DContext() {
  return {
    createImageData: (width, height) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: jest.fn(),
    drawImage: jest.fn(),
  };
}

describe('copyWebGLCanvasToCanvas', () => {
  const scratchContext = createFake2DContext();
  let getContextSpy;

  function setCapabilities(webgl, webglCanvasCopy) {
    const gl = {
      MAX_TEXTURE_SIZE,
      RENDERER,
      getParameter: (parameter) =>
        parameter === MAX_TEXTURE_SIZE ? 4096 : 'Test renderer',
      getExtension: () => null,
      clearColor: () => undefined,
      clear: () => undefined,
      COLOR_BUFFER_BIT: 0x4000,
    };
    const probeContext = {
      drawImage: () => undefined,
      getImageData: () => ({
        data: webglCanvasCopy ? PROBE_COLOR : [0, 0, 0, 0],
      }),
    };

    getContextSpy?.mockRestore();
    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((type) => {
        if (type === 'webgl2') {
          return webgl ? gl : null;
        }

        return type === '2d' ? probeContext : null;
      });
    resetRenderingCapabilities();
    getRenderingCapabilities();
    getContextSpy.mockImplementation((type) =>
      type === '2d' ? scratchContext : null
    );
  }

  beforeEach(() => {
    window.localStorage.clear();
    getSupportedTextureFormats.mockReset();
    getSupportedTextureFormats.mockReturnValue({});
    scratchContext.putImageData.mockClear();
  });

  afterEach(() => {
    getContextSpy?.mockRestore();
    getContextSpy = undefined;
    resetRenderingCapabilities({ clearStorage: true });
  });

  it('measures that drawImage copies a WebGL canvas', () => {
    setCapabilities(true, true);

    expect(getRenderingCapabilities().webglCanvasCopy).toBe(true);
  });

  it('measures that drawImage hands back an empty picture', () => {
    setCapabilities(true, false);

    expect(getRenderingCapabilities().webglCanvasCopy).toBe(false);
  });

  it('reports no canvas copy without WebGL', () => {
    setCapabilities(false, true);

    expect(detectRenderingCapabilities()).toMatchObject({
      webgl: false,
      webglCanvasCopy: false,
    });
  });

  it('uses drawImage with the same arguments when the copy works', () => {
    setCapabilities(true, true);

    const target = { drawImage: jest.fn() };
    const source = { getContext: jest.fn() };

    copyWebGLCanvasToCanvas(target, source, 1, 2, 3, 4, 5, 6, 7, 8);

    expect(target.drawImage).toHaveBeenCalledWith(
      source,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8
    );
    expect(source.getContext).not.toHaveBeenCalled();
  });

  it('uses drawImage when there is no WebGL at all', () => {
    setCapabilities(false, false);

    const target = { drawImage: jest.fn() };
    const source = { getContext: jest.fn() };

    copyWebGLCanvasToCanvas(target, source, 0, 0, 2, 2, 0, 0, 2, 2);

    expect(target.drawImage).toHaveBeenCalledWith(
      source,
      0,
      0,
      2,
      2,
      0,
      0,
      2,
      2
    );
    expect(source.getContext).not.toHaveBeenCalled();
  });

  it('reads the pixels back, turns the rows around and draws them', () => {
    setCapabilities(true, false);

    const bottomRow = [10, 0, 0, 255, 20, 0, 0, 255];
    const topRow = [30, 0, 0, 255, 40, 0, 0, 255];
    const gl = createFakeGL({
      rowsFromBottom: [bottomRow, topRow],
      drawingBufferHeight: 10,
    });
    const target = { drawImage: jest.fn() };
    const source = { getContext: (type) => (type === 'webgl2' ? gl : null) };

    copyWebGLCanvasToCanvas(target, source, 3, 4, 2, 2, 5, 6, 20, 30);

    expect(gl.readPixels).toHaveBeenCalledWith(
      3,
      4,
      2,
      2,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      expect.any(Uint8Array)
    );
    expect(gl.bindFramebuffer).not.toHaveBeenCalled();

    const [imageData] = scratchContext.putImageData.mock.calls[0];

    expect(Array.from(imageData.data)).toEqual([...topRow, ...bottomRow]);
    expect(target.drawImage).toHaveBeenCalledTimes(1);

    const [scratchCanvas, ...rectangle] = target.drawImage.mock.calls[0];

    expect(scratchCanvas).toBeInstanceOf(HTMLCanvasElement);
    expect([scratchCanvas.width, scratchCanvas.height]).toEqual([2, 2]);
    expect(rectangle).toEqual([0, 0, 2, 2, 5, 6, 20, 30]);
  });

  it('divides a half clear pixel by its alpha', () => {
    setCapabilities(true, false);

    const gl = createFakeGL({
      rowsFromBottom: [[100, 50, 0, 128, 0, 0, 0, 0]],
      drawingBufferHeight: 1,
    });
    const target = { drawImage: jest.fn() };
    const source = { getContext: () => gl };

    copyWebGLCanvasToCanvas(target, source, 0, 0, 2, 1, 0, 0, 2, 1);

    const [imageData] = scratchContext.putImageData.mock.calls[0];

    expect(Array.from(imageData.data)).toEqual([199, 100, 0, 128, 0, 0, 0, 0]);
  });

  it('keeps the colours of a context that does not multiply by alpha', () => {
    setCapabilities(true, false);

    const gl = createFakeGL({
      rowsFromBottom: [[100, 50, 0, 128]],
      drawingBufferHeight: 1,
      premultipliedAlpha: false,
    });
    const target = { drawImage: jest.fn() };
    const source = { getContext: () => gl };

    copyWebGLCanvasToCanvas(target, source, 0, 0, 1, 1, 0, 0, 1, 1);

    const [imageData] = scratchContext.putImageData.mock.calls[0];

    expect(Array.from(imageData.data)).toEqual([100, 50, 0, 128]);
  });

  it('reads from the canvas and puts a bound framebuffer back', () => {
    setCapabilities(true, false);

    const framebuffer = { id: 'framebuffer' };
    const gl = createFakeGL({
      rowsFromBottom: [[1, 2, 3, 255]],
      drawingBufferHeight: 1,
      boundFramebuffer: framebuffer,
    });
    const target = { drawImage: jest.fn() };
    const source = { getContext: () => gl };

    copyWebGLCanvasToCanvas(target, source, 0, 0, 1, 1, 0, 0, 1, 1);

    expect(gl.bindFramebuffer.mock.calls).toEqual([
      [FRAMEBUFFER, null],
      [FRAMEBUFFER, framebuffer],
    ]);
  });

  it('falls back to drawImage when the pixels cannot be read', () => {
    setCapabilities(true, false);

    const target = { drawImage: jest.fn() };
    const lostSource = {
      getContext: () =>
        createFakeGL({
          rowsFromBottom: [],
          drawingBufferHeight: 1,
          lost: true,
        }),
    };
    const plainSource = { getContext: () => null };

    copyWebGLCanvasToCanvas(target, lostSource, 0, 0, 1, 1, 0, 0, 1, 1);
    copyWebGLCanvasToCanvas(target, plainSource, 0, 0, 1, 1, 0, 0, 1, 1);

    expect(target.drawImage.mock.calls).toEqual([
      [lostSource, 0, 0, 1, 1, 0, 0, 1, 1],
      [plainSource, 0, 0, 1, 1, 0, 0, 1, 1],
    ]);
    expect(scratchContext.putImageData).not.toHaveBeenCalled();
  });
});
