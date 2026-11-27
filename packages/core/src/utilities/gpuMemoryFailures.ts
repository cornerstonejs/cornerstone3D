import type {
  GpuMemoryFailure,
  GpuMemoryFailureEventDetail,
  GpuMemoryFailureKind,
  GpuMemoryHistory,
} from '../types/GpuMemory';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from './triggerEvent';
import { coreLog } from './logger';
import { getGpuMemoryLimit } from './gpuSettingsPresets';
import {
  GPU_MEMORY_MIN_BYTES,
  setRecoveredCrashListener,
  storeLastGpuMemoryFailure,
} from './renderingCapabilities';
import { GPU_MEMORY_BUCKETS_GB, bucketKeyOf } from './gpuMemoryBuckets';
import { getGpuMemoryHistory } from './gpuMemoryHistory';
import { canRunGpuMemoryCalibration } from './gpuMemoryCalibration';
import { getWebGLBlock, noteGpuMemoryFailure } from './webglAvailability';

const log = coreLog.getLogger('utilities', 'gpuMemoryFailures');

const GIGABYTE = 1024 ** 3;

/**
 * A size that worked at least this often before its first failure counts as
 * a one-off failure, and the suggestion keeps the limit.
 */
export const ONE_OFF_MIN_SUCCESSES = 2;

/** The last failure that the application has not acknowledged. */
let unacknowledged: GpuMemoryFailureEventDetail | undefined;

/** The size of a bucket key in GB: `Infinity` for the bucket above the last. */
function gbOfKey(key: string): number {
  return Number(key);
}

/** The largest bucket size at or below `bytes`, or `undefined` below the first. */
function bucketFloor(bytes: number): number | undefined {
  const gb = [...GPU_MEMORY_BUCKETS_GB]
    .reverse()
    .find((size) => size * GIGABYTE <= bytes);

  return gb === undefined ? undefined : gb * GIGABYTE;
}

/** The largest bucket size below `bytes`, or `undefined` below the first. */
function bucketBelow(bytes: number): number | undefined {
  const gb = [...GPU_MEMORY_BUCKETS_GB]
    .reverse()
    .find((size) => size * GIGABYTE < bytes);

  return gb === undefined ? undefined : gb * GIGABYTE;
}

/**
 * How often the page totals at or above a failed size worked and failed, by
 * bucket: the bucket of the failure and every larger one.
 */
function countsAtOrAbove(history: GpuMemoryHistory, failedBytes: number) {
  const failedGb = gbOfKey(bucketKeyOf(failedBytes));

  return history.buckets
    .filter(({ gb }) => gb >= failedGb)
    .reduce(
      (sum, { successes, failures }) => ({
        successes: sum.successes + successes,
        failures: sum.failures + failures,
      }),
      { successes: 0, failures: 0 }
    );
}

/**
 * The suggested limit after a failure, in GPU bytes of the page:
 *
 * - A one-off failure (the size worked at least `ONE_OFF_MIN_SUCCESSES` times
 *   and this is its first failure) keeps the current limit.
 * - Else, the largest page total that worked below the failed size, rounded
 *   down to a bucket size. When the largest total that worked is not below
 *   the failed size, the largest bucket with a success below the bucket of
 *   the failure gives the size, at the lower end of that bucket.
 * - With no success below the failed size, 128 MB.
 * - After a calibration, its largest success, rounded down to a bucket size,
 *   unless the failure came after the calibration at a size below that
 *   success (for example with memory held in another tab): the rules above
 *   apply then. A calibration after a failure below its success gives no more
 *   than the largest bucket below the failed size.
 *
 * The result is never below 128 MB.
 */
function suggestedLimitFor(
  failure: GpuMemoryFailure,
  history: GpuMemoryHistory
): { suggestedBytes: number; oneOff: boolean } {
  const counts = countsAtOrAbove(history, failure.failedBytes);
  const oneOff =
    counts.successes >= ONE_OFF_MIN_SUCCESSES && counts.failures === 1;

  if (oneOff) {
    return {
      suggestedBytes: Math.max(
        GPU_MEMORY_MIN_BYTES,
        getGpuMemoryLimit()?.bytes ?? failure.limitBytes
      ),
      oneOff,
    };
  }

  let worked: number | undefined;

  /**
   * A calibration after the failure is the newer measurement. A failure
   * after the calibration, at or below its largest success (for example with
   * memory held in another tab), shows that the calibration no longer holds.
   */
  const { calibration } = history;

  if (
    calibration &&
    (calibration.at >= failure.at ||
      calibration.largestSuccessBytes < failure.failedBytes)
  ) {
    worked = calibration.largestSuccessBytes;

    /**
     * A calibration measures the GPU in a context of its own, with none of
     * the memory that the viewer holds besides its textures. iOS stops a tab
     * for its whole memory, which holds the CPU copy of each volume too, so
     * on an iPad a calibration reached 2.1 GB where the viewer stopped at
     * 1.3 GB twice. The failure of the viewer is the stronger evidence.
     */
    if (worked >= failure.failedBytes) {
      worked = bucketBelow(failure.failedBytes) ?? 0;
    }
  } else if (
    history.largestLoad &&
    history.largestLoad.bytes < failure.failedBytes
  ) {
    worked = history.largestLoad.bytes;
  } else {
    const failedGb = gbOfKey(bucketKeyOf(failure.failedBytes));
    const below = history.buckets.filter(
      ({ gb, successes }) => gb < failedGb && successes > 0
    );
    const highest = below[below.length - 1];

    if (highest) {
      const index = GPU_MEMORY_BUCKETS_GB.indexOf(highest.gb);

      worked = index > 0 ? GPU_MEMORY_BUCKETS_GB[index - 1] * GIGABYTE : 0;
    }
  }

  return {
    suggestedBytes: Math.max(
      GPU_MEMORY_MIN_BYTES,
      (worked !== undefined && bucketFloor(worked)) || 0
    ),
    oneOff,
  };
}

