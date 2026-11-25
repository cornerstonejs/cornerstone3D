import type {
  GpuMemoryCalibration,
  RunGpuMemoryCalibrationOptions,
} from '../types/GpuMemory';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from './triggerEvent';
import { coreLog } from './logger';
import { getCapabilityStorage } from './capabilityStorage';
import {
  getPageIdentity,
  getRenderingCapabilities,
  setDetectionListener,
  storeGpuMemoryCalibration,
} from './renderingCapabilities';
import { getGpuMemoryHistory } from './gpuMemoryHistory';
import {
  WEBGL_BLOCK_MS,
  endWebGLBlock,
  isWebGLBlocked,
  startWebGLBlock,
} from './webglAvailability';
import { createGpuMemoryStress } from './gpuMemoryStress';

/**
 * The calibration run: one test, which the user starts on purpose after a GPU
 * memory failure, that allocates GPU memory in growing steps until the GPU
 * fails, and records the largest size that worked. The application warns the
 * user first, because the failure at the end makes the browser block WebGL
 * for this site for about two minutes, in every tab. The result is offered
 * to the user as a limit; the run changes no limit.
 */

const log = coreLog.getLogger('utilities', 'gpuMemoryCalibration');

/**
 * The record of a run that is under way, so the next page of the tab records
 * the result when the run stopped the tab. Outside the keys of the rendering
 * capabilities, so a reset of them leaves it.
 */
export const CALIBRATION_PENDING_KEY = 'cornerstone3D.gpuMemoryCalibration';

/** A run stops here when nothing failed. */
const CALIBRATION_MAX_BYTES = 32 * 1024 ** 3;

/** The first step is this share of the failed size. */
const START_SHARE = 0.9;

/** Each step adds this share of the first step. */
const STEP_SHARE = 0.1;

/** A record of another tab this old belongs to a run that stopped. */
const STALE_MS = 60 * 1000;

/**
 * Context losses this soon after a run come from the run (Chromium loses the
 * contexts of the viewports with the context of the run).
 */
const AFTER_RUN_MS = 5000;

type PendingCalibration = {
  tabId: string;
  pageId: string;
  renderer: string;
  step: number;
  targetBytes: number;
  lastOkBytes: number;
  at: number;
};

let running = false;
let endedAt = Number.NEGATIVE_INFINITY;

/**
 * True while a calibration run allocates, and shortly after it. A context
 * loss then comes from the run, so the allocation tracker records no failure
 * of the viewer for it.
 */
function isGpuMemoryCalibrationActive(): boolean {
  return running || Date.now() - endedAt < AFTER_RUN_MS;
}

/**
 * True when a calibration run may start: the record holds a GPU memory
 * failure that happened during an allocation, WebGL is available, and no run
 * is under way.
 *
 * A calibration run allocates until the GPU fails, so the browser blocks
 * WebGL for about two minutes afterwards. The application warns the user of
 * that before it starts a run.
 */
function canRunGpuMemoryCalibration(): boolean {
  return (
    !running &&
    Boolean(getGpuMemoryHistory().lastFailure) &&
    getRenderingCapabilities().webgl &&
    !isWebGLBlocked()
  );
}

/** Stores the record of the step that is about to run. */
function writePending(pending: PendingCalibration): void {
  try {
    getCapabilityStorage().setItem(
      CALIBRATION_PENDING_KEY,
      JSON.stringify(pending)
    );
  } catch (error) {
    log.warn('the record of the calibration step was not stored', error);
  }
}

function removePending(): void {
  try {
    getCapabilityStorage().removeItem(CALIBRATION_PENDING_KEY);
  } catch {
    /** The next start then records the run that ended. */
  }
}

/** Stores a result and fires `GPU_MEMORY_CALIBRATED`. */
function finish(result: GpuMemoryCalibration): GpuMemoryCalibration {
  storeGpuMemoryCalibration(result);
  log.info(
    `the calibration found ${result.largestSuccessBytes} bytes that worked${result.failedBytes ? `, and a failure at ${result.failedBytes} bytes` : ''}`
  );
  triggerEvent(eventTarget, Events.GPU_MEMORY_CALIBRATED, result);

  return result;
}

