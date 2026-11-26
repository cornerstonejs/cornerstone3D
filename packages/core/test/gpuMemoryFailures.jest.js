import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  jest,
} from '@jest/globals';
import {
  RENDERING_CAPABILITIES_PROBE_VERSION,
  detectRenderingCapabilities,
  getStoredRenderingCapabilities,
  recordGpuMemoryOutcome,
  resetRenderingCapabilities,
  storeGpuMemoryCalibration,
} from '../src/utilities/renderingCapabilities';
import {
  checkTextureOutOfMemory,
  noteTextureAllocation,
} from '../src/utilities/gpuAllocationTracker';
import {
  ONE_OFF_MIN_SUCCESSES,
  acknowledgeGpuMemoryFailure,
  getLastGpuMemoryFailure,
  reportGpuMemoryFailure,
  suggestGpuMemoryLimit,
} from '../src/utilities/gpuMemoryFailures';
import { getGpuMemoryStatus } from '../src/utilities/gpuMemoryStatus';
import { resetGpuMemoryLimit } from '../src/utilities/gpuSettingsPresets';
import { probeRenderingLimits } from '../src/utilities/textureSupport';
import { setLossyDownsampling } from '../src/init';
import { resetWebGLAvailability } from '../src/utilities/webglAvailability';
import eventTarget from '../src/eventTarget';
import Events from '../src/enums/Events';

jest.mock('../src/utilities/textureSupport', () => ({
  probeRenderingLimits: jest.fn(),
  probeEdgeSearch: jest.fn(),
}));

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;
const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';
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

/** The details of `GPU_MEMORY_FAILURE` while `run` runs. */
function failuresDuring(run) {
  const details = [];
  const listener = (event) => details.push(event.detail);

  eventTarget.addEventListener(Events.GPU_MEMORY_FAILURE, listener);

  try {
    run();
  } finally {
    eventTarget.removeEventListener(Events.GPU_MEMORY_FAILURE, listener);
  }

  return details;
}

/** A fake context whose `getError` gives these errors, then `NO_ERROR`. */
function glWithErrors(errors) {
  const queue = [...errors];

  return {
    NO_ERROR: 0,
    INVALID_OPERATION: 0x0502,
    OUT_OF_MEMORY: 0x0505,
    getError: jest.fn(() => queue.shift() ?? 0),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  /** A wait of an earlier test holds in this tab until its end. */
  resetWebGLAvailability();
  resetRenderingCapabilities();
  setLossyDownsampling({ final: true });
  mockWebGL();
  detectRenderingCapabilities();
});

afterEach(() => {
  acknowledgeGpuMemoryFailure();
  resetGpuMemoryLimit();
  getContextSpy?.mockRestore();
  getContextSpy = undefined;
  resetRenderingCapabilities({ clearStorage: true });
  setLossyDownsampling({ final: false });
  jest.useRealTimers();
});

describe('GPU_MEMORY_FAILURE after a context loss', () => {
  it('states the failure, the engine and context, and that the page must reload', () => {
    noteTextureAllocation({
      textureBytes: GIGABYTE,
      totalBytes: 3 * GIGABYTE,
    });

    const [detail] = failuresDuring(() =>
      eventTarget.dispatchEvent(
        new CustomEvent(Events.WEBGL_CONTEXT_LOST, {
          detail: { renderingEngineId: 'engine', contextIndex: 2 },
        })
      )
    );

    expect(detail).toMatchObject({
      kind: 'contextLost',
      failedBytes: 3 * GIGABYTE,
      textureBytes: GIGABYTE,
      limitBytes: 2 * GIGABYTE,
      limitSource: 'start',
      successesAtOrAboveFailed: 0,
      failuresAtOrAboveFailed: 1,
      oneOff: false,
      suggestedBytes: 128 * MEGABYTE,
      canCalibrate: true,
      mustReload: true,
      noGpuSizeWorks: false,
      renderingEngineId: 'engine',
      contextIndex: 2,
    });
    expect(detail.history.lastFailure).toMatchObject({ kind: 'contextLost' });
    expect(getStoredRenderingCapabilities().history.lastFailure.kind).toBe(
      'contextLost'
    );
  });

  it('keeps the failure for a late listener until it is acknowledged', () => {
    reportGpuMemoryFailure({ kind: 'contextLost', failedBytes: GIGABYTE });

    expect(getLastGpuMemoryFailure()).toMatchObject({
      kind: 'contextLost',
      failedBytes: GIGABYTE,
    });

    acknowledgeGpuMemoryFailure();

    expect(getLastGpuMemoryFailure()).toBeUndefined();
    expect(getStoredRenderingCapabilities().history.lastFailure).toBeDefined();
  });
});

