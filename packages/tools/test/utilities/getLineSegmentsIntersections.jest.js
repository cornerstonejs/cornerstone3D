import getLineSegmentsIntersections from '../../src/utilities/math/polyline/getLineSegmentsIntersection';
import { describe, it, expect } from '@jest/globals';

const p11 = [1, 1];
const p10 = [1, 0];
const p01 = [0, 1];
const p00 = [0, 0];
const p22 = [2, 2];

describe('getLineSegmentsIntersections', function () {
  it('Should find overlapping intersection', () => {
    const pTest = getLineSegmentsIntersections(p00, p11, p10, p01);
    expect(pTest[0]).toBeCloseTo(0.5);
    expect(pTest[1]).toBeCloseTo(0.5);
  });
  it('Should find co-incident overlapping intersections', () => {
    const pTest = getLineSegmentsIntersections(p00, p11, p11, p22);
    expect(pTest[0]).toBeCloseTo(1);
    expect(pTest[1]).toBeCloseTo(1);
  });

  it('TODO Should find midpoint of parallel points', () => {
    const pTest = getLineSegmentsIntersections(p00, p11, [0, -1], p10);
    expect(pTest[0]).toBeCloseTo(0.5);
    expect(pTest[1]).toBeCloseTo(0);
  });

  it('TODO Should find projected intersection of extended points', () => {
    const pTest = getLineSegmentsIntersections(p00, p11, [2, 0], [3, -1]);
    expect(pTest[0]).toBeCloseTo(1);
    expect(pTest[1]).toBeCloseTo(1);
  });

  it('TODO Should find projected intersection of extended points', () => {
    const pTest = getLineSegmentsIntersections(
      p00,
      p11,
      [0, -1],
      [1, 0.000000001]
    );
    expect(pTest[0]).toBeCloseTo(999999917.2596358);
    expect(pTest[1]).toBeCloseTo(999999917.2596358);
  });
});
