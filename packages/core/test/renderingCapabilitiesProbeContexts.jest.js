import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import {
  detectRenderingCapabilities,
  getRenderingCapabilities,
  resetRenderingCapabilities,
} from '../src/utilities/renderingCapabilities';
import { getSupportedTextureFormats } from '../src/utilities/textureSupport';

jest.mock('../src/utilities/textureSupport', () => ({
  ...jest.requireActual('../src/utilities/textureSupport'),
  getSupportedTextureFormats: jest.fn(),
}));

/**
 * OHIF M100 (lane FX25): `init()` of 6.0 took about 3 ms more than 5.18.3's
 * in its capability probe. The probe opened a WebGL2 context for the
 * renderer string, drew into it and read a 2D copy of it back (the canvas
 * copy check), then ran the texture-format probes, a draw and a read-back
 * per format, which in 6.0 also compare every value read back. `init()` now
 * opens one context for the renderer string and the size limits and
 * releases it; the answers that only a draw path needs, the texture formats
 * (unless stored for the renderer) and `webglCanvasCopy`, are measured at
 * the first read of any of them or in the first idle periods after the
 * profile is made, once, each on a context of its own. The answers do not
 * change.
 */

const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';
const PROBE_COLOR = [64, 128, 192, 255];
const ALL_FORMATS = {
  norm16: true,
  norm16Linear: true,
  float: true,
  floatLinear: true,
  halfFloat: false,
  halfFloatLinear: false,
};

