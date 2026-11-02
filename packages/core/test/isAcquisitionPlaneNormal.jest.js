import isAcquisitionPlaneNormal from '../src/RenderingEngine/helpers/isAcquisitionPlaneNormal';

describe('isAcquisitionPlaneNormal', () => {
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  it('accepts a normal parallel or anti-parallel to the scan axis, and refuses 45 degrees', () => {
    expect(isAcquisitionPlaneNormal([0, 0, 1], direction)).toBe(true);
    expect(isAcquisitionPlaneNormal([0, 0, -1], direction)).toBe(true);
    expect(
      isAcquisitionPlaneNormal([0, Math.SQRT1_2, Math.SQRT1_2], direction)
    ).toBe(false);
  });
});
