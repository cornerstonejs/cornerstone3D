import {
  detectRenderingCapabilities,
  getRenderingCapabilities,
  getStoredRenderingCapabilities,
  recordRenderingCapabilityFailure,
  recordRenderingCapabilitySuccess,
  resetRenderingCapabilities,
  retestRenderingCapabilities,
  RENDERING_CAPABILITIES_PROBE_VERSION,
} from '../src/utilities/renderingCapabilities';
import { probeRenderingLimits } from '../src/utilities/textureSupport';
import { noteTextureAllocation } from '../src/utilities/gpuAllocationTracker';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeTextureEdge: jest.fn(),
  probeEdgeSearch: jest.fn(),
}));

// The probe needs WebGL, which jest does not have, so the probe is a mock and
// these tests cover what the record does with its results.
const getSupportedTextureFormats = probeRenderingLimits;

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
    getSupportedTextureFormats.mockReturnValue({
      formats: { ...ALL_FORMATS },
      max3DTextureSize: 2048,
      reliableEdge: 2048,
    });
  });

  afterEach(() => {
    getContextSpy?.mockRestore();
    getContextSpy = undefined;
    resetRenderingCapabilities({ clearStorage: true });
  });

  it('returns an all-false profile when no WebGL context is available', () => {
    const capabilities = detectRenderingCapabilities();

    expect(capabilities.webgl).toBe(false);
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
      maxTextureSize: 16384,
      max3DTextureSize: 2048,
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

  it('reports no WebGL when only a WebGL1 context is available', () => {
    const gl = createFakeGL('WebGL1 Renderer');
    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((type) => (type === 'webgl' ? gl : null));

    const capabilities = detectRenderingCapabilities();

    expect(capabilities.webgl).toBe(false);
    expect(getSupportedTextureFormats).not.toHaveBeenCalled();
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

  it('reports no format support without persisting when probing fails', () => {
    mockWebGL();
    getSupportedTextureFormats.mockReturnValue(null);

    const capabilities = detectRenderingCapabilities();

    expect(capabilities.webgl).toBe(true);
    expect(capabilities.norm16).toBe(false);
    expect(capabilities.float).toBe(false);
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

  it('keeps the largest success and the smallest failure, with counts', () => {
    mockWebGL();
    detectRenderingCapabilities();

    recordRenderingCapabilitySuccess('textureBytes', 1000);
    recordRenderingCapabilitySuccess('textureBytes', 800);
    recordRenderingCapabilitySuccess('textureBytes', 2000);
    recordRenderingCapabilityFailure('textureBytes', 4000);
    recordRenderingCapabilityFailure('textureBytes', 3000);

    // The record survives a new page.
    resetRenderingCapabilities();
    const stored = getStoredRenderingCapabilities();

    expect(stored.edge.reliable).toEqual({ value: 2048, successes: 1 });
    expect(stored.textureBytes.reliable).toEqual({ value: 2000, successes: 1 });
    expect(stored.textureBytes.lost).toEqual({ value: 3000, failures: 2 });

    // One failure does not stay when the value works later.
    recordRenderingCapabilitySuccess('textureBytes', 3000);

    expect(getStoredRenderingCapabilities().textureBytes.lost).toBeUndefined();
  });

  it('records a pending allocation that a stopped page left as a crash', () => {
    mockWebGL();
    detectRenderingCapabilities();
    window.localStorage.setItem(
      `${STORAGE_KEY}.pending.another-tab`,
      JSON.stringify({
        renderer: 'NVIDIA GeForce RTX 3080',
        probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
        totalBytes: 9000,
        at: Date.now() - 60000,
      })
    );

    resetRenderingCapabilities();
    const stored = getStoredRenderingCapabilities();

    expect(stored.gpuBytes.crash).toEqual({ value: 9000, failures: 1 });
    expect(
      window.localStorage.getItem(`${STORAGE_KEY}.pending.another-tab`)
    ).toBeNull();
  });

  it('clears the failures of the selected categories on a retest', () => {
    mockWebGL();
    detectRenderingCapabilities();
    recordRenderingCapabilityFailure('edge', 4096);
    recordRenderingCapabilityFailure('textureBytes', 3000);
    recordRenderingCapabilityFailure('gpuBytes', 9000);

    retestRenderingCapabilities({ edge: true });

    let stored = getStoredRenderingCapabilities();
    expect(stored.edge.failed).toBeUndefined();
    expect(stored.textureBytes.lost.value).toBe(3000);
    expect(stored.gpuBytes.crash.value).toBe(9000);

    retestRenderingCapabilities();

    stored = getStoredRenderingCapabilities();
    expect(stored.textureBytes.lost).toBeUndefined();
    expect(stored.gpuBytes.crash).toBeUndefined();
    // The formats were cleared too, so the detection probed again.
    expect(stored.formats).toEqual(ALL_FORMATS);
    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
  });

  it('records a crash when a page stops during a large allocation', () => {
    const MEGABYTE = 1024 * 1024;

    mockWebGL();
    detectRenderingCapabilities();
    noteTextureAllocation({
      textureBytes: 128 * MEGABYTE,
      totalBytes: 512 * MEGABYTE,
      maxEdge: 512,
    });

    // The page stops here: no render settles the allocation, and no pagehide
    // removes the pending record. A new page starts a minute later.
    const now = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now + 60000);

    jest.isolateModules(() => {
      const nextPage = require('../src/utilities/renderingCapabilities');

      expect(nextPage.getStoredRenderingCapabilities().gpuBytes.crash).toEqual({
        value: 512 * MEGABYTE,
        failures: 1,
      });
    });

    dateSpy.mockRestore();
  });
});
