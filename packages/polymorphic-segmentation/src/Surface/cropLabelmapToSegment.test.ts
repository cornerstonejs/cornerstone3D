import { cropLabelmapToSegment } from './cropLabelmapToSegment';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** A labelmap of the given size with `segmentIndex` at each listed voxel. */
function labelmap(dimensions, voxels, segmentIndex = 1) {
  const [width, height] = dimensions;
  const data = new Uint8Array(dimensions[0] * dimensions[1] * dimensions[2]);
  voxels.forEach(([i, j, k]) => {
    data[k * width * height + j * width + i] = segmentIndex;
  });
  return data;
}

describe('cropLabelmapToSegment', () => {
  it('returns undefined when no voxel holds the segment', () => {
    const data = labelmap([8, 8, 8], [[3, 3, 3]], 2);

    expect(
      cropLabelmapToSegment(data, [8, 8, 8], [1, 1, 1], [0, 0, 0], IDENTITY, 1)
    ).toBeUndefined();
  });

  it('keeps the segment with one voxel of margin and moves the origin to the block', () => {
    const data = labelmap(
      [10, 10, 10],
      [
        [3, 4, 5],
        [5, 4, 6],
      ]
    );

    const cropped = cropLabelmapToSegment(
      data,
      [10, 10, 10],
      [0.5, 2, 3],
      [100, 200, 300],
      IDENTITY,
      1
    );

    // i 3..5, j 4..4, k 5..6, each widened by one voxel.
    expect(cropped.dimensions).toEqual([5, 3, 4]);
    expect(cropped.origin).toEqual([100 + 2 * 0.5, 200 + 3 * 2, 300 + 4 * 3]);
    expect(cropped.scalarData).toBeInstanceOf(Uint8Array);

    const at = ([i, j, k]) => cropped.scalarData[k * 5 * 3 + j * 5 + i];
    // Source voxels [3,4,5] and [5,4,6] land at [1,1,1] and [3,1,2] in the block.
    expect(at([1, 1, 1])).toBe(1);
    expect(at([3, 1, 2])).toBe(1);
    expect(Array.from(cropped.scalarData).filter(Boolean).length).toBe(2);
  });

  it('clamps the margin to the volume', () => {
    const data = labelmap(
      [4, 4, 4],
      [
        [0, 0, 0],
        [3, 3, 3],
      ]
    );

    const cropped = cropLabelmapToSegment(
      data,
      [4, 4, 4],
      [1, 1, 1],
      [0, 0, 0],
      IDENTITY,
      1
    );

    expect(cropped.dimensions).toEqual([4, 4, 4]);
    expect(cropped.origin).toEqual([0, 0, 0]);
    expect(Array.from(cropped.scalarData)).toEqual(Array.from(data));
  });

  it('moves the origin along the direction cosines', () => {
    // Rows run along +y, columns along -x, slices along +z.
    const direction = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    const data = labelmap([10, 10, 10], [[4, 6, 2]]);

    const cropped = cropLabelmapToSegment(
      data,
      [10, 10, 10],
      [1, 2, 3],
      [10, 20, 30],
      direction,
      1
    );

    // The block starts at index [3, 5, 1].
    expect(cropped.origin).toEqual([10 - 5 * 2, 20 + 3 * 1, 30 + 1 * 3]);
  });

  it('keeps the voxel type of the labelmap', () => {
    const data = new Uint16Array(27);
    data[13] = 300;

    const cropped = cropLabelmapToSegment(
      data,
      [3, 3, 3],
      [1, 1, 1],
      [0, 0, 0],
      IDENTITY,
      300
    );

    expect(cropped.scalarData).toBeInstanceOf(Uint16Array);
    expect(cropped.dimensions).toEqual([3, 3, 3]);
  });

  it('keeps segment indices above 255 from a plain array', () => {
    const data = new Array(27).fill(0);
    data[13] = 300;

    const cropped = cropLabelmapToSegment(
      data,
      [3, 3, 3],
      [1, 1, 1],
      [0, 0, 0],
      IDENTITY,
      300
    );

    expect(cropped.scalarData[13]).toBe(300);
  });
});
