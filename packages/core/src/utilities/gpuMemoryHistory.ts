import type {
  GpuMemoryBucket,
  GpuMemoryFailureEventDetail,
  GpuMemoryHistory,
} from '../types/GpuMemory';
import { getGpuMemoryLimit } from './gpuSettingsPresets';
import {
  GPU_MEMORY_MIN_BYTES,
  peekStoredRenderingCapabilities,
} from './renderingCapabilities';

/**
 * The size ranges of the record, in GB of the page, which are also the sizes
 * that a memory dialog offers. A load goes in the smallest bucket that holds
 * it, or in the last bucket above 32 GB.
 */
const GPU_MEMORY_BUCKETS_GB: readonly number[] = Object.freeze([
  0.125, 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32,
]);

/** One empty bucket for each size, and the last one above 32 GB. */
function emptyBuckets(): GpuMemoryBucket[] {
  return [...GPU_MEMORY_BUCKETS_GB, Number.POSITIVE_INFINITY].map((gb) => ({
    gb,
    successes: 0,
    failures: 0,
  }));
}

/**
 * What the record of this device holds about its GPU memory, for a memory
 * dialog: the successes and failures of each size, the largest page total and
 * texture that worked, the last failure and the last calibration. It is a
 * copy, so a change to it changes nothing.
 *
 * The record keeps no counts by size yet, so each bucket is empty. The largest
 * page total that worked comes from the stored record of the device.
 */
function getGpuMemoryHistory(): GpuMemoryHistory {
  const largest = peekStoredRenderingCapabilities()?.textureBytes.largest;

  return {
    buckets: emptyBuckets(),
    ...(largest && {
      largestLoad: { bytes: largest.value, successes: largest.successes },
    }),
  };
}

/**
 * The memory limit to offer the user after a failure, in GPU bytes of the
 * page. Cornerstone3D never applies it; the application offers it and the
 * user picks.
 *
 * With no failure recorded, the suggestion is the current limit, or 128 MB
 * when no limit applies.
 */
function suggestGpuMemoryLimit(): number {
  return getGpuMemoryLimit()?.bytes ?? GPU_MEMORY_MIN_BYTES;
}

/**
 * The last GPU memory failure that the application has not acknowledged, for
 * a listener that subscribes after the event fired, for example a crash that
 * the start of the page found. `undefined` when there is none.
 */
function getLastGpuMemoryFailure(): GpuMemoryFailureEventDetail | undefined {
  return undefined;
}

/**
 * Marks the last failure as handled, so `getLastGpuMemoryFailure` returns
 * `undefined` until the next failure.
 */
function acknowledgeGpuMemoryFailure(): void {
  /** No failure is kept yet, so there is nothing to clear. */
}

export {
  GPU_MEMORY_BUCKETS_GB,
  getGpuMemoryHistory,
  suggestGpuMemoryLimit,
  getLastGpuMemoryFailure,
  acknowledgeGpuMemoryFailure,
};
