import type { GpuMemoryBucket, GpuMemoryHistory } from '../types/GpuMemory';
import { peekStoredRenderingCapabilities } from './renderingCapabilities';
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
    ...(stored?.lastFailure && { lastFailure: { ...stored.lastFailure } }),
    ...(stored?.calibration && { calibration: { ...stored.calibration } }),
  };
}

export { GPU_MEMORY_BUCKETS_GB, getGpuMemoryHistory };
