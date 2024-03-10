import { getRuntimeId, isEqual, planar, isOpposite } from '../../src/utilities';
import { describe, it, expect } from '@jest/globals';

describe('Cornerstone-render Utilities:', function () {
  it('Should correctly get runtimeIds', () => {
    expect(getRuntimeId()).toBe('1');
    expect(getRuntimeId()).toBe('2');
  });

  it('Should successfully use isEqual', () => {
    expect(isEqual([0, 0, 0], [1, 1, 1])).toBe(false);
    expect(isEqual([0, 0, 0], [0, 0, 0])).toBe(true);
    expect(isEqual([0, 0, 0], [0.0000000001, 0, 0])).toBe(true);
    expect(isEqual(1, 1)).toBe(true);
    expect(isEqual(0.1, 0.1)).toBe(true);
    expect(isEqual(0.1, [0.1])).toBe(false);
    expect(isEqual([1], 1)).toBe(false);
    expect(isEqual(0.00001, 0.00002, 0.00001)).toBe(true);
    expect(isEqual(0.2 + 0.1, 0.3, 0.01)).toBe(true);
    expect(isEqual(Infinity, Infinity, 0.0001)).toBe(false);
    expect(isEqual(NaN, NaN, 0.0001)).toBe(false);

    const typedArray0 = new Float32Array([1.0, 2.1]);
    const typedArray1 = new Float32Array([1.0, 1.2]);
    const typedArray2 = new Float32Array([1.0, 1.2]);
    const typedArray3 = new Float64Array([1.0, 1.2]);
    const typedArray4 = new Float64Array([1.01, 1.202]);
    const typedArray5 = new Int16Array([1, 2]);
    const typedArray6 = new Int16Array([1, 2]);
    const typedArray7 = new Int16Array([1, 3]);

    expect(isEqual(typedArray1, typedArray2, 0.0001)).toBe(true);
    expect(isEqual(typedArray3, typedArray4, 0.1)).toBe(true);
    expect(isEqual(typedArray3, typedArray4, 0.0001)).toBe(false);
    expect(isEqual(typedArray3, typedArray4, 0.0001)).toEqual(
      isEqual(typedArray4, typedArray3, 0.0001)
    );
    expect(isEqual(typedArray5, typedArray6, 0.1)).toBe(true);
    expect(isEqual(typedArray5, typedArray6, 0.001)).toBe(true);
    expect(isEqual(typedArray5, typedArray7, 0.1)).toBe(false);
    expect(isEqual(typedArray1, typedArray3, 0.1)).toBe(true);
    expect(isEqual(typedArray1, typedArray3, 0.0001)).toBe(true);
    expect(isEqual(typedArray1, typedArray5, 0.0001)).toBe(false);
    expect(isEqual(typedArray1, typedArray5, 0.01)).toBe(false);
    expect(isEqual(typedArray0, typedArray5, 0.01)).toBe(false);
    expect(isEqual(typedArray0, typedArray5, 0.1)).toBe(true);
    expect(isEqual(typedArray0, typedArray5, 0.1)).toEqual(
      isEqual(typedArray5, typedArray0, 0.1)
    );
    expect(isEqual(typedArray0, typedArray5, 0.1)).toEqual(
      isEqual(typedArray5, typedArray5, 0.1)
    );
  });

  it('Should correctly calculate line and plane intersection', () => {
    const plane = [2, -3, 1, 3];
    const p0 = [-1, 4, 1];
    const p1 = [1, -1, 2];

    const point = planar.linePlaneIntersection(p0, p1, plane);
    expect(point[0]).toBeCloseTo(3 / 5);
    expect(point[1]).toBe(0);
    expect(point[2]).toBeCloseTo(9 / 5);
  });

  it('Should correctly determines equality between values of two arrays', () => {
    expect(isOpposite([0, 0, 0], [0, 0, 0])).toBe(true);
    expect(isOpposite([-1, -1, -1], [1, 1, 1])).toBe(true);
    expect(isOpposite([-0.0000000001, 0, 0], [0.0000000001, 0, 0])).toBe(true);
  });
});
