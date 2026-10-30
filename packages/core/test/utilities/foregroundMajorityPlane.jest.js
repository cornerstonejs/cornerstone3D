import { describe, it, expect } from '@jest/globals';
import fillPlaneByForegroundMajority from '../../src/utilities/voxelGrid/foregroundMajorityPlane';
import { reduceByBoxStatistic } from '../../src/utilities/voxelGrid/boxStatistic';
import { VoxelStatistics } from '../../src/enums';

function fill(frames, sourceSize, targetSize, factors) {
  const values = new Uint8Array(targetSize[0] * targetSize[1]).fill(255);

  fillPlaneByForegroundMajority(
    frames,
    sourceSize,
    targetSize,
    factors,
    values
  );

  return Array.from(values);
}

describe('the foreground majority of a reduced plane', () => {
  it('keeps the majority label and ignores background', () => {
    // One 2 x 2 box over two frames: label 4 three times, label 9 once.
    const frames = [Uint8Array.of(0, 4, 0, 4), Uint8Array.of(9, 4, 0, 0)];

    expect(fill(frames, [2, 2], [1, 1], [2, 2])).toEqual([4]);
  });

  it('writes 0 for a box that holds background only', () => {
    expect(fill([new Uint8Array(4)], [2, 2], [1, 1], [2, 2])).toEqual([0]);
  });

  it('breaks a tie like the accumulator: the first label to reach the count', () => {
    // 7 leads at one, 3 reaches two first, 7 then only ties at two.
    const frames = [Uint8Array.of(7, 3, 3, 7)];

    expect(fill(frames, [4, 1], [1, 1], [4, 1])).toEqual([3]);
  });

  it('gives the voxels beyond the last whole box to the last cell', () => {
    // Width 5 by a factor 2: the last cell holds columns 2 to 4.
    const frames = [Uint8Array.of(1, 1, 0, 0, 6)];

    expect(fill(frames, [5, 1], [2, 1], [2, 1])).toEqual([1, 6]);
  });

  it('agrees with the foreground majority accumulator on whole boxes', () => {
    const [width, height, depth] = [8, 6, 3];
    const factors = [2, 3, depth];
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const frames = Array.from({ length: depth }, () =>
      Uint8Array.from({ length: width * height }, () =>
        random() < 0.4 ? 0 : 1 + Math.floor(random() * 3)
      )
    );
    const targetSize = [width / factors[0], height / factors[1]];
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
      { statistic: VoxelStatistics.ForegroundMajority, round: false }
    );

    expect(fill(frames, [width, height], targetSize, factors)).toEqual(
      expected
    );
  });
});
