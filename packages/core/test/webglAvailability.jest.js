import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import {
  GPU_FAILURE_TIMES_KEY,
  WEBGL_BLOCK_KEY,
  WEBGL_BLOCK_MS,
  getWebGLBlock,
  isWebGLBlocked,
  noteContextCreationRefused,
  noteGpuMemoryFailure,
  resetWebGLAvailability,
  startWebGLBlock,
  whenWebGLAvailable,
} from '../src/utilities/webglAvailability';
import {
  detectRenderingCapabilities,
  getRenderingCapabilities,
  resetRenderingCapabilities,
} from '../src/utilities/renderingCapabilities';
import { probeRenderingLimits } from '../src/utilities/textureSupport';
import { reportGpuMemoryFailure } from '../src/utilities/gpuMemoryFailures';
import gridFitsGpuSettings from '../src/RenderingEngine/vtkClasses/gridFitsGpuSettings';
import vtkStreamingOpenGLRenderWindow from '../src/RenderingEngine/vtkClasses/vtkStreamingOpenGLRenderWindow';
import { setLossyDownsampling } from '../src/init';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeEdgeSearch: jest.fn(),
}));

const RENDERER = 'NVIDIA GeForce RTX 3080';
const CHROME_UA =
  'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

let getContextSpy;
let userAgentSpy;
let availability;

/** A context of the renderer, or none, for every canvas of the page. */
function mockContexts(available = true) {
  const loseContext = jest.fn();
  const gl = {
    getParameter: (param) => (param === 'unmasked-renderer' ? RENDERER : 16384),
    getExtension: (name) => {
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_RENDERER_WEBGL: 'unmasked-renderer' };
      }

      return name === 'WEBGL_lose_context' ? { loseContext } : null;
    },
  };

  getContextSpy?.mockRestore();
  getContextSpy = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((type) => (available && type === 'webgl2' ? gl : null));

  return { loseContext };
}

/** Makes the page a Chromium page. */
function asChromium() {
  userAgentSpy = jest
    .spyOn(window.navigator, 'userAgent', 'get')
    .mockReturnValue(CHROME_UA);
}

/** Another tab writes the wait, and this tab receives its storage event. */
function otherTabWrites(value) {
  if (value === null) {
    window.localStorage.removeItem(WEBGL_BLOCK_KEY);
  } else {
    window.localStorage.setItem(WEBGL_BLOCK_KEY, JSON.stringify(value));
  }

  window.dispatchEvent(new StorageEvent('storage', { key: WEBGL_BLOCK_KEY }));
}

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  resetWebGLAvailability();
  resetRenderingCapabilities();
  probeRenderingLimits.mockReturnValue({
    formats: {
      norm16: true,
      norm16Linear: true,
      unorm16: true,
      unorm16Linear: true,
      float: true,
      floatLinear: true,
      halfFloat: true,
      halfFloatLinear: true,
    },
    max3DTextureSize: 2048,
    reliableEdge: 2048,
  });
  availability = [];
  eventTarget.addEventListener(Events.WEBGL_AVAILABILITY_CHANGED, record);
});

afterEach(() => {
  eventTarget.removeEventListener(Events.WEBGL_AVAILABILITY_CHANGED, record);
  getContextSpy?.mockRestore();
  getContextSpy = undefined;
  userAgentSpy?.mockRestore();
  userAgentSpy = undefined;
  resetWebGLAvailability();
  resetRenderingCapabilities({ clearStorage: true });
  window.localStorage.clear();
  setLossyDownsampling({ final: false });
  jest.useRealTimers();
});

function record(event) {
  availability.push(event.detail);
}

describe('the cooldown of a browser that does not block', () => {
  it('waits two minutes after the second failure within two minutes, then ends in every listener', async () => {
    noteGpuMemoryFailure();

    expect(isWebGLBlocked()).toBe(false);

    jest.advanceTimersByTime(30000);
    noteGpuMemoryFailure();

    expect(getWebGLBlock()).toEqual({
      until: Date.now() + WEBGL_BLOCK_MS,
      reason: 'cooldown',
    });
    expect(availability).toEqual([
      {
        blocked: true,
        until: Date.now() + WEBGL_BLOCK_MS,
        reason: 'cooldown',
        sourceTab: 'self',
      },
    ]);

    const available = jest.fn();

    whenWebGLAvailable().then(available);
    jest.advanceTimersByTime(WEBGL_BLOCK_MS);
    await Promise.resolve();

    expect(isWebGLBlocked()).toBe(false);
    expect(available).toHaveBeenCalled();
    expect(availability[1]).toEqual({ blocked: false, sourceTab: 'self' });
    expect(window.localStorage.getItem(WEBGL_BLOCK_KEY)).toBeNull();
  });

  it('counts a recent failure of another tab, and not one older than two minutes', () => {
    window.localStorage.setItem(
      GPU_FAILURE_TIMES_KEY,
      JSON.stringify([Date.now() - WEBGL_BLOCK_MS - 1])
    );
    noteGpuMemoryFailure();

    expect(isWebGLBlocked()).toBe(false);

    window.localStorage.setItem(
      GPU_FAILURE_TIMES_KEY,
      JSON.stringify([Date.now() - 1000])
    );
    noteGpuMemoryFailure();

    expect(getWebGLBlock()?.reason).toBe('cooldown');
  });

  it('states the end of the wait in the failure that starts it', () => {
    mockContexts();
    detectRenderingCapabilities();

    const details = [];
    const onFailure = (event) => details.push(event.detail);

    eventTarget.addEventListener(Events.GPU_MEMORY_FAILURE, onFailure);
    reportGpuMemoryFailure({ kind: 'contextLost', failedBytes: 2 ** 30 });
    reportGpuMemoryFailure({ kind: 'outOfMemory', failedBytes: 2 ** 30 });
    eventTarget.removeEventListener(Events.GPU_MEMORY_FAILURE, onFailure);

    expect(details[0].webglBlockedUntil).toBeUndefined();
    expect(details[1].webglBlockedUntil).toBe(Date.now() + WEBGL_BLOCK_MS);
  });
});