describe('the suggested limit', () => {
  /** Records a failure in its bucket, then reports it, as the tracker does. */
  function fail(failedBytes) {
    recordGpuMemoryOutcome({ succeeded: false, totalBytes: failedBytes });
    reportGpuMemoryFailure({ kind: 'contextLost', failedBytes });

    return getLastGpuMemoryFailure();
  }

  const succeed = (totalBytes) =>
    recordGpuMemoryOutcome({ succeeded: true, totalBytes });

  it('keeps the current limit after the first failure of a size that worked several times', () => {
    for (let index = 0; index < ONE_OFF_MIN_SUCCESSES; index++) {
      succeed(1.8 * GIGABYTE);
    }

    const detail = fail(1.9 * GIGABYTE);

    expect(detail.oneOff).toBe(true);
    expect(detail.suggestedBytes).toBe(2 * GIGABYTE);
  });

  it('offers the largest load that worked below the failed size, rounded down to a bucket', () => {
    succeed(900 * MEGABYTE);

    const detail = fail(3 * GIGABYTE);

    expect(detail.oneOff).toBe(false);
    expect(detail.largestSuccessBytes).toBe(900 * MEGABYTE);
    expect(detail.suggestedBytes).toBe(512 * MEGABYTE);
    expect(suggestGpuMemoryLimit()).toBe(512 * MEGABYTE);
  });

  it('takes the lower end of the largest bucket that worked below a repeated failure', () => {
    succeed(1.2 * GIGABYTE);
    succeed(3 * GIGABYTE);
    fail(2.5 * GIGABYTE);

    const detail = fail(2.5 * GIGABYTE);

    expect(detail.failuresAtOrAboveFailed).toBe(2);
    expect(detail.oneOff).toBe(false);
    expect(detail.suggestedBytes).toBe(GIGABYTE);
  });

  it('follows a calibration after the failure, and not one that a later, smaller failure contradicts', () => {
    storeGpuMemoryCalibration({
      largestSuccessBytes: 3 * GIGABYTE,
      at: Date.now() - 1000,
    });
    succeed(900 * MEGABYTE);

    /** The failure came after the calibration, below its 3 GB. */
    expect(fail(2 * GIGABYTE).suggestedBytes).toBe(512 * MEGABYTE);

    storeGpuMemoryCalibration({
      largestSuccessBytes: 3 * GIGABYTE,
      at: Date.now() + 1000,
    });

    expect(suggestGpuMemoryLimit()).toBe(3 * GIGABYTE);
  });

  it('offers 128 MB when nothing worked, and states that no GPU size works below it', () => {
    const detail = fail(100 * MEGABYTE);

    expect(detail.suggestedBytes).toBe(128 * MEGABYTE);
    expect(detail.noGpuSizeWorks).toBe(true);
    expect(getGpuMemoryStatus()).toMatchObject({
      noGpuSizeWorks: true,
      cpuRecommended: true,
    });
  });
});

