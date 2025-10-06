import type { Types } from '@cornerstonejs/core';

import { createPointInEllipse } from '../fillCircle';

describe('createPointInEllipse', () => {
  const corners: Types.Point3[] = [
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 1, 0],
  ];

  it('detects points inside the base circle', () => {
    const predicate = createPointInEllipse(corners);

    expect(predicate([0, 0, 0] as Types.Point3)).toBe(true);
    expect(predicate([0.5, 0.5, 0] as Types.Point3)).toBe(true);
    expect(predicate([1.2, 0, 0] as Types.Point3)).toBe(false);
  });

  it('covers interpolated stroke segments', () => {
    const predicate = createPointInEllipse(corners, {
      strokePointsWorld: [
        [-2, 0, 0] as Types.Point3,
        [2, 0, 0] as Types.Point3,
      ],
      radius: 1,
    });

    expect(predicate([0, 0, 0] as Types.Point3)).toBe(true);
    expect(predicate([1.5, 0, 0] as Types.Point3)).toBe(true);
    expect(predicate([3.2, 0, 0] as Types.Point3)).toBe(false);
  });
});