describe('the wait of another tab', () => {
  it('starts and ends in this tab through the storage event', async () => {
    const until = Date.now() + 60000;

    otherTabWrites({ until, reason: 'chrome', at: Date.now() });

    expect(availability).toEqual([
      { blocked: true, until, reason: 'chrome', sourceTab: 'other' },
    ]);
    expect(isWebGLBlocked()).toBe(true);

    const available = jest.fn();

    whenWebGLAvailable().then(available);
    otherTabWrites(null);
    await Promise.resolve();

    expect(availability[1]).toEqual({ blocked: false, sourceTab: 'other' });
    expect(available).toHaveBeenCalled();
  });

  it('ignores and removes an end further away than one wait', () => {
    window.localStorage.setItem(
      WEBGL_BLOCK_KEY,
      JSON.stringify({
        until: Date.now() + 10 * 60000,
        reason: 'cooldown',
        at: Date.now(),
      })
    );

    expect(isWebGLBlocked()).toBe(false);
    expect(window.localStorage.getItem(WEBGL_BLOCK_KEY)).toBeNull();
  });

  it('keeps a later end when this tab starts a shorter wait', () => {
    startWebGLBlock(Date.now() + 90000, 'chrome');
    startWebGLBlock(Date.now() + 10000, 'cooldown');

    expect(getWebGLBlock()).toEqual({
      until: Date.now() + 90000,
      reason: 'chrome',
    });
  });
});

describe('the block of Chromium', () => {
  beforeEach(() => asChromium());

  it('starts a wait when a test context fails one second after a failure', () => {
    mockContexts(false);
    noteGpuMemoryFailure();

    expect(isWebGLBlocked()).toBe(false);

    jest.advanceTimersByTime(1000);

    expect(getWebGLBlock()?.reason).toBe('chrome');
  });

  it('starts no wait when the test context works, and loses that context', () => {
    const { loseContext } = mockContexts(true);

    noteGpuMemoryFailure();
    noteGpuMemoryFailure();
    jest.advanceTimersByTime(1000);

    expect(isWebGLBlocked()).toBe(false);
    expect(loseContext).toHaveBeenCalled();
  });

  it('checks again at the end, and waits 30 s more while the browser still refuses', () => {
    mockContexts(false);
    startWebGLBlock(Date.now() + 1000, 'chrome');
    jest.advanceTimersByTime(1000);

    expect(getWebGLBlock()).toEqual({
      until: Date.now() + 30000,
      reason: 'chrome',
    });
    expect(availability.some(({ blocked }) => !blocked)).toBe(false);

    mockContexts(true);
    jest.advanceTimersByTime(30000);

    expect(isWebGLBlocked()).toBe(false);
    expect(availability[availability.length - 1].blocked).toBe(false);
  });

  it('runs the check of an overdue wait before it reports WebGL as available', async () => {
    mockContexts(false);
    startWebGLBlock(Date.now() + 1000, 'chrome');

    /** A hidden tab: the time passes, and the timer has not run yet. */
    jest.setSystemTime(Date.now() + 5000);

    const available = jest.fn();

    whenWebGLAvailable().then(available);
    await Promise.resolve();

    expect(available).not.toHaveBeenCalled();
    expect(getWebGLBlock()).toEqual({
      until: Date.now() + 30000,
      reason: 'chrome',
    });
  });

  it('starts a wait from the last failure when a context is refused', () => {
    window.localStorage.setItem(
      GPU_FAILURE_TIMES_KEY,
      JSON.stringify([Date.now() - 20000])
    );
    noteContextCreationRefused('');

    expect(getWebGLBlock()).toEqual({
      until: Date.now() - 20000 + WEBGL_BLOCK_MS,
      reason: 'chrome',
    });
  });
});

describe('a refused context with no sign of a block', () => {
  it('starts no wait in Chromium when WebGL never worked on the device', () => {
    asChromium();
    mockContexts(false);

    const capabilities = detectRenderingCapabilities();

    expect(isWebGLBlocked()).toBe(false);
    expect(capabilities.webgl).toBe(false);
    expect(capabilities.webglBlocked).toBeUndefined();
  });
});