describe('OUT_OF_MEMORY from getError', () => {
  it('records the failure of the pending allocation, also behind another error', () => {
    const owner = {};
    const gl = glWithErrors([0x0502, 0x0505]);

    noteTextureAllocation({
      textureBytes: GIGABYTE,
      totalBytes: 1.5 * GIGABYTE,
      owner,
    });

    let outOfMemory;
    const [detail] = failuresDuring(() => {
      outOfMemory = checkTextureOutOfMemory(gl, owner);
    });

    expect(outOfMemory).toBe(true);
    expect(detail).toMatchObject({
      kind: 'outOfMemory',
      failedBytes: 1.5 * GIGABYTE,
      textureBytes: GIGABYTE,
      mustReload: false,
    });
    expect(
      Object.keys(window.localStorage).some((key) => key.includes('.pending.'))
    ).toBe(false);
    expect(getStoredRenderingCapabilities().history.buckets['1.5']).toEqual({
      successes: 0,
      failures: 1,
    });
  });

  it('reads no error for an allocation of another owner, or with no error', () => {
    const owner = {};

    noteTextureAllocation({
      textureBytes: GIGABYTE,
      totalBytes: GIGABYTE,
      owner,
    });

    const other = glWithErrors([0x0505]);

    expect(checkTextureOutOfMemory(other, {})).toBe(false);
    expect(other.getError).not.toHaveBeenCalled();
    expect(checkTextureOutOfMemory(glWithErrors([]), owner)).toBe(false);
  });

  it('checks an allocation with no pending record when its sizes come with it', () => {
    const gl = glWithErrors([0x0505]);

    expect(
      checkTextureOutOfMemory(
        gl,
        {},
        {
          textureBytes: 512 * MEGABYTE,
          totalBytes: GIGABYTE,
        }
      )
    ).toBe(true);
    expect(getStoredRenderingCapabilities().history.buckets[1]).toEqual({
      successes: 0,
      failures: 1,
    });

    const small = glWithErrors([0x0505]);

    expect(
      checkTextureOutOfMemory(
        small,
        {},
        {
          textureBytes: 32 * MEGABYTE,
          totalBytes: GIGABYTE,
        }
      )
    ).toBe(false);
    expect(small.getError).not.toHaveBeenCalled();
  });

  it('reads no error in Chromium, which loses the context instead', () => {
    const owner = {};
    const gl = glWithErrors([0x0505]);
    const userAgent = jest
      .spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue(
        'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'
      );

    try {
      noteTextureAllocation({
        textureBytes: GIGABYTE,
        totalBytes: GIGABYTE,
        owner,
      });

      expect(checkTextureOutOfMemory(gl, owner)).toBe(false);
      expect(gl.getError).not.toHaveBeenCalled();
    } finally {
      userAgent.mockRestore();
    }
  });
});

