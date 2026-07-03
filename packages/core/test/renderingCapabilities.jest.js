import {
  detectRenderingCapabilities,
  getRenderingCapabilities,
  resetRenderingCapabilities,
  RENDERING_CAPABILITIES_PROBE_VERSION,
} from '../src/utilities/renderingCapabilities';
import { getSupportedTextureFormats } from '../src/utilities/textureSupport';

jest.mock('../src/utilities/textureSupport', () => ({
  getSupportedTextureFormats: jest.fn(),
}));

const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';

const ALL_FORMATS = {
  norm16: true,
  norm16Linear: true,
  float: true,
  floatLinear: true,
  halfFloat: true,
  halfFloatLinear: true,
};

const MAX_TEXTURE_SIZE_PARAM = 0x0d33;
const RENDERER_PARAM = 0x1f01;

function createFakeGL(renderer) {
  return {
    MAX_TEXTURE_SIZE: MAX_TEXTURE_SIZE_PARAM,
    RENDERER: RENDERER_PARAM,
    getParameter: (param) => {
      if (param === MAX_TEXTURE_SIZE_PARAM) {
        return 16384;
      }
      if (param === 'unmasked-renderer' || param === RENDERER_PARAM) {
        return renderer;
      }
      return null;
    },
    getExtension: (name) => {
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_RENDERER_WEBGL: 'unmasked-renderer' };
      }
      if (name === 'WEBGL_lose_context') {
        return { loseContext: () => undefined };
      }
      return null;
    },
  };
}

describe('renderingCapabilities', () => {
  let getContextSpy;

  function mockWebGL(renderer = 'NVIDIA GeForce RTX 3080') {
    const gl = createFakeGL(renderer);
    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((type) => (type === 'webgl2' ? gl : null));
  }

  beforeEach(() => {
    window.localStorage.clear();
    resetRenderingCapabilities();
    getSupportedTextureFormats.mockReset();
    getSupportedTextureFormats.mockReturnValue({ ...ALL_FORMATS });
  });

  afterEach(() => {
    getContextSpy?.mockRestore();
    getContextSpy = undefined;
    resetRenderingCapabilities({ clearStorage: true });
  });

  it('returns an all-false profile when no WebGL context is available', () => {
    const capabilities = detectRenderingCapabilities();

    expect(capabilities.webgl).toBe(false);
    expect(capabilities.webgl2).toBe(false);
    expect(capabilities.norm16).toBe(false);
    expect(capabilities.maxTextureSize).toBe(0);
    expect(getSupportedTextureFormats).not.toHaveBeenCalled();
  });

  it('runs the probes and merges context info on a cache miss', () => {
    mockWebGL();

    const capabilities = detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    expect(capabilities).toMatchObject({
      webgl: true,
      webgl2: true,
      maxTextureSize: 16384,
      renderer: 'NVIDIA GeForce RTX 3080',
      softwareRasterizer: false,
      ...ALL_FORMATS,
    });
  });

  it('persists probe results and skips probing on the next detection', () => {
    mockWebGL();

    detectRenderingCapabilities();
    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);

    const second = detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    expect(second.norm16).toBe(true);
  });

  it('re-probes when the renderer string changes', () => {
    mockWebGL('Renderer A');
    detectRenderingCapabilities();
    getContextSpy.mockRestore();

    mockWebGL('Renderer B');
    detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
  });

  it('re-probes when the cached probe version is stale', () => {
    mockWebGL();
    detectRenderingCapabilities();

    const cached = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(cached.probeVersion).toBe(RENDERING_CAPABILITIES_PROBE_VERSION);

    cached.probeVersion = RENDERING_CAPABILITIES_PROBE_VERSION - 1;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));

    detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
  });

  it('re-probes when useCache is false', () => {
    mockWebGL();
    detectRenderingCapabilities();
    detectRenderingCapabilities({ useCache: false });

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
  });

  it('flags software rasterizers from the renderer string', () => {
    mockWebGL('Google SwiftShader');

    const capabilities = detectRenderingCapabilities();

    expect(capabilities.softwareRasterizer).toBe(true);
  });

  it('memoizes through getRenderingCapabilities until reset', () => {
    mockWebGL();

    const first = getRenderingCapabilities();
    const second = getRenderingCapabilities();

    expect(second).toBe(first);

    resetRenderingCapabilities();

    const third = getRenderingCapabilities();
    expect(third).not.toBe(first);
  });
});