/**
 * Allocates GPU memory in growing steps until the GPU fails, and records the
 * largest size that worked. It runs in a WebGL context of its own, outside
 * the viewports, so the result is the texture memory with the viewer open.
 *
 * - The first step is 90 % of the failed size of the last failure, and each
 *   step adds 10 % of the first step, up to 32 GB.
 * - Before each step, a record of the step is stored, so a run that stops the
 *   tab is recorded by the next page of the tab, and a wait for WebGL starts
 *   in every tab, so the other tabs upload no large texture meanwhile.
 * - The run ends at a lost context or `OUT_OF_MEMORY`. Its result goes in
 *   the history of the record (see `getGpuMemoryHistory`), and
 *   `GPU_MEMORY_CALIBRATED` fires. The suggested limit then follows it.
 * - In Chromium the viewports lose their contexts with the context of the
 *   run, so the application reloads the page when the wait ends, as after any
 *   failure.
 *
 * It runs only when the application calls it, never at the start of a page.
 * It rejects when `canRunGpuMemoryCalibration()` is false.
 *
 * @param options.startBytes - the size of the first step
 * @param options.stepBytes - the growth of each step
 * @returns the result, when the page survives the run
 */
async function runGpuMemoryCalibration(
  options: RunGpuMemoryCalibrationOptions = {}
): Promise<GpuMemoryCalibration> {
  if (!canRunGpuMemoryCalibration()) {
    throw new Error(
      'runGpuMemoryCalibration: a calibration runs only after a GPU memory failure, while WebGL is available and no other run is under way'
    );
  }

  const failedBytes = getGpuMemoryHistory().lastFailure.failedBytes;
  const startBytes =
    options.startBytes > 0
      ? options.startBytes
      : Math.round(failedBytes * START_SHARE);
  const stepBytes =
    options.stepBytes > 0
      ? options.stepBytes
      : Math.max(1024 * 1024, Math.round(startBytes * STEP_SHARE));
  const stress = createGpuMemoryStress();

  if (!stress) {
    throw new Error('runGpuMemoryCalibration: no WebGL2 context for the run');
  }

  const { tabId, pageId } = getPageIdentity();
  const renderer = getRenderingCapabilities().renderer;
  let lastOkBytes = 0;
  let failedAt: number | undefined;

  running = true;

  try {
    for (
      let step = 0, targetBytes = startBytes;
      targetBytes <= CALIBRATION_MAX_BYTES;
      step++, targetBytes += stepBytes
    ) {
      writePending({
        tabId,
        pageId,
        renderer,
        step,
        targetBytes,
        lastOkBytes,
        at: Date.now(),
      });
      startWebGLBlock(Date.now() + WEBGL_BLOCK_MS, 'calibration');

      if (!(await stress.growTo(targetBytes))) {
        failedAt = targetBytes;
        break;
      }

      lastOkBytes = targetBytes;
    }
  } finally {
    stress.release();
    removePending();
    running = false;
    endedAt = Date.now();
  }

  /** With no failure, nothing stops the other tabs any longer. */
  if (failedAt === undefined) {
    endWebGLBlock('calibration');
  }

  return finish({
    largestSuccessBytes: lastOkBytes,
    ...(failedAt !== undefined && { failedBytes: failedAt }),
    at: Date.now(),
  });
}

/**
 * Records the result of a run that stopped its tab, at the start of a page:
 * the last step that worked, and the step that ran as the failure. A record
 * of this page is a live run. A young record of another tab can be a live
 * run there, so it stays until it is old.
 */
function recoverStoppedCalibration(): void {
  let pending: PendingCalibration | undefined;

  try {
    pending = JSON.parse(
      getCapabilityStorage().getItem(CALIBRATION_PENDING_KEY) ?? 'null'
    );
  } catch {
    pending = undefined;
  }

  if (!pending || !Number.isFinite(pending.targetBytes)) {
    return;
  }

  const { tabId, pageId } = getPageIdentity();
  const live =
    pending.pageId === pageId ||
    (pending.tabId !== tabId && Date.now() - pending.at < STALE_MS);

  if (live || pending.renderer !== getRenderingCapabilities().renderer) {
    return;
  }

  removePending();
  finish({
    largestSuccessBytes: Math.max(0, pending.lastOkBytes || 0),
    failedBytes: pending.targetBytes,
    at: pending.at,
  });
}

setDetectionListener(recoverStoppedCalibration);

export {
  canRunGpuMemoryCalibration,
  runGpuMemoryCalibration,
  isGpuMemoryCalibrationActive,
};
