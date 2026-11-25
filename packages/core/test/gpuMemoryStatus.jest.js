import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  getGpuMemoryLimit,
  resetGpuMemoryLimit,
  setGpuMemoryLimit,
} from '../src/utilities/gpuSettingsPresets';
import { getGpuMemoryStatus } from '../src/utilities/gpuMemoryStatus';
import {
  GPU_MEMORY_BUCKETS_GB,
  acknowledgeGpuMemoryFailure,
  getGpuMemoryHistory,
  getLastGpuMemoryFailure,
  suggestGpuMemoryLimit,
} from '../src/utilities/gpuMemoryHistory';
import {
  canRunGpuMemoryCalibration,
  runGpuMemoryCalibration,
} from '../src/utilities/gpuMemoryCalibration';
import {
  isWebGLBlocked,
  whenWebGLAvailable,
} from '../src/utilities/webglAvailability';
import {
  recordRenderingCapabilitySuccess,
  resetRenderingCapabilities,
} from '../src/utilities/renderingCapabilities';
import {
  resetGpuMemoryLedger,
  setGpuMemoryEntry,
} from '../src/utilities/gpuMemoryLedger';
import { probeRenderingLimits } from '../src/utilities/textureSupport';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeEdgeSearch: jest.fn(),
}));

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;
let getContextSpy;

/** A WebGL2 context of one renderer, which is all that the detection reads. */
function mockWebGL(renderer = 'NVIDIA GeForce RTX 3080') {
  const gl = {
    getParameter: (param) => (param === 'unmasked-renderer' ? renderer : 16384),
    getExtension: (name) =>
      name === 'WEBGL_debug_renderer_info'
        ? { UNMASKED_RENDERER_WEBGL: 'unmasked-renderer' }
        : null,
  };

  getContextSpy = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((type) => (type === 'webgl2' ? gl : null));
  probeRenderingLimits.mockReturnValue({
    formats: { float: true, norm16: false },
    max3DTextureSize: 2048,
    reliableEdge: 2048,
  });
}

/** Collects the events of one type while `run` runs. */
function eventsDuring(type, run) {
  const details = [];
  const listener = (event) => details.push(event.detail);

  eventTarget.addEventListener(type, listener);

  try {
    run();
  } finally {
    eventTarget.removeEventListener(type, listener);
  }

  return details;
}

afterEach(() => {
  resetGpuMemoryLimit();
  resetGpuMemoryLedger();
  getContextSpy?.mockRestore();
  getContextSpy = undefined;
  resetRenderingCapabilities({ clearStorage: true });
});

describe('the GPU memory status', () => {
  it('states the limit, its source, the start and the bytes of the page', () => {
    mockWebGL();
    setGpuMemoryEntry('texture', { kind: 'texture', bytes: 300 * MEGABYTE });

    expect(getGpuMemoryStatus()).toEqual({
      applies: true,
      limitBytes: 2 * GIGABYTE,
      source: 'start',
      hard: false,
      startBytes: 2 * GIGABYTE,
      rendererClass: 'desktop',
      pageBytes: 300 * MEGABYTE,
      noGpuSizeWorks: false,
      cpuRecommended: false,
      canCalibrate: false,
      webglBlocked: false,
    });
  });

  it('follows a hard limit that the user sets, and keeps the start of the device', () => {
    mockWebGL();
    setGpuMemoryLimit({ bytes: GIGABYTE, hard: true });

    expect(getGpuMemoryStatus()).toMatchObject({
      limitBytes: GIGABYTE,
      source: 'hardUser',
      hard: true,
      startBytes: 2 * GIGABYTE,
    });
  });

  it('states no limit on a software renderer', () => {
    mockWebGL('Google SwiftShader');

    const status = getGpuMemoryStatus();

    expect(status.applies).toBe(false);
    expect(status.rendererClass).toBe('software');
    expect(status).not.toHaveProperty('limitBytes');
    expect(status).not.toHaveProperty('startBytes');
  });
});

describe('the GPU memory history', () => {
  it('has one empty bucket for each size and one above 32 GB', () => {
    mockWebGL();

    const { buckets } = getGpuMemoryHistory();

    expect(buckets.map(({ gb }) => gb)).toEqual([
      ...GPU_MEMORY_BUCKETS_GB,
      Number.POSITIVE_INFINITY,
    ]);
    expect(
      buckets.every(({ successes, failures }) => !successes && !failures)
    ).toBe(true);
    expect(Object.isFrozen(GPU_MEMORY_BUCKETS_GB)).toBe(true);
  });

  it('states the largest page total that worked, as a copy', () => {
    mockWebGL();

    expect(getGpuMemoryHistory().largestLoad).toBeUndefined();

    recordRenderingCapabilitySuccess('textureBytes', 300 * MEGABYTE);
    recordRenderingCapabilitySuccess('textureBytes', 300 * MEGABYTE);

    const history = getGpuMemoryHistory();

    expect(history.largestLoad).toEqual({
      bytes: 300 * MEGABYTE,
      successes: 2,
    });

    history.largestLoad.bytes = 1;

    expect(getGpuMemoryHistory().largestLoad.bytes).toBe(300 * MEGABYTE);
  });

  it('suggests the current limit while no failure is recorded', () => {
    mockWebGL();

    expect(suggestGpuMemoryLimit()).toBe(2 * GIGABYTE);

    setGpuMemoryLimit({ bytes: 512 * MEGABYTE });

    expect(suggestGpuMemoryLimit()).toBe(512 * MEGABYTE);
    expect(getLastGpuMemoryFailure()).toBeUndefined();
    expect(() => acknowledgeGpuMemoryFailure()).not.toThrow();
  });
});

describe('the calibration run and the WebGL wait', () => {
  it('offers no calibration before a failure, and a run rejects', async () => {
    mockWebGL();

    expect(canRunGpuMemoryCalibration()).toBe(false);
    await expect(runGpuMemoryCalibration()).rejects.toThrow(
      'no GPU memory failure is recorded'
    );
  });

  it('reports WebGL as available', async () => {
    expect(isWebGLBlocked()).toBe(false);
    await expect(whenWebGLAvailable()).resolves.toBeUndefined();
  });
});

describe('GPU_MEMORY_LIMIT_CHANGED', () => {
  it('fires on a set and a reset with the previous and the current limit, before the texture limits change', () => {
    mockWebGL();

    const order = [];
    const onLimit = () => order.push('limit');
    const onTextureLimits = () => order.push('textureLimits');

    eventTarget.addEventListener(Events.GPU_MEMORY_LIMIT_CHANGED, onLimit);
    eventTarget.addEventListener(
      Events.VOLUME_TEXTURE_LIMITS_CHANGED,
      onTextureLimits
    );

    let details;

    try {
      details = eventsDuring(Events.GPU_MEMORY_LIMIT_CHANGED, () => {
        setGpuMemoryLimit({ bytes: GIGABYTE });
        resetGpuMemoryLimit();
      });
    } finally {
      eventTarget.removeEventListener(Events.GPU_MEMORY_LIMIT_CHANGED, onLimit);
      eventTarget.removeEventListener(
        Events.VOLUME_TEXTURE_LIMITS_CHANGED,
        onTextureLimits
      );
    }

    const start = { bytes: 2 * GIGABYTE, source: 'start', hard: false };
    const user = { bytes: GIGABYTE, source: 'user', hard: false };

    expect(details).toEqual([
      { previous: start, current: user },
      { previous: user, current: start },
    ]);
    expect(order).toEqual(['limit', 'textureLimits', 'limit', 'textureLimits']);
    expect(getGpuMemoryLimit()).toEqual(start);
  });
});