describe('a crash that the start of a page finds', () => {
  /** A pending record that a page of this tab or of another tab left. */
  function leavePending(tab, { page, age, renderer = RENDERER }) {
    window.localStorage.setItem(
      `${STORAGE_KEY}.pending.${tab}`,
      JSON.stringify({
        renderer,
        probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
        totalBytes: 2 * GIGABYTE,
        at: Date.now() - age,
        page,
      })
    );
  }

  /**
   * Starts a new page in the same tab: new modules, with the `sessionStorage`
   * of the tab, and the failure events listening.
   *
   * @returns the failures that the new page reported
   */
  function startNextPage() {
    const details = [];

    jest.isolateModules(() => {
      const nextEvents = require('../src/eventTarget').default;
      const nextEnums = require('../src/enums/Events').default;

      require('../src/utilities/gpuMemoryFailures');
      nextEvents.addEventListener(nextEnums.GPU_MEMORY_FAILURE, (event) =>
        details.push(event.detail)
      );
      require('../src/utilities/renderingCapabilities').getRenderingCapabilities();
      jest.runAllTimers();
    });

    return details;
  }

  it('records a young record of an earlier page of this tab at once, after the start', () => {
    jest.useFakeTimers();
    window.sessionStorage.setItem('cornerstone3D.tabId', 'this-tab');
    leavePending('this-tab', { page: 'earlier-page', age: 1000 });

    const [detail] = startNextPage();

    expect(detail).toMatchObject({
      kind: 'crash',
      failedBytes: 2 * GIGABYTE,
      mustReload: false,
    });
    expect(
      window.localStorage.getItem(`${STORAGE_KEY}.pending.this-tab`)
    ).toBeNull();
  });

  describe('with BroadcastChannel', () => {
    /** Channels of one name reach each other at once, as in one browser. */
    class FakeChannel {
      static open = new Set();

      constructor(name) {
        this.name = name;
        this.onmessage = null;
        FakeChannel.open.add(this);
      }

      postMessage(data) {
        for (const channel of FakeChannel.open) {
          if (channel !== this && channel.name === this.name) {
            channel.onmessage?.({ data });
          }
        }
      }

      close() {
        FakeChannel.open.delete(this);
      }
    }

    beforeEach(() => {
      FakeChannel.open.clear();
      global.BroadcastChannel = FakeChannel;
    });

    afterEach(() => {
      delete global.BroadcastChannel;
    });

    /**
     * Starts the next page of the tab, and lets the question time out.
     *
     * @param during - runs while the earlier page is asked
     */
    async function startNextPageAndWait(during) {
      const details = [];

      jest.isolateModules(() => {
        const nextEvents = require('../src/eventTarget').default;
        const nextEnums = require('../src/enums/Events').default;

        require('../src/utilities/gpuMemoryFailures');
        nextEvents.addEventListener(nextEnums.GPU_MEMORY_FAILURE, (event) =>
          details.push(event.detail)
        );
        require('../src/utilities/renderingCapabilities').getRenderingCapabilities();
      });
      during?.();

      for (let round = 0; round < 6; round++) {
        jest.runOnlyPendingTimers();
        await Promise.resolve();
      }

      return details;
    }

    it('records nothing when the earlier page answers, as in a duplicated tab', async () => {
      jest.useFakeTimers();
      window.sessionStorage.setItem('cornerstone3D.tabId', 'this-tab');
      leavePending('this-tab', { page: 'opener-page', age: 1000 });

      /** The first tab still runs, and answers for its page. */
      const opener = new FakeChannel('cornerstone3D.pages');

      opener.onmessage = ({ data }) => {
        if (data.type === 'alive?' && data.pageId === 'opener-page') {
          opener.postMessage({ type: 'alive', pageId: 'opener-page' });
        }
      };

      expect(await startNextPageAndWait()).toEqual([]);
      expect(
        window.localStorage.getItem(`${STORAGE_KEY}.pending.this-tab`)
      ).not.toBeNull();
    });

    it('records the crash when the earlier page does not answer', async () => {
      jest.useFakeTimers();
      window.sessionStorage.setItem('cornerstone3D.tabId', 'this-tab');
      leavePending('this-tab', { page: 'stopped-page', age: 1000 });

      const [detail] = await startNextPageAndWait();

      expect(detail).toMatchObject({
        kind: 'crash',
        failedBytes: 2 * GIGABYTE,
      });
      expect(
        window.localStorage.getItem(`${STORAGE_KEY}.pending.this-tab`)
      ).toBeNull();
    });

    it('keeps the record that this page writes under the key of the tab while it asks', async () => {
      jest.useFakeTimers();
      window.sessionStorage.setItem('cornerstone3D.tabId', 'this-tab');
      leavePending('this-tab', { page: 'stopped-page', age: 1000 });

      const [detail] = await startNextPageAndWait(() =>
        leavePending('this-tab', { page: 'this-page', age: 0 })
      );

      expect(detail).toMatchObject({ kind: 'crash' });
      expect(
        JSON.parse(
          window.localStorage.getItem(`${STORAGE_KEY}.pending.this-tab`)
        )
      ).toMatchObject({ page: 'this-page' });
    });

    it('does not count a record of an earlier page on another renderer', async () => {
      jest.useFakeTimers();
      window.sessionStorage.setItem('cornerstone3D.tabId', 'this-tab');
      leavePending('this-tab', {
        page: 'stopped-page',
        age: 1000,
        renderer: 'Another GPU',
      });

      expect(await startNextPageAndWait()).toEqual([]);
      expect(
        window.localStorage.getItem(`${STORAGE_KEY}.pending.this-tab`)
      ).not.toBeNull();
    });
  });

  it('leaves a young record of another tab, which may still be working', () => {
    jest.useFakeTimers();
    window.sessionStorage.setItem('cornerstone3D.tabId', 'this-tab');
    leavePending('other-tab', { page: 'other-page', age: 1000 });

    expect(startNextPage()).toEqual([]);
    expect(
      window.localStorage.getItem(`${STORAGE_KEY}.pending.other-tab`)
    ).not.toBeNull();
  });
});
