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
import { GPU_MEMORY_BUCKETS_GB } from './gpuMemoryBuckets';
import type { GpuMemorySizeCount } from './gpuMemoryBuckets';

/** A stored size count as the history states it, or `undefined`. */
function sizeOf(entry: GpuMemorySizeCount | undefined) {
  return entry && { bytes: entry.value, successes: entry.successes };
}

/**
 * What the record of this device holds about its GPU memory, for a memory
 * dialog: the successes and failures of each size, the largest page total and
 * texture that worked, the last failure and the last calibration. It is a
 * copy, so a change to it changes nothing.
 *
 * `buckets` holds every size of `GPU_MEMORY_BUCKETS_GB`, in order, and the
 * bucket above the last size, with zero counts where nothing is recorded. A
 * record from before the history existed states its largest page total from
 * the memory record of the device.
 */
function getGpuMemoryHistory(): GpuMemoryHistory {
  const record = peekStoredRenderingCapabilities();
  const stored = record?.history;
  const buckets: GpuMemoryBucket[] = [
    ...GPU_MEMORY_BUCKETS_GB,
    Number.POSITIVE_INFINITY,
  ].map((gb) => ({
    gb,
    successes: stored?.buckets[String(gb)]?.successes ?? 0,
    failures: stored?.buckets[String(gb)]?.failures ?? 0,
  }));
  const largestLoad = sizeOf(
    stored?.largestLoad ?? record?.textureBytes.largest
  );
  const largestTexture = sizeOf(stored?.largestTexture);

  return {
    buckets,
    ...(largestLoad && { largestLoad }),
    ...(largestTexture && { largestTexture }),
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
