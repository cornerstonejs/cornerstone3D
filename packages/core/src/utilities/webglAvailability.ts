import type { WebGLBlockReason } from '../types/GpuMemory';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from './triggerEvent';
import { coreLog } from './logger';
import { getCapabilityStorage } from './capabilityStorage';
import isChromium from './isChromium';

/**
 * Whether new WebGL contexts and large GPU allocations wait, and why. Every
 * tab of the site shares the wait through the capability storage.
 *
 * - Chromium blocks WebGL for a site for about two minutes after repeated
 *   context losses. Cornerstone3D detects that block: about one second after
 *   a GPU memory failure it creates one 1 x 1 context, and a context that the
 *   browser refuses starts the wait. A refused context at any other time, for
 *   example at the start of a page during the block, starts it too.
 * - Other browsers have no such block, and a GPU can fail again at once. A
 *   second GPU memory failure within two minutes, in any tab, starts a wait
 *   of two minutes (`cooldown`).
 * - A calibration run allocates until the GPU fails, so it starts a wait
 *   before it runs (`calibration`).
 *
 * While the wait runs, no WebGL context is created (the rendering
 * capabilities come from the stored record, and a render window waits for
 * its context), and no texture of 64 MB or more is allocated. The images on
 * screen stay, and loading goes on. When the wait ends,
 * `WEBGL_AVAILABILITY_CHANGED` fires in every tab, `whenWebGLAvailable`
 * resolves, and every rendering engine renders again.
 */

const log = coreLog.getLogger('utilities', 'webglAvailability');

/**
 * The stored wait: `{ until, reason, at }`. It is outside the keys of the
 * rendering capabilities, so a reset of the capabilities leaves it.
 */
export const WEBGL_BLOCK_KEY = 'cornerstone3D.webglBlockedUntil';

/** The times of the GPU memory failures of the last two minutes, in all tabs. */
export const GPU_FAILURE_TIMES_KEY = 'cornerstone3D.gpuMemoryFailureTimes';

/** The length of a wait, and of the window of the cooldown rule. */
export const WEBGL_BLOCK_MS = 2 * 60 * 1000;

/** A stored end further away than a wait and this margin is not trusted. */
const CLOCK_SKEW_MS = 5000;

/** The time after a failure at which Chromium is checked for its block. */
const CHROME_CHECK_DELAY_MS = 1000;

/** When a check at the end of a Chromium wait finds the block, it waits this long more. */
const CHROME_RECHECK_MS = 30 * 1000;

/**
 * True to detect the block of Chromium with a test context after a failure.
 * False writes a wait of two minutes right after any failure in Chromium,
 * for a device where the test context itself extends the block.
 */
const CHECK_CHROME_BLOCK = true;

type WebGLBlock = { until: number; reason: WebGLBlockReason };

/** The wait that this tab announced, so a change of the store shows. */
let announced: WebGLBlock | undefined;
let endTimer: ReturnType<typeof setTimeout> | undefined;
let waiters: (() => void)[] = [];
let listening = false;

const REASONS: WebGLBlockReason[] = ['chrome', 'cooldown', 'calibration'];

