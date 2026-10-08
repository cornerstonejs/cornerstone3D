import {
  detectRenderingCapabilities,
  getRenderingCapabilities,
  resetRenderingCapabilities,
  classifyGpuClass,
  getRecommendedInteractiveBudgetFrac,
  GPU_CLASS_BUDGET_FRAC,
} from '../src/utilities/renderingCapabilities';
import { getSupportedTextureFormats } from '../src/utilities/textureSupport';
import { probeGpuMsPerMpx } from '../src/utilities/gpuBudgetProbe';

jest.mock('../src/utilities/textureSupport', () => ({
  getSupportedTextureFormats: jest.fn(),
}));

jest.mock('../src/utilities/gpuBudgetProbe', () => {
  const actual = jest.requireActual('../src/utilities/gpuBudgetProbe');
  return {
    ...actual,
    probeGpuMsPerMpx: jest.fn(),
  };
});

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
const MAX_3D_TEXTURE_SIZE_PARAM = 0x8073;
const MAX_ARRAY_TEXTURE_LAYERS_PARAM = 0x88ff;
const MAX_RENDERBUFFER_SIZE_PARAM = 0x84e8;
const MAX_VIEWPORT_DIMS_PARAM = 0x0d3a;
const RENDERER_PARAM = 0x1f01;

const FAKE_SIZE_LIMITS = {
  maxTextureSize: 16384,
  max3DTextureSize: 2048,
  maxArrayTextureLayers: 2048,
  maxRenderbufferSize: 16384,
  maxViewportDims: [16384, 16384],
};

