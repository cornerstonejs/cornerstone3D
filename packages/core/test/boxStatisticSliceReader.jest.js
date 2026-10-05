import { describe, it, expect, jest } from '@jest/globals';
import { reduceByBoxStatistic } from '../src/utilities/voxelGrid';
import VoxelStatistics from '../src/enums/VoxelStatistics';

// The slice fast paths of the box reduction read a slice of the cached image
// in place through `_getSliceView`, and copy through `_getSliceData` only for
// an image that needs scaling. A source of several components, and a factor of
// 1 on the k axis, take the generic path.

function collectingTarget() {
  const written = new Map();

  return {
    written,
    setAtIJK: (i, j, k, value) => written.set(`${i},${j},${k}`, value),
  };
}

describe('the slice fast paths of the box reduction', () => {
  it('read a slice in place for the average, and copy none', () => {
    const getSliceView = jest.fn((k) => new Float32Array(4).fill(k));
    const getSliceData = jest.fn();
    const source = {
      dimensions: [2, 2, 4],
      numberOfComponents: 1,
      getAtIJK: (_i, _j, k) => k,
      _getSliceView: getSliceView,
      _getSliceData: getSliceData,
    };
    const target = collectingTarget();

    const written = reduceByBoxStatistic(
      source,
      { factors: [1, 1, 2] },
      target,
      { round: false }
    );

    expect(written).toBe(2 * 2 * 2);
    expect(target.written.get('0,0,0')).toBe(0.5);
    expect(target.written.get('1,1,1')).toBe(2.5);
    expect(getSliceView).toHaveBeenCalledTimes(4);
    expect(getSliceData).not.toHaveBeenCalled();
  });

  it('read a slice in place for the foreground majority, and copy none', () => {
    const getSliceView = jest.fn(() => new Uint8Array(4).fill(3));
    const getSliceData = jest.fn();
    const source = {
      dimensions: [2, 2, 4],
      numberOfComponents: 1,
      getAtIJK: () => 3,
      _getSliceView: getSliceView,
      _getSliceData: getSliceData,
    };
    const target = collectingTarget();

    reduceByBoxStatistic(source, { factors: [2, 2, 2] }, target, {
      statistic: VoxelStatistics.ForegroundMajority,
    });

    expect(target.written.get('0,0,0')).toBe(3);
    expect(getSliceView).toHaveBeenCalled();
    expect(getSliceData).not.toHaveBeenCalled();
  });

  it('copy through _getSliceData when the view gives nothing', () => {
    const getSliceView = jest.fn(() => undefined);
    const getSliceData = jest.fn(({ sliceIndex }) =>
      new Float32Array(4).fill(sliceIndex)
    );
    const source = {
      dimensions: [2, 2, 2],
      numberOfComponents: 1,
      getAtIJK: (_i, _j, k) => k,
      _getSliceView: getSliceView,
      _getSliceData: getSliceData,
    };
    const target = collectingTarget();

    reduceByBoxStatistic(source, { factors: [1, 1, 2] }, target, {
      round: false,
    });

    expect(target.written.get('0,0,0')).toBe(0.5);
    expect(getSliceData).toHaveBeenCalledTimes(2);
  });

  it('leave a voxel of three components to the generic path', () => {
    const source = {
      dimensions: [2, 2, 4],
      numberOfComponents: 3,
      getAtIJK: (_i, _j, k) => [k, k, k],
      _getSliceData: () => undefined,
    };
    const target = collectingTarget();

    const written = reduceByBoxStatistic(
      source,
      { factors: [1, 1, 2] },
      target,
      { round: false }
    );

    expect(written).toBe(2 * 2 * 2);
    expect(target.written.get('0,0,0')).toEqual([0.5, 0.5, 0.5]);
  });

  it('leave a factor of 1 on every axis to the generic path', () => {
    const getSliceView = jest.fn();
    const getSliceData = jest.fn(() => new Float32Array(4));
    const source = {
      dimensions: [2, 2, 2],
      numberOfComponents: 1,
      getAtIJK: (_i, _j, k) => k,
      _getSliceView: getSliceView,
      _getSliceData: getSliceData,
    };
    const target = collectingTarget();

    reduceByBoxStatistic(source, { factors: [1, 1, 1] }, target);

    expect(getSliceView).not.toHaveBeenCalled();
    expect(getSliceData).not.toHaveBeenCalled();
    expect(target.written.get('0,0,1')).toBe(1);
  });
});