/** The stored wait, when it is valid, not over and not too far away. */
function readStoredBlock(): WebGLBlock | undefined {
  try {
    const storage = getCapabilityStorage();
    const stored = JSON.parse(storage.getItem(WEBGL_BLOCK_KEY) ?? 'null');
    const now = Date.now();

    if (
      !Number.isFinite(stored?.until) ||
      !REASONS.includes(stored.reason) ||
      stored.until > now + WEBGL_BLOCK_MS + CLOCK_SKEW_MS
    ) {
      if (stored !== null) {
        storage.removeItem(WEBGL_BLOCK_KEY);
      }

      return undefined;
    }

    return stored.until > now
      ? { until: stored.until, reason: stored.reason }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Fires `WEBGL_AVAILABILITY_CHANGED` for the start or the end of a wait. */
function announce(block: WebGLBlock | undefined, sourceTab: 'self' | 'other') {
  announced = block;
  clearTimeout(endTimer);
  endTimer = undefined;

  if (block) {
    endTimer = setTimeout(endWait, Math.max(0, block.until - Date.now()));
    triggerEvent(eventTarget, Events.WEBGL_AVAILABILITY_CHANGED, {
      blocked: true,
      until: block.until,
      reason: block.reason,
      sourceTab,
    });

    return;
  }

  triggerEvent(eventTarget, Events.WEBGL_AVAILABILITY_CHANGED, {
    blocked: false,
    sourceTab,
  });

  const resolved = waiters;

  waiters = [];
  resolved.forEach((resolve) => resolve());
}

/**
 * Ends the wait of this tab at its end time. Another tab can have moved the
 * end, so the store decides. At the end of a wait for the block of Chromium,
 * a test context checks that the block ended.
 */
function endWait(): void {
  if (!announced) {
    return;
  }

  const stored = readStoredBlock();

  if (stored) {
    announce(stored, 'other');

    return;
  }

  if (announced?.reason === 'chrome' && isChromium() && !canCreateContext()) {
    startWebGLBlock(Date.now() + CHROME_RECHECK_MS, 'chrome');

    return;
  }

  try {
    getCapabilityStorage().removeItem(WEBGL_BLOCK_KEY);
  } catch {
    /** A store that refuses the removal ends the wait by its time anyway. */
  }

  announce(undefined, 'self');
}

/** Follows the wait that another tab of the site starts or ends. */
function onStorage(event: StorageEvent): void {
  if (event.key !== WEBGL_BLOCK_KEY && event.key !== null) {
    return;
  }

  const stored = readStoredBlock();

  if (stored && stored.until !== announced?.until) {
    announce(stored, 'other');
  } else if (!stored && announced) {
    announce(undefined, 'other');
  }
}

function listen(): void {
  if (listening || typeof window === 'undefined') {
    return;
  }

  listening = true;
  window.addEventListener('storage', onStorage);
}

/**
 * The wait now: its end and its reason, or `undefined` when none runs. It
 * reads the store, so a wait that another tab started counts at once.
 */
function getWebGLBlock(): WebGLBlock | undefined {
  listen();

  const stored = readStoredBlock();

  if (stored && stored.until !== announced?.until) {
    announce(stored, 'other');
  } else if (!stored && announced) {
    /** The timer of a hidden tab can run late. */
    setTimeout(endWait);
  }

  return stored;
}

/** True while new WebGL contexts and large GPU allocations wait. */
function isWebGLBlocked(): boolean {
  return getWebGLBlock() !== undefined;
}

/**
 * Resolves when WebGL is available: at once when no wait runs, else when the
 * wait ends. `WEBGL_AVAILABILITY_CHANGED` fires at the same time.
 */
function whenWebGLAvailable(): Promise<void> {
  if (!isWebGLBlocked()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => waiters.push(resolve));
}

/**
 * Starts a wait in every tab of the site, or moves its end later. An end
 * before the end of the running wait changes nothing.
 *
 * @param until - the end, in milliseconds since the epoch; at most two
 * minutes away
 * @param reason - why WebGL waits
 */
function startWebGLBlock(until: number, reason: WebGLBlockReason): void {
  listen();

  const end = Math.min(until, Date.now() + WEBGL_BLOCK_MS);
  const running = readStoredBlock();

  if (running && running.until >= end) {
    return;
  }

  try {
    getCapabilityStorage().setItem(
      WEBGL_BLOCK_KEY,
      JSON.stringify({ until: end, reason, at: Date.now() })
    );
  } catch (error) {
    log.warn(
      'the wait for WebGL could not be stored for the other tabs',
      error
    );
  }

  log.warn(
    `WebGL waits until ${new Date(end).toISOString()} (${reason}); no new context and no large texture until then`
  );
  announce({ until: end, reason }, 'self');
}

/**
 * Ends the wait now, in every tab, when it is a wait for this reason. A wait
 * for another reason, for example the block of Chromium, stays. A calibration
 * run that reached no failure calls this.
 */
function endWebGLBlock(reason: WebGLBlockReason): void {
  if (readStoredBlock()?.reason !== reason) {
    return;
  }

  try {
    getCapabilityStorage().removeItem(WEBGL_BLOCK_KEY);
  } catch {
    /** The wait then ends by its time. */
  }

  announce(undefined, 'self');
}

/** The failure times of the last two minutes, with this one added. */
function addFailureTime(now: number): number[] {
  const storage = getCapabilityStorage();
  let times: number[] = [];

  try {
    const stored = JSON.parse(storage.getItem(GPU_FAILURE_TIMES_KEY) ?? '[]');

    times = Array.isArray(stored) ? stored.filter(Number.isFinite) : [];
  } catch {
    times = [];
  }

  times = [...times.filter((time) => now - time < WEBGL_BLOCK_MS), now];

  try {
    storage.setItem(GPU_FAILURE_TIMES_KEY, JSON.stringify(times));
  } catch {
    /** The rule then counts the failures of this tab only. */
  }

  return times;
}

/**
 * True when a new WebGL2 context can be created now. A created context is
 * lost again at once, so the test holds no context.
 */
function canCreateContext(): boolean {
  if (typeof document === 'undefined') {
    return true;
  }

  try {
    const canvas = document.createElement('canvas');

    canvas.width = 1;
    canvas.height = 1;

    const gl = canvas.getContext('webgl2');

    gl?.getExtension('WEBGL_lose_context')?.loseContext();

    return Boolean(gl);
  } catch {
    return false;
  }
}

/**
 * Notes a GPU memory failure of this tab, while the page lives: a context
 * loss or an out of memory during a large allocation. In Chromium, a test
 * context checks for the block of the browser shortly after. In another
 * browser, the second failure within two minutes, in any tab, starts a wait.
 * The failure events call this; an application does not need to.
 */
function noteGpuMemoryFailure(): void {
  const now = Date.now();
  const times = addFailureTime(now);

  if (!isChromium()) {
    if (times.length >= 2) {
      startWebGLBlock(now + WEBGL_BLOCK_MS, 'cooldown');
    }

    return;
  }

  if (!CHECK_CHROME_BLOCK) {
    startWebGLBlock(now + WEBGL_BLOCK_MS, 'chrome');

    return;
  }

  setTimeout(() => {
    if (!isWebGLBlocked() && !canCreateContext()) {
      startWebGLBlock(now + WEBGL_BLOCK_MS, 'chrome');
    }
  }, CHROME_CHECK_DELAY_MS);
}

/**
 * Notes that the browser refused a new WebGL context of a page that had
 * WebGL, for example at the start of a page during the block of Chromium, or
 * in a render window. A wait from the last failure of the site starts, so
 * the page keeps its GPU path instead of falling back to the CPU. Outside
 * Chromium a refused context is not a block, and nothing starts.
 *
 * @param statusMessage - the message of `webglcontextcreationerror`, if any
 */
function noteContextCreationRefused(statusMessage = ''): void {
  if (!isChromium() && !/blocked/i.test(statusMessage)) {
    return;
  }

  let lastFailure = Date.now();

  try {
    const times = JSON.parse(
      getCapabilityStorage().getItem(GPU_FAILURE_TIMES_KEY) ?? '[]'
    );
    const recent = Array.isArray(times)
      ? times.filter((time) => Date.now() - time < WEBGL_BLOCK_MS)
      : [];

    lastFailure = recent.length ? Math.max(...recent) : lastFailure;
  } catch {
    /** With no stored failure, the wait starts now. */
  }

  startWebGLBlock(lastFailure + WEBGL_BLOCK_MS, 'chrome');
}

/**
 * Forgets the wait that this tab announced, and its timer, for tests. The
 * store keeps its value.
 */
function resetWebGLAvailability(): void {
  clearTimeout(endTimer);
  endTimer = undefined;
  announced = undefined;
  waiters = [];
}

export {
  getWebGLBlock,
  isWebGLBlocked,
  whenWebGLAvailable,
  startWebGLBlock,
  endWebGLBlock,
  noteGpuMemoryFailure,
  noteContextCreationRefused,
  canCreateContext,
  resetWebGLAvailability,
};