describe('a store that refuses the wait', () => {
  it('keeps the wait of this tab until its end', async () => {
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    try {
      startWebGLBlock(Date.now() + 60000, 'cooldown');

      const available = jest.fn();

      whenWebGLAvailable().then(available);
      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(getWebGLBlock()).toEqual({
        until: Date.now() + 30000,
        reason: 'cooldown',
      });
      expect(available).not.toHaveBeenCalled();

      /** A shorter wait does not end it early. */
      startWebGLBlock(Date.now() + 1000, 'cooldown');
      expect(getWebGLBlock()?.until).toBe(Date.now() + 30000);

      jest.advanceTimersByTime(30000);
      await Promise.resolve();

      expect(isWebGLBlocked()).toBe(false);
      expect(available).toHaveBeenCalledTimes(1);
    } finally {
      setItem.mockRestore();
    }
  });
});

describe('the end of a wait', () => {
  it('does not resolve a waiter of a wait that a listener starts at the end', async () => {
    startWebGLBlock(Date.now() + 1000, 'cooldown');

    const later = jest.fn();
    const onEnd = (event) => {
      if (!event.detail.blocked) {
        startWebGLBlock(Date.now() + 60000, 'cooldown');
        whenWebGLAvailable().then(later);
      }
    };

    eventTarget.addEventListener(Events.WEBGL_AVAILABILITY_CHANGED, onEnd);

    try {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(isWebGLBlocked()).toBe(true);
      expect(later).not.toHaveBeenCalled();
    } finally {
      eventTarget.removeEventListener(Events.WEBGL_AVAILABILITY_CHANGED, onEnd);
    }
  });
});

describe('a refused context outside Chromium', () => {
  it('starts no wait without a block message, and starts one with it', () => {
    noteContextCreationRefused('');

    expect(isWebGLBlocked()).toBe(false);

    noteContextCreationRefused('Web page caused context loss and was blocked');

    expect(getWebGLBlock()?.reason).toBe('chrome');
  });
});

describe('the detection during a wait', () => {
  it('creates no context, keeps WebGL from the stored record, and detects again at the end', () => {
    mockContexts();
    detectRenderingCapabilities();
    resetRenderingCapabilities();
    startWebGLBlock(Date.now() + 60000, 'cooldown');
    getContextSpy.mockClear();

    const capabilities = getRenderingCapabilities();

    expect(capabilities).toMatchObject({
      webgl: true,
      webglBlocked: true,
      renderer: RENDERER,
      norm16: true,
      max3DTextureSize: 2048,
    });
    expect(getContextSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(60000);

    expect(getRenderingCapabilities().webglBlocked).toBeUndefined();
    expect(getContextSpy).toHaveBeenCalled();
  });

  it('keeps the GPU path when Chromium refuses the first context of a page', () => {
    asChromium();
    mockContexts();
    detectRenderingCapabilities();
    resetRenderingCapabilities();
    mockContexts(false);

    const capabilities = detectRenderingCapabilities();

    expect(capabilities.webgl).toBe(true);
    expect(capabilities.webglBlocked).toBe(true);
    expect(getWebGLBlock()?.reason).toBe('chrome');
  });
});

describe('the gate of large textures', () => {
  it('refuses a texture of 64 MB or more during a wait, also with final downsampling off', () => {
    mockContexts();
    startWebGLBlock(Date.now() + 60000, 'cooldown');

    expect(gridFitsGpuSettings([512, 512, 256], 'Float32Array', 1)).toBe(false);
    expect(gridFitsGpuSettings([256, 256, 64], 'Float32Array', 1)).toBe(true);

    setLossyDownsampling({ final: true });

    expect(gridFitsGpuSettings([512, 512, 256], 'Float32Array', 1)).toBe(false);

    jest.advanceTimersByTime(60000);

    expect(gridFitsGpuSettings([512, 512, 256], 'Float32Array', 1)).toBe(true);
  });
});

describe('a render window with no context', () => {
  it('asks the browser for no context during a wait, and renders nothing', () => {
    mockContexts();
    startWebGLBlock(Date.now() + 60000, 'cooldown');
    getContextSpy.mockClear();

    const renderWindow = vtkStreamingOpenGLRenderWindow.newInstance();

    expect(renderWindow.get3DContext()).toBeNull();
    expect(() => renderWindow.traverseAllPasses()).not.toThrow();
    expect(renderWindow.isWaitingForWebGL()).toBe(true);
    expect(getContextSpy).not.toHaveBeenCalled();

    renderWindow.delete();
  });

  it('returns no context when the browser refuses one, instead of throwing', () => {
    asChromium();
    mockContexts(false);

    const renderWindow = vtkStreamingOpenGLRenderWindow.newInstance();

    expect(renderWindow.get3DContext()).toBeNull();
    expect(getWebGLBlock()?.reason).toBe('chrome');

    renderWindow.delete();
  });
});
