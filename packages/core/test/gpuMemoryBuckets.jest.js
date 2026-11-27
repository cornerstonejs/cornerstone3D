import { describe, it, expect } from '@jest/globals';
import {
  GPU_MEMORY_BUCKETS_GB,
  addGpuMemoryFailure,
  addGpuMemorySuccess,
  bucketKeyOf,
  emptyGpuMemoryHistory,
  validGpuMemoryHistory,
} from '../src/utilities/gpuMemoryBuckets';

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;

describe('the buckets of the GPU memory history', () => {
  it('puts a load in the smallest bucket that holds it, and above 32 GB in the last', () => {
    expect(bucketKeyOf(1)).toBe('0.125');
    expect(bucketKeyOf(128 * MEGABYTE)).toBe('0.125');
    expect(bucketKeyOf(128 * MEGABYTE + 1)).toBe('0.25');
    expect(bucketKeyOf(GIGABYTE)).toBe('1');
    expect(bucketKeyOf(1.2 * GIGABYTE)).toBe('1.5');
    expect(bucketKeyOf(32 * GIGABYTE)).toBe('32');
    expect(bucketKeyOf(32 * GIGABYTE + 1)).toBe('Infinity');
    expect(GPU_MEMORY_BUCKETS_GB).toHaveLength(14);
  });

  it('counts the successes and the failures of each bucket', () => {
    const history = emptyGpuMemoryHistory();

    addGpuMemorySuccess(history, 900 * MEGABYTE);
    addGpuMemorySuccess(history, GIGABYTE);
    addGpuMemoryFailure(history, GIGABYTE);
    addGpuMemoryFailure(history, 40 * GIGABYTE);

    expect(history.buckets).toEqual({
      1: { successes: 2, failures: 1 },
      Infinity: { successes: 0, failures: 1 },
    });
  });
});

describe('the largest sizes that worked', () => {
  it('replaces the largest load with a count of 1 when a load is larger by more than 5 %', () => {
    const history = emptyGpuMemoryHistory();

    addGpuMemorySuccess(history, GIGABYTE);
    addGpuMemorySuccess(history, 1.06 * GIGABYTE);

    expect(history.largestLoad).toEqual({
      value: 1.06 * GIGABYTE,
      successes: 1,
    });
  });

  it('adds to the count within 5 % and keeps the larger value', () => {
    const history = emptyGpuMemoryHistory();

    addGpuMemorySuccess(history, GIGABYTE);
    addGpuMemorySuccess(history, 1.04 * GIGABYTE);
    /** Within 5 % of the largest value, which is now 1.04 GB. */
    addGpuMemorySuccess(history, 0.99 * GIGABYTE);

    expect(history.largestLoad).toEqual({
      value: 1.04 * GIGABYTE,
      successes: 3,
    });
  });

  it('leaves the largest load as it is after a smaller load', () => {
    const history = emptyGpuMemoryHistory();

    addGpuMemorySuccess(history, 2 * GIGABYTE);
    addGpuMemorySuccess(history, GIGABYTE);

    expect(history.largestLoad).toEqual({ value: 2 * GIGABYTE, successes: 1 });
  });

  it('keeps the largest texture by the same rule, and only when its size is known', () => {
    const history = emptyGpuMemoryHistory();

    addGpuMemorySuccess(history, 2 * GIGABYTE);
    expect(history.largestTexture).toBeUndefined();

    addGpuMemorySuccess(history, 2 * GIGABYTE, 512 * MEGABYTE);
    addGpuMemorySuccess(history, 2 * GIGABYTE, 500 * MEGABYTE);

    expect(history.largestTexture).toEqual({
      value: 512 * MEGABYTE,
      successes: 2,
    });
  });

  it('records no largest size from a failure', () => {
    const history = emptyGpuMemoryHistory();

    addGpuMemoryFailure(history, GIGABYTE);

    expect(history.largestLoad).toBeUndefined();
  });
});

describe('a stored history', () => {
  it('reads nothing from a value that is not a history', () => {
    expect(validGpuMemoryHistory(undefined)).toBeUndefined();
    expect(validGpuMemoryHistory('history')).toBeUndefined();
    expect(validGpuMemoryHistory({ buckets: {} })).toBeUndefined();
  });

  it('keeps whole counts of known buckets and positive sizes', () => {
    expect(
      validGpuMemoryHistory({
        buckets: {
          0.5: { successes: 2, failures: 0 },
          Infinity: { successes: 0, failures: 1 },
          0.7: { successes: 1, failures: 0 },
          1: { successes: 1.5, failures: 0 },
        },
        largestLoad: { value: GIGABYTE, successes: 0 },
        largestTexture: { value: -1, successes: 1 },
      })
    ).toEqual({
      buckets: {
        0.5: { successes: 2, failures: 0 },
        Infinity: { successes: 0, failures: 1 },
      },
    });
  });
});
