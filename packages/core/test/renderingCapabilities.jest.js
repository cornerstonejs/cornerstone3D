import {
  detectRenderingCapabilities,
  getRenderingCapabilities,
  getStoredRenderingCapabilities,
  recordRenderingCapabilityFailure,
  recordRenderingCapabilitySuccess,
  resetRenderingCapabilities,
  retestRenderingCapabilities,
  getStoredGpuMemoryLimit,
  storeGpuMemoryLimit,
  clearGpuMemoryRecords,
  RENDERING_CAPABILITIES_PROBE_VERSION,
} from '../src/utilities/renderingCapabilities';
import { probeRenderingLimits } from '../src/utilities/textureSupport';
import {
  cancelTextureAllocation,
  noteTextureAllocation,
  noteTextureRendered,
} from '../src/utilities/gpuAllocationTracker';
import eventTarget from '../src/eventTarget';
import { setLossyDownsampling } from '../src/init';
import Events from '../src/enums/Events';
import { resetWebGLAvailability } from '../src/utilities/webglAvailability';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
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
        !key.endsWith('.limit') &&
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
    /** A wait or failure times of an earlier test stay in this tab. */
    resetWebGLAvailability();
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

    /** The start of the last search stays; the invalid edge goes. */
    expect(reread.edge).toEqual({ searchedFrom: 2048 });
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

  it('keeps what another tab stored since this page read the record', () => {
    mockWebGL();
    /** The detection of this page reads the record once, and keeps it. */
    getRenderingCapabilities();

    /** Another tab of the site records a success in the shared record. */
    const key = recordKey();
    const stored = JSON.parse(window.localStorage.getItem(key));

    stored.gpuBytes = { largest: { value: 6000, successes: 1 } };
    window.localStorage.setItem(key, JSON.stringify(stored));

    recordRenderingCapabilityFailure('textureBytes', 4000);

    expect(getStoredRenderingCapabilities()).toMatchObject({
      gpuBytes: { largest: { value: 6000, successes: 1 } },
      textureBytes: { failed: { value: 4000, failures: 1 } },
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

    /** WebGL2 is back on the next page, and the renderer keeps the limit. */
    mockWebGL();
    resetRenderingCapabilities();

    expect(getStoredGpuMemoryLimit()).toEqual({
      bytes: 512 * 1024 * 1024,
      hard: true,
    });

    expect(clearGpuMemoryRecords()).toBe(true);

    const cleared = getStoredRenderingCapabilities();

    expect(getStoredGpuMemoryLimit()).toBeUndefined();
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
    expect(stored.history.buckets).toEqual({
      0.125: { successes: 0, failures: 1 },
    });
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

      /** The allocation comes first, so the loss can come from the probe. */
      noteTextureAllocation({ textureBytes: GIGABYTE, totalBytes: GIGABYTE });
      detectRenderingCapabilities({ useCache: false });
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

      /** A probe just before an allocation does not exempt its loss. */
      jest.advanceTimersByTime(10000);
      detectRenderingCapabilities({ useCache: false });
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

  it('cancels the noted allocation of an upload that vtk.js refused', () => {
    const GIGABYTE = 1024 * 1024 * 1024;
    const refused = {};

    mockWebGL();
    detectRenderingCapabilities();
    noteTextureAllocation({
      textureBytes: GIGABYTE,
      totalBytes: GIGABYTE,
      owner: refused,
    });
    cancelTextureAllocation(refused);
    eventTarget.dispatchEvent(
      new CustomEvent(Events.WEBGL_CONTEXT_LOST, { detail: {} })
    );

    expect(
      getStoredRenderingCapabilities().textureBytes.failed
    ).toBeUndefined();
    expect(
      Object.keys(window.localStorage).some((key) => key.includes('.pending.'))
    ).toBe(false);
  });

  it('keeps a crash record that the store did not confirm, for a later start', () => {
    mockWebGL();
    detectRenderingCapabilities();
    window.localStorage.setItem(
      `${STORAGE_KEY}.pending.stopped-tab`,
      JSON.stringify({
        renderer: 'NVIDIA GeForce RTX 3080',
        probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
        totalBytes: 9000,
        at: Date.now() - 60000,
      })
    );

    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    try {
      resetRenderingCapabilities();
      getStoredRenderingCapabilities();
    } finally {
      setItem.mockRestore();
    }

    expect(
      window.localStorage.getItem(`${STORAGE_KEY}.pending.stopped-tab`)
    ).not.toBeNull();
  });

  it('settles another owner with its own total, not the earlier pending one', () => {
    const GIGABYTE = 1024 * 1024 * 1024;
    const first = {};
    const second = {};

    jest.useFakeTimers();

    try {
      mockWebGL();
      detectRenderingCapabilities();
      noteTextureAllocation({
        textureBytes: GIGABYTE,
        totalBytes: 3 * GIGABYTE,
        owner: first,
      });
      noteTextureAllocation({
        textureBytes: GIGABYTE,
        totalBytes: GIGABYTE,
        owner: second,
      });
      noteTextureRendered(undefined, [second]);
      jest.advanceTimersByTime(6000);

      expect(getStoredRenderingCapabilities().textureBytes.largest.value).toBe(
        GIGABYTE
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('probes again when the stored formats are incomplete', () => {
    mockWebGL();
    detectRenderingCapabilities();

    const stored = JSON.parse(window.localStorage.getItem(recordKey()));

    stored.formats = [];
    window.localStorage.setItem(recordKey(), JSON.stringify(stored));
    detectRenderingCapabilities();

    expect(getSupportedTextureFormats).toHaveBeenCalledTimes(2);
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

    const key = `${recordKey()}.limit`;

    window.localStorage.setItem(
      key,
      JSON.stringify({ bytes: 1024, hard: false })
    );
    resetRenderingCapabilities();

    expect(getStoredGpuMemoryLimit()).toBeUndefined();
  });

  it('keeps the limit apart from the record, so a write of the record does not bring back an earlier limit', () => {
    mockWebGL();
    detectRenderingCapabilities();
    storeGpuMemoryLimit({ bytes: 512 * 1024 * 1024, hard: false });

    /**
     * Another tab read the record before the change, and writes it now, with
     * an earlier limit in it, as a version before the limit key wrote it.
     */
    const earlier = {
      ...JSON.parse(window.localStorage.getItem(recordKey())),
      memoryLimit: { bytes: 512 * 1024 * 1024, hard: false },
    };

    storeGpuMemoryLimit({ bytes: 1024 * 1024 * 1024, hard: false });
    window.localStorage.setItem(recordKey(), JSON.stringify(earlier));
    resetRenderingCapabilities();

    expect(getStoredGpuMemoryLimit()).toEqual({
      bytes: 1024 * 1024 * 1024,
      hard: false,
    });
  });

  it('reads the limit of a record from before the limit had its own key, until the user sets one', () => {
    mockWebGL();
    detectRenderingCapabilities();

    const stored = JSON.parse(window.localStorage.getItem(recordKey()));

    window.localStorage.setItem(
      recordKey(),
      JSON.stringify({
        ...stored,
        memoryLimit: { bytes: 768 * 1024 * 1024, hard: true },
      })
    );
    resetRenderingCapabilities();

    expect(getStoredGpuMemoryLimit()).toEqual({
      bytes: 768 * 1024 * 1024,
      hard: true,
    });

    storeGpuMemoryLimit({ bytes: 512 * 1024 * 1024, hard: false });
    resetRenderingCapabilities();

    expect(getStoredGpuMemoryLimit()).toEqual({
      bytes: 512 * 1024 * 1024,
      hard: false,
    });
    expect(getStoredRenderingCapabilities().memoryLimit).toBeUndefined();
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

  it('confirms a recovered crash by its own id, and counts a record that stayed once', () => {
    mockWebGL();
    detectRenderingCapabilities();

    const key = `${STORAGE_KEY}.pending.stopped-tab`;
    const marker = JSON.stringify({
      renderer: 'NVIDIA GeForce RTX 3080',
      probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
      totalBytes: 9000,
      at: Date.now() - 60000,
    });

    window.localStorage.setItem(key, marker);
    resetRenderingCapabilities();

    expect(getStoredRenderingCapabilities().gpuBytes.failed).toEqual({
      value: 9000,
      failures: 1,
    });
    expect(window.localStorage.getItem(key)).toBeNull();

    /** A refused removal left the same record: it counts once. */
    window.localStorage.setItem(key, marker);
    resetRenderingCapabilities();

    expect(getStoredRenderingCapabilities().gpuBytes.failed.failures).toBe(1);
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('handles at most 20 crash records in one start, and the rest at the next', () => {
    mockWebGL();
    detectRenderingCapabilities();

    const keys = Array.from(
      { length: 21 },
      (_, index) => `${STORAGE_KEY}.pending.stopped-tab-${index}`
    );

    keys.forEach((key) =>
      window.localStorage.setItem(
        key,
        JSON.stringify({
          renderer: 'NVIDIA GeForce RTX 3080',
          probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
          totalBytes: 9000,
          at: Date.now() - 60000,
        })
      )
    );
    resetRenderingCapabilities();

    expect(getStoredRenderingCapabilities().gpuBytes.failed.failures).toBe(20);
    expect(
      keys.filter((key) => window.localStorage.getItem(key) !== null)
    ).toHaveLength(1);

    resetRenderingCapabilities();

    expect(getStoredRenderingCapabilities().gpuBytes.failed.failures).toBe(21);
    expect(
      keys.filter((key) => window.localStorage.getItem(key) !== null)
    ).toHaveLength(0);
  });

  it('keeps the id of a crash record whose removal failed, so it counts once', () => {
    mockWebGL();
    detectRenderingCapabilities();

    const start = Date.now();
    const marker = (index) =>
      JSON.stringify({
        renderer: 'NVIDIA GeForce RTX 3080',
        probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
        totalBytes: 9000,
        at: start - 60000 - index,
      });
    const stuck = `${STORAGE_KEY}.pending.stuck-tab`;
    const removeItem = Storage.prototype.removeItem;
    const refuse = jest
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (key) {
        if (key === stuck) {
          throw new Error('SecurityError');
        }

        return removeItem.call(this, key);
      });

    try {
      window.localStorage.setItem(stuck, marker(0));
      resetRenderingCapabilities();

      expect(getStoredRenderingCapabilities().gpuBytes.failed.failures).toBe(1);

      for (let index = 1; index <= 20; index++) {
        window.localStorage.setItem(
          `${STORAGE_KEY}.pending.stopped-tab-${index}`,
          marker(index)
        );
      }

      /** The stuck id and 19 new ones fill the 20 ids; one record waits. */
      resetRenderingCapabilities();
      expect(getStoredRenderingCapabilities().gpuBytes.failed.failures).toBe(
        20
      );

      resetRenderingCapabilities();
      expect(getStoredRenderingCapabilities().gpuBytes.failed.failures).toBe(
        21
      );
      expect(window.localStorage.getItem(stuck)).not.toBeNull();
      expect(getStoredRenderingCapabilities().recoveredPending).toContain(
        `${stuck}@${JSON.parse(marker(0)).at}`
      );
    } finally {
      refuse.mockRestore();
    }
  });

  it('reports one allocation once when two contexts lose their context', () => {
    const GIGABYTE = 1024 * 1024 * 1024;

    mockWebGL();
    detectRenderingCapabilities();
    noteTextureAllocation({ textureBytes: GIGABYTE, totalBytes: GIGABYTE });

    for (const contextIndex of [0, 1]) {
      eventTarget.dispatchEvent(
        new CustomEvent(Events.WEBGL_CONTEXT_LOST, {
          detail: { contextIndex },
        })
      );
    }

    expect(getStoredRenderingCapabilities().textureBytes.failed).toEqual({
      value: GIGABYTE,
      failures: 1,
    });
  });

  it('credits a replacement upload with its own size, not an earlier one that never drew', () => {
    const MEGABYTE = 1024 * 1024;
    const owner = {};

    jest.useFakeTimers();

    try {
      mockWebGL();
      detectRenderingCapabilities();
      noteTextureAllocation({
        textureBytes: 512 * MEGABYTE,
        totalBytes: 512 * MEGABYTE,
        owner,
      });
      noteTextureAllocation({
        textureBytes: 128 * MEGABYTE,
        totalBytes: 128 * MEGABYTE,
        owner,
      });
      noteTextureRendered(undefined, [owner]);
      jest.advanceTimersByTime(5000);

      expect(getStoredRenderingCapabilities().textureBytes.largest).toEqual({
        value: 128 * MEGABYTE,
        successes: 1,
      });
      expect(getStoredRenderingCapabilities().history.largestTexture).toEqual({
        value: 128 * MEGABYTE,
        successes: 1,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not credit an earlier upload that a small upload of the same owner replaced', () => {
    const MEGABYTE = 1024 * 1024;
    const owner = {};

    jest.useFakeTimers();

    try {
      mockWebGL();
      detectRenderingCapabilities();
      noteTextureAllocation({
        textureBytes: 512 * MEGABYTE,
        totalBytes: 512 * MEGABYTE,
        owner,
      });
      noteTextureAllocation({
        textureBytes: 16 * MEGABYTE,
        totalBytes: 16 * MEGABYTE,
        owner,
      });
      noteTextureRendered(undefined, [owner]);
      jest.advanceTimersByTime(5000);

      expect(
        getStoredRenderingCapabilities().textureBytes.largest
      ).toBeUndefined();
      expect(
        getStoredRenderingCapabilities().history?.largestTexture
      ).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * A pending record that stays is counted as a crash by the next start, so
   * each way a page ends an allocation with no crash must remove it.
   */
  describe('the pending record of a large allocation', () => {
    const MEGABYTE = 1024 * 1024;
    const pendingKeys = () =>
      Object.keys(window.localStorage).filter((key) =>
        key.includes('.pending.')
      );
    const allocate = () =>
      noteTextureAllocation({
        textureBytes: 128 * MEGABYTE,
        totalBytes: 512 * MEGABYTE,
      });

    /** The failures that a context loss reports now. */
    function failuresOfLoss() {
      const failures = [];
      const listener = (event) => failures.push(event.detail);

      eventTarget.addEventListener(Events.GPU_MEMORY_FAILURE, listener);
      eventTarget.dispatchEvent(
        new CustomEvent(Events.WEBGL_CONTEXT_LOST, { detail: {} })
      );
      eventTarget.removeEventListener(Events.GPU_MEMORY_FAILURE, listener);

      return failures;
    }

    it('goes when the page closes normally, so the next start finds no crash', () => {
      mockWebGL();
      detectRenderingCapabilities();
      allocate();

      expect(pendingKeys()).toHaveLength(1);

      window.dispatchEvent(new Event('pagehide'));

      expect(pendingKeys()).toEqual([]);
    });

    it('is not written by a hidden page, and goes when the page hides, with no failure for a later loss', () => {
      mockWebGL();
      detectRenderingCapabilities();

      const visibility = jest
        .spyOn(document, 'visibilityState', 'get')
        .mockReturnValue('hidden');

      try {
        allocate();

        expect(pendingKeys()).toEqual([]);

        visibility.mockReturnValue('visible');
        allocate();

        expect(pendingKeys()).toHaveLength(1);

        /** The browser can reclaim the GPU of a hidden page. */
        visibility.mockReturnValue('hidden');
        document.dispatchEvent(new Event('visibilitychange'));

        expect(pendingKeys()).toEqual([]);
        expect(failuresOfLoss()).toEqual([]);
      } finally {
        visibility.mockRestore();
      }
    });

    it('reports a loss whose event comes after the settle time as a failure, not a success', () => {
      jest.useFakeTimers();

      try {
        mockWebGL();
        detectRenderingCapabilities();

        let lost = false;
        const gl = { isContextLost: () => lost };

        allocate();
        noteTextureRendered(gl);
        /**
         * The context is lost while the main thread is busy: the settle timer
         * runs before the browser dispatches the loss event.
         */
        lost = true;
        jest.advanceTimersByTime(5000);

        expect(
          getStoredRenderingCapabilities().textureBytes?.largest
        ).toBeUndefined();
        expect(failuresOfLoss()).toMatchObject([
          { kind: 'contextLost', failedBytes: 512 * MEGABYTE },
        ]);
      } finally {
        jest.useRealTimers();
      }
    });

    it('goes when no draw samples the texture in 30 s, and records nothing', () => {
      jest.useFakeTimers();

      try {
        mockWebGL();
        detectRenderingCapabilities();
        allocate();
        jest.advanceTimersByTime(30000);

        expect(pendingKeys()).toEqual([]);

        const { textureBytes, gpuBytes } = getStoredRenderingCapabilities();

        expect(textureBytes?.largest).toBeUndefined();
        expect(gpuBytes?.failed).toBeUndefined();
        expect(
          getStoredRenderingCapabilities().history?.buckets?.some(
            ({ successes, failures }) => successes || failures
          ) ?? false
        ).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('the history of the GPU memory', () => {
    const MEGABYTE = 1024 * 1024;
    const GIGABYTE = 1024 * MEGABYTE;

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('adds a settled allocation with its page total and its texture', () => {
      mockWebGL();
      detectRenderingCapabilities();
      noteTextureAllocation({
        textureBytes: 512 * MEGABYTE,
        totalBytes: 1.2 * GIGABYTE,
      });
      noteTextureRendered();
      jest.advanceTimersByTime(5000);

      expect(getStoredRenderingCapabilities().history).toEqual({
        buckets: { 1.5: { successes: 1, failures: 0 } },
        largestLoad: { value: 1.2 * GIGABYTE, successes: 1 },
        largestTexture: { value: 512 * MEGABYTE, successes: 1 },
      });
    });

    it('adds a context loss during an allocation as a failure of its page total', () => {
      mockWebGL();
      detectRenderingCapabilities();
      noteTextureAllocation({
        textureBytes: GIGABYTE,
        totalBytes: 3 * GIGABYTE,
      });
      eventTarget.dispatchEvent(
        new CustomEvent(Events.WEBGL_CONTEXT_LOST, { detail: {} })
      );

      expect(getStoredRenderingCapabilities().history).toEqual({
        buckets: { 3: { successes: 0, failures: 1 } },
        lastFailure: {
          kind: 'contextLost',
          at: expect.any(Number),
          failedBytes: 3 * GIGABYTE,
          textureBytes: GIGABYTE,
          limitBytes: 2 * GIGABYTE,
          limitSource: 'start',
        },
      });
    });

    it('goes with a reset of the memory records, and the edge stays', () => {
      mockWebGL();
      detectRenderingCapabilities();
      noteTextureAllocation({ textureBytes: GIGABYTE, totalBytes: GIGABYTE });
      noteTextureRendered();
      jest.advanceTimersByTime(5000);

      expect(getStoredRenderingCapabilities().history).toBeDefined();

      clearGpuMemoryRecords();

      const cleared = getStoredRenderingCapabilities();

      expect(cleared.history).toBeUndefined();
      expect(cleared.edge.reliable).toEqual({ value: 2048, successes: 1 });
    });

    it('drops the invalid parts of a stored history and keeps the rest of the record', () => {
      mockWebGL();
      detectRenderingCapabilities();

      const key = recordKey();
      const stored = JSON.parse(window.localStorage.getItem(key));

      window.localStorage.setItem(
        key,
        JSON.stringify({
          ...stored,
          memoryLimit: { bytes: GIGABYTE, hard: false },
          history: {
            buckets: {
              2: { successes: 3, failures: 1 },
              5: { successes: 1, failures: 0 },
              4: { successes: -1, failures: 0 },
              8: { successes: 0, failures: 0 },
            },
            largestLoad: { value: 'big', successes: 1 },
            largestTexture: { value: GIGABYTE, successes: 2 },
          },
        })
      );
      resetRenderingCapabilities();

      const read = getStoredRenderingCapabilities();

      expect(read.history).toEqual({
        buckets: { 2: { successes: 3, failures: 1 } },
        largestTexture: { value: GIGABYTE, successes: 2 },
      });
      expect(read.memoryLimit).toEqual({ bytes: GIGABYTE, hard: false });
      expect(read.probeVersion).toBe(RENDERING_CAPABILITIES_PROBE_VERSION);
    });
  });
});