/** The detail of `GPU_MEMORY_FAILURE` for a failure that the record holds. */
function failureDetail(
  failure: GpuMemoryFailure,
  context: { renderingEngineId?: string; contextIndex?: number } = {}
): GpuMemoryFailureEventDetail {
  const history = getGpuMemoryHistory();
  const counts = countsAtOrAbove(history, failure.failedBytes);
  const { suggestedBytes, oneOff } = suggestedLimitFor(failure, history);
  const block = getWebGLBlock();

  return {
    ...failure,
    successesAtOrAboveFailed: counts.successes,
    failuresAtOrAboveFailed: counts.failures,
    oneOff,
    ...(history.largestLoad && {
      largestSuccessBytes: history.largestLoad.bytes,
      largestSuccessCount: history.largestLoad.successes,
    }),
    suggestedBytes,
    canCalibrate: canRunGpuMemoryCalibration(),
    mustReload: failure.kind === 'contextLost',
    noGpuSizeWorks: failure.failedBytes <= GPU_MEMORY_MIN_BYTES,
    ...(block && { webglBlockedUntil: block.until }),
    ...context,
    history,
  };
}

/**
 * Reports a GPU memory failure: stores it as the last failure of the record,
 * keeps it for `getLastGpuMemoryFailure`, and fires `GPU_MEMORY_FAILURE`. The
 * record already counts the failure in its bucket. The allocation tracker and
 * the start of a page call this; an application does not need to.
 *
 * @param report.kind - how the failure showed
 * @param report.failedBytes - the GPU bytes of the page at the failure
 * @param report.textureBytes - the allocation that failed, when known
 */
export function reportGpuMemoryFailure({
  kind,
  failedBytes,
  textureBytes,
  renderingEngineId,
  contextIndex,
}: {
  kind: GpuMemoryFailureKind;
  failedBytes: number;
  textureBytes?: number;
  renderingEngineId?: string;
  contextIndex?: number;
}): void {
  const limit = getGpuMemoryLimit();
  const failure: GpuMemoryFailure = {
    kind,
    at: Date.now(),
    failedBytes,
    ...(textureBytes > 0 && { textureBytes }),
    limitBytes: limit?.bytes ?? 0,
    limitSource: limit?.source ?? 'start',
  };

  storeLastGpuMemoryFailure(failure);

  /**
   * A failure of this page can start a wait for WebGL. A crash happened in an
   * earlier page, so its time is not now.
   */
  if (kind !== 'crash') {
    noteGpuMemoryFailure();
  }

  unacknowledged = failureDetail(failure, {
    ...(renderingEngineId !== undefined && { renderingEngineId }),
    ...(contextIndex !== undefined && { contextIndex }),
  });
  log.warn(
    `a GPU memory failure (${kind}) at ${failedBytes} bytes of the page; the suggested limit is ${unacknowledged.suggestedBytes} bytes`
  );
  triggerEvent(eventTarget, Events.GPU_MEMORY_FAILURE, unacknowledged);
}

/**
 * The memory limit to offer the user, in GPU bytes of the page. Cornerstone3D
 * never applies it; the application offers it and the user picks. It follows
 * the last failure of the record (see `GpuMemoryFailureEventDetail`), and
 * with no failure recorded it is the current limit, or 128 MB when no limit
 * applies.
 */
export function suggestGpuMemoryLimit(): number {
  const history = getGpuMemoryHistory();

  return history.lastFailure
    ? suggestedLimitFor(history.lastFailure, history).suggestedBytes
    : (getGpuMemoryLimit()?.bytes ?? GPU_MEMORY_MIN_BYTES);
}

/**
 * The last GPU memory failure of this page that the application has not
 * acknowledged, for a listener that subscribes after the event fired. A crash
 * that the start of the page found counts, so an application can show it
 * once it is ready. `undefined` when there is none.
 */
export function getLastGpuMemoryFailure():
  | GpuMemoryFailureEventDetail
  | undefined {
  return unacknowledged;
}

/**
 * Marks the last failure as handled, so `getLastGpuMemoryFailure` returns
 * `undefined` until the next failure. The record keeps the failure.
 */
export function acknowledgeGpuMemoryFailure(): void {
  unacknowledged = undefined;
}

/** A crash that the start of the page found is a failure of that page. */
setRecoveredCrashListener((totalBytes) =>
  reportGpuMemoryFailure({ kind: 'crash', failedBytes: totalBytes })
);
