/**
 * The history of the GPU memory of one device: how often each size of the
 * page worked and failed, and the largest page total and single texture that
 * worked. The record of the device stores it (see `renderingCapabilities`).
 * It only records; nothing changes the memory limit from it.
 *
 * This module holds no state and imports no module, so the record and the
 * readers of the history can both use it.
 */
import type { GpuMemoryFailure } from '../types/GpuMemory';

const GIGABYTE = 1024 ** 3;

/**
 * The size ranges of the history, in GB of the page, which are also the sizes
 * that a memory dialog offers. A load goes in the smallest bucket that holds
 * it, or in the bucket above the last size.
 */
export const GPU_MEMORY_BUCKETS_GB: readonly number[] = Object.freeze([
  0.125, 0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32,
]);

/**
 * Two sizes within this share of the largest one count as the same size, so
 * a load that varies a little adds to the count of the largest size.
 */
export const SAME_SIZE_TOLERANCE = 0.05;

/** The successes and the failures of one bucket. */
export type GpuMemoryBucketCounts = { successes: number; failures: number };

/** A size that worked, and how often it worked. */
export type GpuMemorySizeCount = { value: number; successes: number };

/**
 * The stored history. `buckets` is keyed by the size of the bucket in GB, as
 * text, with `Infinity` for the bucket above the last size. A bucket with no
 * count has no key.
 */
export type GpuMemoryHistoryRecord = {
  buckets: Record<string, GpuMemoryBucketCounts>;
  largestLoad?: GpuMemorySizeCount;
  largestTexture?: GpuMemorySizeCount;
  /** The last failure, for a memory dialog and the suggestion. */
  lastFailure?: GpuMemoryFailure;
};

/** The ways a GPU memory failure shows. */
const FAILURE_KINDS = ['contextLost', 'crash', 'outOfMemory'];

/** The sources of a memory limit. */
const LIMIT_SOURCES = ['hardConfig', 'hardUser', 'user', 'config', 'start'];

/** An empty history. */
export function emptyGpuMemoryHistory(): GpuMemoryHistoryRecord {
  return { buckets: {} };
}

/**
 * The key of the bucket of a load: the smallest size at or above the load, or
 * `Infinity` above the last size.
 */
export function bucketKeyOf(bytes: number): string {
  const gb = GPU_MEMORY_BUCKETS_GB.find((size) => bytes <= size * GIGABYTE);

  return String(gb ?? Number.POSITIVE_INFINITY);
}

/** Adds one count to the bucket of a load. */
function countInBucket(
  history: GpuMemoryHistoryRecord,
  bytes: number,
  field: keyof GpuMemoryBucketCounts
): void {
  const key = bucketKeyOf(bytes);
  const counts = history.buckets[key] ?? { successes: 0, failures: 0 };

  counts[field]++;
  history.buckets[key] = counts;
}

/**
 * The largest size after a success of `bytes`. A size above the largest one
 * by more than `SAME_SIZE_TOLERANCE` replaces it, with one success. A size
 * within the tolerance of it adds one success and keeps the larger value. A
 * smaller size leaves it as it is.
 */
function largestAfter(
  largest: GpuMemorySizeCount | undefined,
  bytes: number
): GpuMemorySizeCount {
  if (!largest || bytes > largest.value * (1 + SAME_SIZE_TOLERANCE)) {
    return { value: bytes, successes: 1 };
  }

  if (bytes >= largest.value * (1 - SAME_SIZE_TOLERANCE)) {
    return {
      value: Math.max(largest.value, bytes),
      successes: largest.successes + 1,
    };
  }

  return largest;
}

/**
 * Records a large allocation that worked.
 *
 * @param totalBytes - the GPU bytes of the page with the allocation
 * @param textureBytes - the bytes of the texture that was allocated, when known
 */
export function addGpuMemorySuccess(
  history: GpuMemoryHistoryRecord,
  totalBytes: number,
  textureBytes?: number
): void {
  countInBucket(history, totalBytes, 'successes');
  history.largestLoad = largestAfter(history.largestLoad, totalBytes);

  if (textureBytes > 0) {
    history.largestTexture = largestAfter(history.largestTexture, textureBytes);
  }
}

/**
 * Records a large allocation that failed: a context loss, or a tab that
 * stopped.
 *
 * @param totalBytes - the GPU bytes of the page at the failure
 */
export function addGpuMemoryFailure(
  history: GpuMemoryHistoryRecord,
  totalBytes: number
): void {
  countInBucket(history, totalBytes, 'failures');
}

/** A whole number of at least 0, or `undefined` when the value is not one. */
function count(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

/** A size count with a positive size, or `undefined` when it is not valid. */
function validSizeCount(value: unknown): GpuMemorySizeCount | undefined {
  const entry = value as GpuMemorySizeCount;
  const successes = count(entry?.successes);

  return Number.isFinite(entry?.value) && entry.value > 0 && successes
    ? { value: entry.value, successes }
    : undefined;
}

/** A stored failure, or `undefined` when it is not valid. */
function validFailure(value: unknown): GpuMemoryFailure | undefined {
  const entry = value as GpuMemoryFailure;

  if (
    !FAILURE_KINDS.includes(entry?.kind) ||
    !LIMIT_SOURCES.includes(entry.limitSource) ||
    !Number.isFinite(entry.at) ||
    !(entry.failedBytes > 0) ||
    !(entry.limitBytes >= 0)
  ) {
    return undefined;
  }

  return {
    kind: entry.kind,
    at: entry.at,
    failedBytes: entry.failedBytes,
    ...(entry.textureBytes > 0 && { textureBytes: entry.textureBytes }),
    limitBytes: entry.limitBytes,
    limitSource: entry.limitSource,
  };
}

/**
 * A stored history with every invalid part removed, or `undefined` when none
 * of it is valid.
 */
export function validGpuMemoryHistory(
  value: unknown
): GpuMemoryHistoryRecord | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const stored = value as GpuMemoryHistoryRecord;
  const keys = new Set(
    [...GPU_MEMORY_BUCKETS_GB, Number.POSITIVE_INFINITY].map(String)
  );
  const history = emptyGpuMemoryHistory();

  if (typeof stored.buckets === 'object' && stored.buckets !== null) {
    for (const [key, counts] of Object.entries(stored.buckets)) {
      const successes = count(counts?.successes);
      const failures = count(counts?.failures);

      if (
        keys.has(key) &&
        successes !== undefined &&
        failures !== undefined &&
        successes + failures > 0
      ) {
        history.buckets[key] = { successes, failures };
      }
    }
  }

  const largestLoad = validSizeCount(stored.largestLoad);
  const largestTexture = validSizeCount(stored.largestTexture);
  const lastFailure = validFailure(stored.lastFailure);

  if (largestLoad) {
    history.largestLoad = largestLoad;
  }

  if (largestTexture) {
    history.largestTexture = largestTexture;
  }

  if (lastFailure) {
    history.lastFailure = lastFailure;
  }

  return Object.keys(history.buckets).length ||
    largestLoad ||
    largestTexture ||
    lastFailure
    ? history
    : undefined;
}
