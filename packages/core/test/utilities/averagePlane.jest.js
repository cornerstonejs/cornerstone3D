import { describe, it, expect } from '@jest/globals';
import fillPlaneByAverage from '../../src/utilities/voxelGrid/averagePlane';
import { reduceByBoxStatistic } from '../../src/utilities/voxelGrid/boxStatistic';
import { VoxelStatistics } from '../../src/enums';

function fill(frames, sourceSize, targetSize, factors, Type = Int16Array) {
  const values = new Type(targetSize[0] * targetSize[1]).fill(-1);

  fillPlaneByAverage(frames, sourceSize, targetSize, factors, values);

  return Array.from(values);
}

describe('the box average of a reduced plane', () => {
  it('rounds the average into an integer plane, and keeps it in a float plane', () => {
    const frames = [Int16Array.of(10, 11), Int16Array.of(10, 10)];

    expect(fill(frames, [2, 1], [1, 1], [2, 1])).toEqual([10]);
    expect(fill(frames, [2, 1], [1, 1], [2, 1], Float32Array)).toEqual([10.25]);
  });

  it('gives the voxels beyond the last whole box to the last cell', () => {
    // Width 5 by a factor 2 into 2 cells: the last cell holds columns 2 to 4.
    const frame = Int16Array.of(10, 20, 30, 60, 90);

    expect(fill([frame], [5, 1], [2, 1], [2, 1])).toEqual([15, 60]);
  });

  it('writes 0 when no frame of the box has arrived', () => {
    expect(fill([], [2, 2], [1, 1], [2, 2])).toEqual([0]);
  });

  it('agrees with the average accumulator, partial boxes included', () => {
    const [width, height, depth] = [7, 5, 3];
    const factors = [2, 3, depth];
    const frames = Array.from({ length: depth }, (_, k) =>
      Int16Array.from(
        { length: width * height },
        (_, index) => ((index * 37 + k * 101) % 400) - 200
      )
    );
    const targetSize = [Math.ceil(width / 2), Math.ceil(height / 3)];
    const expected = new Array(targetSize[0] * targetSize[1]).fill(0);

    reduceByBoxStatistic(
      {
        dimensions: [width, height, depth],
        getAtIJK: (i, j, k) => frames[k][j * width + i],
      },
      { factors },
      {
        setAtIJK: (i, j, _k, value) => {
          expected[j * targetSize[0] + i] = value;
        },
      },
      { statistic: VoxelStatistics.Average, round: true }
    );

    expect(fill(frames, [width, height], targetSize, factors)).toEqual(
      expected
    );
  });
});
