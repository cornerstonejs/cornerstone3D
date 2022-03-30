import { getRuntimeId, isEqual, planar, isOpposite } from '../src/utilities';

describe('Cornerstone-render Utilities:', function () {
  it('Should correctly get runtimeIds', () => {
    expect(getRuntimeId()).toBe('1');
    expect(getRuntimeId()).toBe('2');
  });

  it('Should successfully use isEqual', () => {
    expect(isEqual([0, 0, 0], [1, 1, 1])).toBe(false);
    expect(isEqual([0, 0, 0], [0, 0, 0])).toBe(true);
    expect(isEqual([0, 0, 0], [0.0000000001, 0, 0])).toBe(true);
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
