import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import {
  CALIBRATION_PENDING_KEY,
  canRunGpuMemoryCalibration,
  runGpuMemoryCalibration,
} from '../src/utilities/gpuMemoryCalibration';
import { createGpuMemoryStress } from '../src/utilities/gpuMemoryStress';
import {
  detectRenderingCapabilities,
  getStoredRenderingCapabilities,
  recordGpuMemoryOutcome,
  resetRenderingCapabilities,
} from '../src/utilities/renderingCapabilities';
import {
  acknowledgeGpuMemoryFailure,
  reportGpuMemoryFailure,
  suggestGpuMemoryLimit,
} from '../src/utilities/gpuMemoryFailures';
import { getGpuMemoryStatus } from '../src/utilities/gpuMemoryStatus';
import { noteTextureAllocation } from '../src/utilities/gpuAllocationTracker';
import {
  WEBGL_BLOCK_KEY,
  getWebGLBlock,
  isWebGLBlocked,
  resetWebGLAvailability,
  startWebGLBlock,
} from '../src/utilities/webglAvailability';
import { probeRenderingLimits } from '../src/utilities/textureSupport';
import { resetGpuMemoryLimit } from '../src/utilities/gpuSettingsPresets';
import { setLossyDownsampling } from '../src/init';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeEdgeSearch: jest.fn(),
}));
jest.mock('../src/utilities/gpuMemoryStress', () => ({
  createGpuMemoryStress: jest.fn(),
}));

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;
const RENDERER = 'NVIDIA GeForce RTX 3080';
let getContextSpy;