function createFakeGL(renderer, { webgl2 = true } = {}) {
  return {
    MAX_TEXTURE_SIZE: MAX_TEXTURE_SIZE_PARAM,
    MAX_3D_TEXTURE_SIZE: MAX_3D_TEXTURE_SIZE_PARAM,
    MAX_ARRAY_TEXTURE_LAYERS: MAX_ARRAY_TEXTURE_LAYERS_PARAM,
    MAX_RENDERBUFFER_SIZE: MAX_RENDERBUFFER_SIZE_PARAM,
    MAX_VIEWPORT_DIMS: MAX_VIEWPORT_DIMS_PARAM,
    RENDERER: RENDERER_PARAM,
    getParameter: (param) => {
      if (param === MAX_TEXTURE_SIZE_PARAM) {
        return FAKE_SIZE_LIMITS.maxTextureSize;
      }
      if (param === MAX_3D_TEXTURE_SIZE_PARAM) {
        return webgl2 ? FAKE_SIZE_LIMITS.max3DTextureSize : null;
      }
      if (param === MAX_ARRAY_TEXTURE_LAYERS_PARAM) {
        return webgl2 ? FAKE_SIZE_LIMITS.maxArrayTextureLayers : null;
      }
      if (param === MAX_RENDERBUFFER_SIZE_PARAM) {
        return FAKE_SIZE_LIMITS.maxRenderbufferSize;
      }
      if (param === MAX_VIEWPORT_DIMS_PARAM) {
        return FAKE_SIZE_LIMITS.maxViewportDims;
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

describe('classifyGpuClass', () => {
  it('returns null when there is no WebGL (CPU path)', () => {
    expect(
      classifyGpuClass({
        webgl: false,
        softwareRasterizer: false,
        msPerMpx: 1,
      })
    ).toBeNull();
  });

  it('returns minimal for software rasterizers', () => {
    expect(
      classifyGpuClass({
        webgl: true,
        softwareRasterizer: true,
        msPerMpx: 0.5,
      })
    ).toBe('minimal');
  });

  it('maps msPerMpx thresholds to named classes', () => {
    expect(
      classifyGpuClass({
        webgl: true,
        softwareRasterizer: false,
        msPerMpx: 1,
      })
    ).toBe('high');
    expect(
      classifyGpuClass({
        webgl: true,
        softwareRasterizer: false,
        msPerMpx: 5,
      })
    ).toBe('medium');
    expect(
      classifyGpuClass({
        webgl: true,
        softwareRasterizer: false,
        msPerMpx: 15,
      })
    ).toBe('low');
    expect(
      classifyGpuClass({
        webgl: true,
        softwareRasterizer: false,
        msPerMpx: 40,
      })
    ).toBe('minimal');
  });

  it('defaults failed hardware probes to medium', () => {
    expect(
      classifyGpuClass({
        webgl: true,
        softwareRasterizer: false,
        msPerMpx: null,
      })
    ).toBe('medium');
  });

  it('treats zero / too-fast timings as high, not failed', () => {
    expect(
      classifyGpuClass({
        webgl: true,
        softwareRasterizer: false,
        msPerMpx: 0,
      })
    ).toBe('high');
    expect(
      classifyGpuClass({
        webgl: true,
        softwareRasterizer: false,
        msPerMpx: 0.001,
      })
    ).toBe('high');
  });
});

describe('getRecommendedInteractiveBudgetFrac', () => {
  it('maps classes to the fixed frac table', () => {
    expect(getRecommendedInteractiveBudgetFrac(null)).toBe(0);
    expect(getRecommendedInteractiveBudgetFrac('minimal')).toBe(
      GPU_CLASS_BUDGET_FRAC.minimal
    );
    expect(getRecommendedInteractiveBudgetFrac('low')).toBe(
      GPU_CLASS_BUDGET_FRAC.low
    );
    expect(getRecommendedInteractiveBudgetFrac('medium')).toBe(
      GPU_CLASS_BUDGET_FRAC.medium
    );
    expect(getRecommendedInteractiveBudgetFrac('high')).toBe(
      GPU_CLASS_BUDGET_FRAC.high
    );
  });
});

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
    probeGpuMsPerMpx.mockReset();
    probeGpuMsPerMpx.mockReturnValue(1); // high by default
  });

  afterEach(() => {
    getContextSpy?.mockRestore();
    getContextSpy = undefined;
    resetRenderingCapabilities({ clearStorage: true });
  });

  it('returns null gpuClass when no WebGL context is available', () => {
    const capabilities = detectRenderingCapabilities();

    expect(capabilities.webgl).toBe(false);
    expect(capabilities.webgl2).toBe(false);
    expect(capabilities.norm16).toBe(false);
    expect(capabilities).toMatchObject({
      maxTextureSize: 0,
      max3DTextureSize: 0,
      maxArrayTextureLayers: 0,
      maxRenderbufferSize: 0,
      maxViewportDims: [0, 0],
    });
    expect(capabilities.gpuClass).toBeNull();
    expect(capabilities.recommendedInteractiveBudgetFrac).toBe(0);
    expect(capabilities.gpuPerfMsPerMpx).toBeNull();
    expect(getSupportedTextureFormats).not.toHaveBeenCalled();
    expect(probeGpuMsPerMpx).not.toHaveBeenCalled();
  });

  it('runs the probes and merges context info on a cache miss', () => {
    mockWebGL();

    const capabilities = detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    expect(probeGpuMsPerMpx).toHaveBeenCalledTimes(1);
    expect(capabilities).toMatchObject({
      webgl: true,
      webgl2: true,
      ...FAKE_SIZE_LIMITS,
      renderer: 'NVIDIA GeForce RTX 3080',
      softwareRasterizer: false,
      gpuClass: 'high',
      recommendedInteractiveBudgetFrac: GPU_CLASS_BUDGET_FRAC.high,
      gpuPerfMsPerMpx: 1,
      ...ALL_FORMATS,
    });
  });

  it('persists probe results and skips probing on the next detection', () => {
    mockWebGL();

    detectRenderingCapabilities();
    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    expect(probeGpuMsPerMpx).toHaveBeenCalledTimes(1);

    const cached = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(cached).toMatchObject({
      renderer: 'NVIDIA GeForce RTX 3080',
      webgl2: true,
      ...FAKE_SIZE_LIMITS,
      softwareRasterizer: false,
      gpuClass: 'high',
      gpuPerfMsPerMpx: 1,
      formats: ALL_FORMATS,
    });
    expect(cached.probeVersion).toBeUndefined();

    const second = detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    expect(probeGpuMsPerMpx).toHaveBeenCalledTimes(1);
    expect(second.norm16).toBe(true);
    expect(second.gpuClass).toBe('high');
    expect(second.maxTextureSize).toBe(16384);
    expect(second.max3DTextureSize).toBe(2048);
  });

  it('re-probes when the renderer string changes', () => {
    mockWebGL('Renderer A');
    detectRenderingCapabilities();
    getContextSpy.mockRestore();

    mockWebGL('Renderer B');
    detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
    expect(probeGpuMsPerMpx).toHaveBeenCalledTimes(2);
  });

  it('re-probes when WebGL2 availability changes for the same renderer', () => {
    const gl = createFakeGL('Shared Renderer', { webgl2: false });
    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((type) => (type === 'webgl' ? gl : null));

    const webgl1 = detectRenderingCapabilities();
    expect(webgl1.webgl2).toBe(false);
    expect(webgl1.max3DTextureSize).toBe(0);
    expect(webgl1.maxArrayTextureLayers).toBe(0);
    expect(webgl1.maxRenderbufferSize).toBe(
      FAKE_SIZE_LIMITS.maxRenderbufferSize
    );
    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(1);
    getContextSpy.mockRestore();

    mockWebGL('Shared Renderer');
    detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
  });

  it('re-probes when useCache is false', () => {
    mockWebGL();
    detectRenderingCapabilities();
    detectRenderingCapabilities({ useCache: false });

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
    expect(probeGpuMsPerMpx).toHaveBeenCalledTimes(2);
  });

  it('reports no format support without persisting when probing fails', () => {
    mockWebGL();
    getSupportedTextureFormats.mockReturnValue(null);

    const capabilities = detectRenderingCapabilities();

    expect(capabilities.webgl).toBe(true);
    expect(capabilities.norm16).toBe(false);
    expect(capabilities.float).toBe(false);
    expect(capabilities.gpuClass).toBe('high');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('re-probes on the next detection after a failed probe run', () => {
    mockWebGL();
    getSupportedTextureFormats.mockReturnValueOnce(null);

    detectRenderingCapabilities();
    const second = detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
    expect(second.norm16).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('flags software rasterizers as minimal and skips the timing probe', () => {
    mockWebGL('Google SwiftShader');

    const capabilities = detectRenderingCapabilities();

    expect(capabilities.softwareRasterizer).toBe(true);
    expect(capabilities.gpuClass).toBe('minimal');
    expect(capabilities.recommendedInteractiveBudgetFrac).toBe(
      GPU_CLASS_BUDGET_FRAC.minimal
    );
    expect(capabilities.gpuPerfMsPerMpx).toBeNull();
    expect(probeGpuMsPerMpx).not.toHaveBeenCalled();
  });

  it('classifies low from probe timings', () => {
    mockWebGL();
    probeGpuMsPerMpx.mockReturnValue(10);

    const capabilities = detectRenderingCapabilities();

    expect(capabilities.gpuClass).toBe('low');
    expect(capabilities.recommendedInteractiveBudgetFrac).toBe(
      GPU_CLASS_BUDGET_FRAC.low
    );
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