describe('The contexts of the capability probe', () => {
  let made;
  let copied;
  let getContextSpy;
  let idleCallbacks;
  let originalRequestIdleCallback;

  function createFakeGL(canvas) {
    const gl = {
      canvas,
      MAX_TEXTURE_SIZE: 1,
      MAX_3D_TEXTURE_SIZE: 2,
      RENDERER: 3,
      COLOR_BUFFER_BIT: 4,
      lost: 0,
      cleared: 0,
      getParameter: (param) =>
        ({ 1: 16384, 2: 2048, 3: 'Fake GPU', unmasked: 'Fake GPU' })[param],
      getExtension: (name) => {
        if (name === 'WEBGL_debug_renderer_info') {
          return { UNMASKED_RENDERER_WEBGL: 'unmasked' };
        }

        if (name === 'WEBGL_lose_context') {
          return {
            loseContext: () => {
              gl.lost++;
            },
          };
        }

        return null;
      },
      clearColor: jest.fn(),
      clear: () => {
        gl.cleared++;
      },
    };

    return gl;
  }

  beforeEach(() => {
    window.localStorage.clear();
    resetRenderingCapabilities();
    made = { webgl2: [], '2d': [] };
    copied = PROBE_COLOR;
    getSupportedTextureFormats.mockReset();
    getSupportedTextureFormats.mockReturnValue({ ...ALL_FORMATS });
    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(function (type, attributes) {
        if (type === 'webgl2') {
          const gl = createFakeGL(this);

          made.webgl2.push({ gl, attributes });

          return gl;
        }

        if (type === '2d') {
          const context = {
            drawImage: jest.fn(),
            getImageData: () => ({ data: Uint8ClampedArray.from(copied) }),
          };

          made['2d'].push(context);

          return context;
        }

        return null;
      });
    idleCallbacks = [];
    originalRequestIdleCallback = globalThis.requestIdleCallback;
    globalThis.requestIdleCallback = jest.fn((callback) => {
      idleCallbacks.push(callback);
    });
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    globalThis.requestIdleCallback = originalRequestIdleCallback;
    resetRenderingCapabilities({ clearStorage: true });
  });

  it('opens one WebGL context and releases it, with no texture probe and no canvas copy', () => {
    const capabilities = detectRenderingCapabilities();
    const [{ gl }] = made.webgl2;

    expect(made.webgl2).toHaveLength(1);
    expect(gl.lost).toBe(1);
    expect(gl.cleared).toBe(0);
    expect(getSupportedTextureFormats).not.toHaveBeenCalled();
    expect(made['2d']).toHaveLength(0);
    expect(capabilities.webgl).toBe(true);
    expect(capabilities.maxTextureSize).toBe(16384);
    expect(capabilities.max3DTextureSize).toBe(2048);
    expect(capabilities.renderer).toBe('Fake GPU');
    expect(capabilities.softwareRasterizer).toBe(false);
    expect(getSupportedTextureFormats).not.toHaveBeenCalled();
    expect(made.webgl2).toHaveLength(1);
  });

  it('runs the texture probes at the first read of a format answer, once, and stores what they found', () => {
    const capabilities = detectRenderingCapabilities();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(capabilities.floatLinear).toBe(true);
    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(capabilities).toMatchObject(ALL_FORMATS);
    expect({ ...capabilities }).toMatchObject(ALL_FORMATS);
    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    expect(made['2d']).toHaveLength(1);
  });

  it('takes the stored formats of the renderer at the detection, with no probe', () => {
    expect(detectRenderingCapabilities().norm16).toBe(true);

    made.webgl2 = [];
    getSupportedTextureFormats.mockClear();

    const capabilities = detectRenderingCapabilities();

    expect(capabilities).toMatchObject(ALL_FORMATS);
    expect(getSupportedTextureFormats).not.toHaveBeenCalled();
    expect(made.webgl2).toHaveLength(1);
    expect(made.webgl2[0].gl.lost).toBe(1);
  });

  it('measures the canvas copy at the first read of webglCanvasCopy, on a context of its own that it releases, and keeps the answer', () => {
    const capabilities = detectRenderingCapabilities();

    expect(made.webgl2).toHaveLength(1);
    expect(capabilities.webglCanvasCopy).toBe(true);
    expect(made.webgl2).toHaveLength(2);
    expect(made['2d']).toHaveLength(1);
    expect(made.webgl2[1].gl.cleared).toBe(1);
    expect(made.webgl2[1].gl.lost).toBe(1);
    expect(made['2d'][0].drawImage).toHaveBeenCalledWith(
      made.webgl2[1].gl.canvas,
      0,
      0
    );

    copied = [0, 0, 0, 0];

    expect(capabilities.webglCanvasCopy).toBe(true);
    expect({ ...capabilities }.webglCanvasCopy).toBe(true);
    expect(made.webgl2).toHaveLength(2);
    expect(made['2d']).toHaveLength(1);
  });

  it('reports a device whose canvas copy comes back empty as one that cannot copy', () => {
    copied = [0, 0, 0, 0];

    expect(detectRenderingCapabilities().webglCanvasCopy).toBe(false);
  });

  it('measures the formats and the canvas copy of the profile of getRenderingCapabilities in the next idle periods, once', () => {
    const capabilities = getRenderingCapabilities();

    expect(made.webgl2).toHaveLength(1);
    expect(made['2d']).toHaveLength(0);
    expect(getSupportedTextureFormats).not.toHaveBeenCalled();
    expect(globalThis.requestIdleCallback).toHaveBeenCalledTimes(2);

    idleCallbacks.forEach((callback) => callback());

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    expect(made.webgl2).toHaveLength(2);
    expect(made['2d']).toHaveLength(1);
    expect(capabilities).toMatchObject({
      ...ALL_FORMATS,
      webglCanvasCopy: true,
    });
    expect(getRenderingCapabilities()).toBe(capabilities);
    expect(globalThis.requestIdleCallback).toHaveBeenCalledTimes(2);
    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    expect(made.webgl2).toHaveLength(2);
  });

  it('measures nothing in the idle periods of a profile that was reset before them', () => {
    getRenderingCapabilities();
    resetRenderingCapabilities();
    made.webgl2 = [];
    getContextSpy.mockImplementation((type) => {
      made[type]?.push(type);

      return null;
    });

    idleCallbacks.forEach((callback) => callback());

    expect(getSupportedTextureFormats).not.toHaveBeenCalled();
    expect(made.webgl2).toHaveLength(0);
    expect(made['2d']).toHaveLength(0);
  });

  it('reports no canvas copy without WebGL, and schedules no idle work', () => {
    getContextSpy.mockImplementation(() => null);

    const capabilities = getRenderingCapabilities();

    expect(capabilities.webgl).toBe(false);
    expect(capabilities.webglCanvasCopy).toBe(false);
    expect(globalThis.requestIdleCallback).not.toHaveBeenCalled();
  });
});
