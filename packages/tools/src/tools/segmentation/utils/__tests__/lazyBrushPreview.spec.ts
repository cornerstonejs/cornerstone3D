import type { Types } from '@cornerstonejs/core';

import {
  appendLazyBrushPreviewCircle,
  appendLazyBrushStrokePoint,
} from '../lazyBrushPreview';

describe('lazyBrushPreview', () => {
  it('deduplicates consecutive stroke points', () => {
    const start = [1, 2, 3] as Types.Point3;
    const points = appendLazyBrushStrokePoint([], start);
    const deduped = appendLazyBrushStrokePoint(points, [
      1, 2, 3,
    ] as Types.Point3);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toEqual(start);
    expect(deduped[0]).not.toBe(start);
  });

  it('appends each preview circle once', () => {
    const firstCircle = [
      [0, -1, 0],
      [0, 1, 0],
      [-1, 0, 0],
      [1, 0, 0],
    ] as Types.Point3[];
    const secondCircle = [
      [1, -1, 0],
      [1, 1, 0],
      [0, 0, 0],
      [2, 0, 0],
    ] as Types.Point3[];

    const preview = appendLazyBrushPreviewCircle([], firstCircle);
    const duplicate = appendLazyBrushPreviewCircle(preview, firstCircle);
    const extended = appendLazyBrushPreviewCircle(preview, secondCircle);

    expect(duplicate).toHaveLength(4);
    expect(extended).toHaveLength(8);
    expect(extended.slice(0, 4)).toEqual(firstCircle);
    expect(extended.slice(4)).toEqual(secondCircle);
  });
});
