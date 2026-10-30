import {
  detectRenderingCapabilities,
  getRenderingCapabilities,
  getStoredRenderingCapabilities,
  probeRenderingEdge,
  recordRenderingCapabilityFailure,
  addMemoryFailure,
  MEMORY_RECENT_MS,
  recordRenderingCapabilitySuccess,
  resetRenderingCapabilities,
  retestRenderingCapabilities,
  RENDERING_CAPABILITIES_PROBE_VERSION,
} from '../src/utilities/renderingCapabilities';
import {
  probeRenderingLimits,
  probeTextureEdge,
} from '../src/utilities/textureSupport';
import {
  noteTextureAllocation,
  noteTextureRendered,
} from '../src/utilities/gpuAllocationTracker';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeTextureEdge: jest.fn(),
  probeEdgeSearch: jest.fn(),
}));

// The probe needs WebGL, which jest does not have, so the probe is a mock and
// these tests cover what the record does with its results.
const getSupportedTextureFormats = probeRenderingLimits;

const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';

/** The key of the stored record of the renderer, or null when none is stored. */
function recordKey() {
  return (
    Object.keys(window.localStorage).find(
      (key) => key.startsWith(`${STORAGE_KEY}.`) && !key.includes('.pending.')
    ) ?? null
  );
}

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

    const cached = JSON.parse(window.localStorage.getItem(recordKey()));
    expect(cached.probeVersion).toBe(RENDERING_CAPABILITIES_PROBE_VERSION);

    cached.probeVersion = RENDERING_CAPABILITIES_PROBE_VERSION - 1;
    window.localStorage.setItem(recordKey(), JSON.stringify(cached));

    detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
  });

  it('keeps one record for each renderer, and reads an invalid stored value as missing', () => {
    mockWebGL('Renderer A');
    detectRenderingCapabilities();
    recordRenderingCapabilityFailure('textureBytes', 3000);
    const keyOfA = recordKey();

    getContextSpy.mockRestore();
    mockWebGL('Renderer B');
    resetRenderingCapabilities();
    detectRenderingCapabilities();

    const stored = JSON.parse(window.localStorage.getItem(keyOfA));

    // The other renderer did not replace the record of A.
    expect(stored.textureBytes.recent.value).toBe(3000);

    stored.textureBytes = {
      recent: { value: 'x', at: Date.now(), count: 1 },
      failures: {},
    };
    stored.edge.reliable = { value: null, successes: 1 };
    window.localStorage.setItem(keyOfA, JSON.stringify(stored));
    getContextSpy.mockRestore();
    mockWebGL('Renderer A');
    resetRenderingCapabilities();

    const reread = getStoredRenderingCapabilities();

    expect(reread.edge).toEqual({});
    expect(reread.textureBytes).toEqual({});
    expect(() =>
      recordRenderingCapabilitySuccess('textureBytes', 1000)
    ).not.toThrow();
    expect(getStoredRenderingCapabilities().textureBytes.normal.value).toBe(
      1000
    );
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
    expect(recordKey()).toBeNull();
  });

  it('re-probes on the next detection after a failed probe run', () => {
    mockWebGL();
    getSupportedTextureFormats.mockReturnValueOnce(null);

    detectRenderingCapabilities();
    const second = detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
    expect(second.norm16).toBe(true);
    expect(recordKey()).not.toBeNull();
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

  it('keeps the normal level, and sets a ceiling only after several episodes', () => {
    const start = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(start);

    try {
      mockWebGL();
      detectRenderingCapabilities();

      recordRenderingCapabilitySuccess('textureBytes', 1000);
      recordRenderingCapabilitySuccess('textureBytes', 800);
      recordRenderingCapabilitySuccess('textureBytes', 6000);
      recordRenderingCapabilityFailure('textureBytes', 4000);
      // A failure within the hour joins the episode, and does not count.
      recordRenderingCapabilityFailure('textureBytes', 2000);

      // The record survives a new page.
      resetRenderingCapabilities();
      let stored = getStoredRenderingCapabilities();

      expect(stored.edge.reliable).toEqual({ value: 2048, successes: 1 });
      expect(stored.textureBytes.normal).toEqual({ value: 6000, successes: 1 });
      expect(stored.textureBytes.recent).toEqual({
        value: 4000,
        at: start,
        count: 2,
      });
      expect(stored.textureBytes.failures).toHaveLength(1);

      clock.mockReturnValue(start + MEMORY_RECENT_MS);
      recordRenderingCapabilityFailure('textureBytes', 5000);
      clock.mockReturnValue(start + 2 * MEMORY_RECENT_MS);
      recordRenderingCapabilityFailure('textureBytes', 3000);

      stored = getStoredRenderingCapabilities();
      // The third episode sets the ceiling at 0.75 of the smallest first failure.
      expect(stored.textureBytes.ceiling).toBe(2250);
      expect(stored.textureBytes.normal).toEqual({ value: 2250, successes: 0 });
      expect(stored.textureBytes.failures).toEqual([]);

      // A success above the ceiling removes it.
      recordRenderingCapabilitySuccess('textureBytes', 4000);

      expect(
        getStoredRenderingCapabilities().textureBytes.ceiling
      ).toBeUndefined();
    } finally {
      clock.mockRestore();
    }
  });

  it('counts only the failures within the window toward a ceiling', () => {
    const entry = {};
    const day = 24 * 60 * 60 * 1000;

    addMemoryFailure(entry, 3000, 0);
    addMemoryFailure(entry, 3000, 6 * day);
    addMemoryFailure(entry, 3000, 8 * day);

    expect(entry.ceiling).toBeUndefined();
    // The first failure is older than the window of 7 days.
    expect(entry.failures.map((failure) => failure.at)).toEqual([
      6 * day,
      8 * day,
    ]);
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

    expect(stored.gpuBytes.recent.value).toBe(9000);
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
    expect(stored.textureBytes.recent.value).toBe(3000);
    expect(stored.gpuBytes.recent.value).toBe(9000);

    retestRenderingCapabilities();

    stored = getStoredRenderingCapabilities();
    expect(stored.textureBytes.recent).toBeUndefined();
    expect(stored.gpuBytes.recent).toBeUndefined();
    // The formats were cleared too, so the detection probed again.
    expect(stored.formats).toEqual(ALL_FORMATS);
    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
  });

  it('records a loss 2 s after the render of a large allocation as a failure only, with no success', () => {
    const GIGABYTE = 1024 * 1024 * 1024;

    jest.useFakeTimers();

    try {
      mockWebGL();
      detectRenderingCapabilities();
      noteTextureAllocation({
        textureBytes: 6 * GIGABYTE,
        totalBytes: 6 * GIGABYTE,
      });
      noteTextureRendered();
      jest.advanceTimersByTime(2000);
      eventTarget.dispatchEvent(
        new CustomEvent(Events.WEBGL_CONTEXT_LOST, { detail: {} })
      );
      jest.advanceTimersByTime(10000);

      const { textureBytes } = getStoredRenderingCapabilities();

      expect(textureBytes.normal).toBeUndefined();
      expect(textureBytes.failures).toEqual([
        expect.objectContaining({ value: 6 * GIGABYTE }),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('exempts a loss only after a probe that followed the allocation', () => {
    const GIGABYTE = 1024 * 1024 * 1024;
    const lose = () =>
      eventTarget.dispatchEvent(
        new CustomEvent(Events.WEBGL_CONTEXT_LOST, { detail: {} })
      );

    jest.useFakeTimers();

    try {
      getSupportedTextureFormats.mockReturnValue({
        formats: { ...ALL_FORMATS },
        max3DTextureSize: 16384,
        reliableEdge: 2048,
      });
      mockWebGL();
      detectRenderingCapabilities();
      jest.advanceTimersByTime(5000);
      probeTextureEdge.mockReturnValue(true);

      // The allocation comes first, so the loss can come from the probe.
      noteTextureAllocation({ textureBytes: GIGABYTE, totalBytes: GIGABYTE });
      probeRenderingEdge(3000);
      jest.advanceTimersByTime(300);
      lose();

      expect(
        getStoredRenderingCapabilities().textureBytes.recent
      ).toBeUndefined();
      expect(
        Object.keys(window.localStorage).some((key) =>
          key.includes('.pending.')
        )
      ).toBe(true);

      // The edge probe runs just before the allocation that it protects.
      jest.advanceTimersByTime(10000);
      probeRenderingEdge(4000);
      noteTextureAllocation({
        textureBytes: 12 * GIGABYTE,
        totalBytes: 12 * GIGABYTE,
      });
      jest.advanceTimersByTime(300);
      lose();

      expect(getStoredRenderingCapabilities().textureBytes.recent.value).toBe(
        12 * GIGABYTE
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('records a crash when a page stops during a large allocation', () => {
    const MEGABYTE = 1024 * 1024;

    mockWebGL();
    detectRenderingCapabilities();
    noteTextureAllocation({
      textureBytes: 128 * MEGABYTE,
      totalBytes: 512 * MEGABYTE,
    });

    // The page stops here: no render settles the allocation, and no pagehide
    // removes the pending record. A new page starts a minute later.
    const now = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now + 60000);

    jest.isolateModules(() => {
      const nextPage = require('../src/utilities/renderingCapabilities');

      expect(nextPage.getStoredRenderingCapabilities().gpuBytes.recent).toEqual(
        { value: 512 * MEGABYTE, at: now + 60000, count: 1 }
      );
    });

    dateSpy.mockRestore();
  });
});
