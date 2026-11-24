import {
  detectRenderingCapabilities,
  getRenderingCapabilities,
  getStoredRenderingCapabilities,
  probeRenderingEdge,
  recordRenderingCapabilityFailure,
  recordRenderingCapabilitySuccess,
  resetRenderingCapabilities,
  retestRenderingCapabilities,
  getStoredGpuMemoryLimit,
  storeGpuMemoryLimit,
  clearGpuMemoryRecords,
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
import { setLossyDownsampling } from '../src/init';
import Events from '../src/enums/Events';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeTextureEdge: jest.fn(),
  probeEdgeSearch: jest.fn(),
}));

/**
 * The probe needs WebGL, which jest does not have, so the probe is a mock and
 * these tests cover what the record does with its results.
 */
const getSupportedTextureFormats = probeRenderingLimits;

const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';

/** The key of the stored record of the renderer, or null when none is stored. */
function recordKey() {
  return (
    Object.keys(window.localStorage).find(
      (key) =>
        key.startsWith(`${STORAGE_KEY}.`) &&
        !key.includes('.pending.') &&
        key !== `${STORAGE_KEY}.lastRenderer`
    ) ?? null
  );
}

const ALL_FORMATS = {
  norm16: true,
  norm16Linear: true,
  unorm16: true,
  unorm16Linear: true,
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
    /** The tracker records only when the GPU settings apply. */
    setLossyDownsampling({ final: true });
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
    setLossyDownsampling({ final: false });
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

    /** The other renderer did not replace the record of A. */
    expect(stored.textureBytes.failed).toEqual({ value: 3000, failures: 1 });

    stored.textureBytes = {
      failed: { value: 'x', failures: 1 },
      largest: {},
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
    expect(getStoredRenderingCapabilities().textureBytes.largest.value).toBe(
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

  it('records the largest total that worked and the smallest that failed, and changes no limit', () => {
    mockWebGL();
    detectRenderingCapabilities();

    recordRenderingCapabilitySuccess('textureBytes', 1000);
    recordRenderingCapabilitySuccess('textureBytes', 800);
    recordRenderingCapabilitySuccess('textureBytes', 6000);
    recordRenderingCapabilitySuccess('textureBytes', 6000);
    recordRenderingCapabilityFailure('textureBytes', 4000);
    recordRenderingCapabilityFailure('textureBytes', 5000);

    /** The record survives a new page. */
    resetRenderingCapabilities();

    const stored = getStoredRenderingCapabilities();

    expect(stored.edge.reliable).toEqual({ value: 2048, successes: 1 });
    expect(stored.textureBytes).toEqual({
      largest: { value: 6000, successes: 2 },
      failed: { value: 4000, failures: 2 },
    });
    expect(stored.memoryLimit).toBeUndefined();

    /** A success removes no memory failure: the record keeps both. */
    recordRenderingCapabilitySuccess('textureBytes', 9000);

    expect(getStoredRenderingCapabilities().textureBytes.failed).toEqual({
      value: 4000,
      failures: 2,
    });
  });

  it('removes the single record of version 1, and keeps the last renderer', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ probeVersion: 1, renderer: 'x', formats: {} })
    );
    mockWebGL();
    detectRenderingCapabilities();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${STORAGE_KEY}.lastRenderer`)).toBe(
      'NVIDIA GeForce RTX 3080'
    );
  });

  it('stores the memory limit of the user, also in a page with no WebGL2', () => {
    mockWebGL();
    detectRenderingCapabilities();
    recordRenderingCapabilityFailure('gpuBytes', 9000);
    getContextSpy.mockRestore();
    getContextSpy = undefined;

    /** A blocked browser: the next page has no WebGL2. */
    resetRenderingCapabilities();

    expect(storeGpuMemoryLimit({ bytes: 512 * 1024 * 1024, hard: true })).toBe(
      true
    );
    expect(getStoredGpuMemoryLimit()).toEqual({
      bytes: 512 * 1024 * 1024,
      hard: true,
    });
    expect(getStoredRenderingCapabilities()).toBeNull();

    /** WebGL2 is back on the next page, and the record holds the limit. */
    mockWebGL();
    resetRenderingCapabilities();

    expect(getStoredRenderingCapabilities().memoryLimit).toEqual({
      bytes: 512 * 1024 * 1024,
      hard: true,
    });

    clearGpuMemoryRecords();

    const cleared = getStoredRenderingCapabilities();

    expect(cleared.memoryLimit).toBeUndefined();
    expect(cleared.gpuBytes).toEqual({});
    expect(cleared.edge.reliable).toEqual({ value: 2048, successes: 1 });
    expect(cleared.formats).toEqual(ALL_FORMATS);
  });

  it('stores no memory limit when no renderer was ever seen', () => {
    expect(storeGpuMemoryLimit({ bytes: 512 * 1024 * 1024, hard: false })).toBe(
      false
    );
    expect(getStoredGpuMemoryLimit()).toBeUndefined();
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

    expect(stored.gpuBytes.failed).toEqual({ value: 9000, failures: 1 });
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
    expect(stored.textureBytes.failed.value).toBe(3000);
    expect(stored.gpuBytes.failed.value).toBe(9000);

    retestRenderingCapabilities();

    stored = getStoredRenderingCapabilities();
    expect(stored.textureBytes.failed).toBeUndefined();
    expect(stored.gpuBytes.failed).toBeUndefined();
    /** The formats were cleared too, so the detection probed again. */
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

      expect(textureBytes.largest).toBeUndefined();
      expect(textureBytes.failed).toEqual({ value: 6 * GIGABYTE, failures: 1 });
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

      /** The allocation comes first, so the loss can come from the probe. */
      noteTextureAllocation({ textureBytes: GIGABYTE, totalBytes: GIGABYTE });
      probeRenderingEdge(3000);
      jest.advanceTimersByTime(300);
      lose();

      expect(
        getStoredRenderingCapabilities().textureBytes.failed
      ).toBeUndefined();
      expect(
        Object.keys(window.localStorage).some((key) =>
          key.includes('.pending.')
        )
      ).toBe(true);

      /** The edge probe runs just before the allocation that it protects. */
      jest.advanceTimersByTime(10000);
      probeRenderingEdge(4000);
      noteTextureAllocation({
        textureBytes: 12 * GIGABYTE,
        totalBytes: 12 * GIGABYTE,
      });
      jest.advanceTimersByTime(300);
      lose();

      expect(getStoredRenderingCapabilities().textureBytes.failed.value).toBe(
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

    /**
     * The page stops here: no render settles the allocation, and no pagehide
     * removes the pending record. A new page starts a minute later.
     */
    const now = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now + 60000);

    jest.isolateModules(() => {
      const nextPage = require('../src/utilities/renderingCapabilities');

      expect(nextPage.getStoredRenderingCapabilities().gpuBytes.failed).toEqual(
        { value: 512 * MEGABYTE, failures: 1 }
      );
    });

    dateSpy.mockRestore();
  });
  it('records nothing when final downsampling is off', () => {
    const GIGABYTE = 1024 * 1024 * 1024;

    jest.useFakeTimers();

    try {
      mockWebGL();
      detectRenderingCapabilities();
      setLossyDownsampling({ final: false });
      noteTextureAllocation({ textureBytes: GIGABYTE, totalBytes: GIGABYTE });

      expect(
        Object.keys(window.localStorage).some((key) =>
          key.includes('.pending.')
        )
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('settles an allocation only on a draw that samples its texture', () => {
    const GIGABYTE = 1024 * 1024 * 1024;
    const texture = {};

    jest.useFakeTimers();

    try {
      mockWebGL();
      detectRenderingCapabilities();
      noteTextureAllocation({
        textureBytes: GIGABYTE,
        totalBytes: GIGABYTE,
        owner: texture,
      });

      /** Another viewport draws while this texture waits on its fence. */
      noteTextureRendered(undefined, [{}]);
      jest.advanceTimersByTime(6000);

      expect(
        getStoredRenderingCapabilities().textureBytes.largest
      ).toBeUndefined();

      noteTextureRendered(undefined, [texture]);
      jest.advanceTimersByTime(6000);

      expect(getStoredRenderingCapabilities().textureBytes.largest).toEqual({
        value: GIGABYTE,
        successes: 1,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('reads a stored memory limit below 128 MB as none', () => {
    mockWebGL();
    detectRenderingCapabilities();
    storeGpuMemoryLimit({ bytes: 512 * 1024 * 1024, hard: false });

    const stored = JSON.parse(window.localStorage.getItem(recordKey()));

    stored.memoryLimit.bytes = 1024;
    window.localStorage.setItem(recordKey(), JSON.stringify(stored));
    resetRenderingCapabilities();

    expect(getStoredGpuMemoryLimit()).toBeUndefined();
  });

  it('keeps a recent pending record of another renderer, and drops an old one', () => {
    const day = 24 * 60 * 60 * 1000;
    const pendingOf = (at) =>
      JSON.stringify({
        renderer: 'Another GPU',
        probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
        totalBytes: 9000,
        at,
      });

    window.localStorage.setItem(
      `${STORAGE_KEY}.pending.recent`,
      pendingOf(Date.now() - day)
    );
    window.localStorage.setItem(
      `${STORAGE_KEY}.pending.old`,
      pendingOf(Date.now() - 8 * day)
    );
    mockWebGL();
    detectRenderingCapabilities();

    expect(
      window.localStorage.getItem(`${STORAGE_KEY}.pending.recent`)
    ).not.toBeNull();
    expect(
      window.localStorage.getItem(`${STORAGE_KEY}.pending.old`)
    ).toBeNull();
    expect(getStoredRenderingCapabilities().gpuBytes.failed).toBeUndefined();
  });
});