/** A WebGL2 context of one renderer, which is all that the detection reads. */
function mockWebGL() {
  const gl = {
    getParameter: (param) => (param === 'unmasked-renderer' ? RENDERER : 16384),
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

/**
 * A run context that holds up to `capacity` bytes, and records each target
 * with the stored records at that moment.
 */
function fakeStress(capacity, onGrow = () => undefined) {
  const steps = [];
  const stress = {
    allocatedBytes: () => 0,
    growTo: jest.fn(async (targetBytes) => {
      steps.push({
        targetBytes,
        pending: JSON.parse(
          window.localStorage.getItem(CALIBRATION_PENDING_KEY)
        ),
        block: getWebGLBlock(),
      });
      onGrow(targetBytes);

      return targetBytes <= capacity;
    }),
    release: jest.fn(),
  };

  createGpuMemoryStress.mockReturnValue(stress);

  return { stress, steps };
}

/** A failure at this page total, as the tracker records and reports it. */
function fail(failedBytes) {
  recordGpuMemoryOutcome({ succeeded: false, totalBytes: failedBytes });
  reportGpuMemoryFailure({ kind: 'outOfMemory', failedBytes });
  acknowledgeGpuMemoryFailure();
  /** Only the calibration wait matters in these tests. */
  window.localStorage.removeItem(WEBGL_BLOCK_KEY);
  resetWebGLAvailability();
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetWebGLAvailability();
  resetRenderingCapabilities();
  setLossyDownsampling({ final: true });
  mockWebGL();
  detectRenderingCapabilities();
});

afterEach(() => {
  resetGpuMemoryLimit();
  getContextSpy?.mockRestore();
  getContextSpy = undefined;
  resetWebGLAvailability();
  resetRenderingCapabilities({ clearStorage: true });
  window.localStorage.clear();
  setLossyDownsampling({ final: false });
  jest.useRealTimers();
});

describe('when a calibration may run', () => {
  it('needs a recorded failure and WebGL that does not wait', () => {
    expect(canRunGpuMemoryCalibration()).toBe(false);

    fail(GIGABYTE);

    expect(canRunGpuMemoryCalibration()).toBe(true);

    startWebGLBlock(Date.now() + 60000, 'cooldown');

    expect(canRunGpuMemoryCalibration()).toBe(false);
  });
});

describe('a calibration run', () => {
  it('starts at 90 % of the failed size, adds 10 % of it each step, and records the last step that worked', async () => {
    fail(GIGABYTE);

    const { stress, steps } = fakeStress(1.1 * GIGABYTE);
    const calibrated = [];
    const onCalibrated = (event) => calibrated.push(event.detail);

    eventTarget.addEventListener(Events.GPU_MEMORY_CALIBRATED, onCalibrated);

    const result = await runGpuMemoryCalibration();

    eventTarget.removeEventListener(Events.GPU_MEMORY_CALIBRATED, onCalibrated);

    const start = Math.round(0.9 * GIGABYTE);
    const step = Math.round(0.1 * start);

    expect(steps.map(({ targetBytes }) => targetBytes)).toEqual([
      start,
      start + step,
      start + 2 * step,
      start + 3 * step,
    ]);
    expect(result).toEqual({
      largestSuccessBytes: start + 2 * step,
      failedBytes: start + 3 * step,
      at: expect.any(Number),
    });
    expect(calibrated).toEqual([result]);
    expect(stress.release).toHaveBeenCalled();
    expect(getStoredRenderingCapabilities().history.calibration).toEqual(
      result
    );
    /** The suggestion follows the calibration, rounded down to a bucket. */
    expect(suggestGpuMemoryLimit()).toBe(GIGABYTE);
  });

  it('stores a record and starts a wait for WebGL before each step, and removes the record at the end', async () => {
    fail(GIGABYTE);

    const { steps } = fakeStress(0);

    await runGpuMemoryCalibration();

    expect(steps[0].pending).toMatchObject({
      step: 0,
      targetBytes: Math.round(0.9 * GIGABYTE),
      lastOkBytes: 0,
      renderer: RENDERER,
    });
    expect(steps[0].block?.reason).toBe('calibration');
    expect(window.localStorage.getItem(CALIBRATION_PENDING_KEY)).toBeNull();
    /** After a failure, the wait of the run goes on. */
    expect(isWebGLBlocked()).toBe(true);
  });

  it('stops at 32 GB with no failure, and ends its wait', async () => {
    fail(GIGABYTE);

    const { steps } = fakeStress(Infinity);
    const result = await runGpuMemoryCalibration({
      startBytes: 30 * GIGABYTE,
      stepBytes: GIGABYTE,
    });

    expect(steps.map(({ targetBytes }) => targetBytes / GIGABYTE)).toEqual([
      30, 31, 32,
    ]);
    expect(result.largestSuccessBytes).toBe(32 * GIGABYTE);
    expect(result.failedBytes).toBeUndefined();
    expect(isWebGLBlocked()).toBe(false);
  });

  it('records no failure of the viewer for a context loss during the run', async () => {
    fail(GIGABYTE);

    const bucketsBefore = getStoredRenderingCapabilities().history.buckets;

    noteTextureAllocation({ textureBytes: GIGABYTE, totalBytes: 2 * GIGABYTE });
    fakeStress(0, () =>
      eventTarget.dispatchEvent(
        new CustomEvent(Events.WEBGL_CONTEXT_LOST, { detail: {} })
      )
    );

    await runGpuMemoryCalibration();

    expect(getStoredRenderingCapabilities().history.buckets).toEqual(
      bucketsBefore
    );
    expect(
      Object.keys(window.localStorage).some((key) => key.includes('.pending.'))
    ).toBe(false);
  });

  it('states that no GPU size works when the first step fails at 128 MB or below', async () => {
    fail(GIGABYTE);
    fakeStress(0);

    await runGpuMemoryCalibration({ startBytes: 100 * MEGABYTE });

    expect(getGpuMemoryStatus().noGpuSizeWorks).toBe(true);
  });

  it('rejects a second run while one is under way', async () => {
    fail(GIGABYTE);

    let release;

    createGpuMemoryStress.mockReturnValue({
      allocatedBytes: () => 0,
      growTo: () =>
        new Promise((resolve) => {
          release = () => resolve(false);
        }),
      release: jest.fn(),
    });

    const first = runGpuMemoryCalibration();

    await expect(runGpuMemoryCalibration()).rejects.toThrow('only after');

    release();
    await first;
  });
});

describe('a run that stopped its tab', () => {
  /** A record of a step that a page left when it stopped. */
  function leaveRecord({ tabId, pageId, age }) {
    window.localStorage.setItem(
      CALIBRATION_PENDING_KEY,
      JSON.stringify({
        tabId,
        pageId,
        renderer: RENDERER,
        step: 3,
        targetBytes: 3 * GIGABYTE,
        lastOkBytes: 2.7 * GIGABYTE,
        at: Date.now() - age,
      })
    );
  }

  /**
   * Starts a new page in the same tab, with the calibration module loaded.
   *
   * @returns the results that the new page fired
   */
  function startNextPage() {
    const results = [];

    jest.isolateModules(() => {
      const nextEvents = require('../src/eventTarget').default;
      const nextEnums = require('../src/enums/Events').default;

      require('../src/utilities/gpuMemoryCalibration');
      nextEvents.addEventListener(nextEnums.GPU_MEMORY_CALIBRATED, (event) =>
        results.push(event.detail)
      );
      require('../src/utilities/renderingCapabilities').getRenderingCapabilities();
      jest.runAllTimers();
    });

    return results;
  }

  it('is recorded by the next page of the tab, with the step that ran as the failure', () => {
    jest.useFakeTimers();
    window.sessionStorage.setItem('cornerstone3D.tabId', 'this-tab');
    leaveRecord({ tabId: 'this-tab', pageId: 'earlier-page', age: 1000 });

    expect(startNextPage()).toEqual([
      {
        largestSuccessBytes: 2.7 * GIGABYTE,
        failedBytes: 3 * GIGABYTE,
        at: expect.any(Number),
      },
    ]);
    expect(window.localStorage.getItem(CALIBRATION_PENDING_KEY)).toBeNull();
  });

  it('stays while it is young and of another tab, which may still run it', () => {
    jest.useFakeTimers();
    window.sessionStorage.setItem('cornerstone3D.tabId', 'this-tab');
    leaveRecord({ tabId: 'other-tab', pageId: 'other-page', age: 1000 });

    expect(startNextPage()).toEqual([]);
    expect(window.localStorage.getItem(CALIBRATION_PENDING_KEY)).not.toBeNull();
  });
});
