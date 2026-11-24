import { describe, it, expect } from '@jest/globals';
import { reduceByBoxStatistic } from '../../src/utilities/voxelGrid/boxStatistic';
import { VoxelStatistics } from '../../src/enums';

const [width, height, depth] = [11, 7, 9];

function makeFrames(seed = 3) {
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  return Array.from({ length: depth }, () =>
    Uint8Array.from({ length: width * height }, () =>
      random() < 0.5 ? 0 : 1 + Math.floor(random() * 4)
    )
  );
}

/** A source that only reads voxel by voxel, which forces the slow path. */
function voxelSource(frames) {
  return {
    dimensions: [width, height, depth],
    getAtIJK: (i, j, k) => frames[k]?.[j * width + i],
  };
}

/** The same data, with the slice reader that enables the fast path. */
function sliceSource(frames) {
  return {
    ...voxelSource(frames),
    _getSliceData: ({ sliceIndex }) => frames[sliceIndex],
  };
}

function reduce(
  source,
  reduction,
  statistic = VoxelStatistics.ForegroundMajority
) {
  const written = new Map();

  reduceByBoxStatistic(
    source,
    reduction,
    {
      setAtIJK: (i, j, k, value) => written.set(`${i},${j},${k}`, value),
    },
    { statistic }
  );

  return written;
}

describe('the slice fast path of the average', () => {
  const average = VoxelStatistics.Average;

  it.each([
    ['two frames per box', { factors: [1, 1, 2] }],
    ['four frames per box, with a remainder', { factors: [1, 1, 4] }],
    [
      'a region with a target offset',
      {
        factors: [1, 1, 3],
        sourceOffset: [2, 1, 1],
        sourceDimensions: [6, 5, 7],
        targetOffset: [2, 1, 0],
      },
    ],
  ])('agrees with the voxel path: %s', (_name, reduction) => {
    const frames = makeFrames(11).map((frame) =>
      Uint16Array.from(frame, (value) => value * 397)
    );
    const fast = sliceSource(frames);

    fast.getAtIJK = () => {
      throw new Error('the fast path read voxel by voxel');
    };

    expect(reduce(fast, reduction, average)).toEqual(
      reduce(voxelSource(frames), reduction, average)
    );
  });

  it('skips a value that is not a number, as the voxel path does', () => {
    const frames = makeFrames(5).map((frame) => Float32Array.from(frame));

    frames[2][4] = NaN;
    frames[3][4] = NaN;

    expect(
      reduce(sliceSource(frames), { factors: [1, 1, 2] }, average)
    ).toEqual(reduce(voxelSource(frames), { factors: [1, 1, 2] }, average));
  });

  it('writes the array of a target that holds one', () => {
    const frames = makeFrames(7);
    const dimensions = [width, height, Math.ceil(depth / 2)];
    const scalars = new Float32Array(
      dimensions[0] * dimensions[1] * dimensions[2]
    );

    reduceByBoxStatistic(
      sliceSource(frames),
      { factors: [1, 1, 2] },
      {
        dimensions,
        getWritableScalarData: () => scalars,
        setAtIJK: () => {
          throw new Error('wrote voxel by voxel');
        },
      },
      { statistic: average }
    );

    const expected = new Float32Array(scalars.length);

    for (const [key, value] of reduce(
      voxelSource(frames),
      { factors: [1, 1, 2] },
      average
    )) {
      const [i, j, k] = key.split(',').map(Number);
      expected[(k * dimensions[1] + j) * dimensions[0] + i] = value;
    }

    expect(Array.from(scalars)).toEqual(Array.from(expected));
  });
});

describe('the slice fast paths and a voxel of several components', () => {
  it('leave the voxel to the generic path', () => {
    const source = {
      dimensions: [2, 2, 4],
      numberOfComponents: 3,
      getAtIJK: (_i, _j, k) => [k, k, k],
      _getSliceData: () => undefined,
    };
    const written = new Map();

    reduceByBoxStatistic(
      source,
      { factors: [1, 1, 2] },
      { setAtIJK: (i, j, k, value) => written.set(`${i},${j},${k}`, value) },
      { round: false }
    );

    expect(written.size).toBe(2 * 2 * 2);
    expect(written.get('0,0,0')).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('the slice fast path of the foreground majority', () => {
  const cases = [
    ['slice axis only, two frames per box', { factors: [1, 1, 2] }],
    ['slice axis only, three frames per box', { factors: [1, 1, 3] }],
    ['slice axis only, five frames per box', { factors: [1, 1, 5] }],
    [
      'slice axis only, a region with a target offset',
      {
        factors: [1, 1, 2],
        sourceOffset: [2, 1, 3],
        sourceDimensions: [5, 4, 6],
        targetOffset: [2, 1, 1],
      },
    ],
    ['every axis, with remainders', { factors: [2, 3, 4] }],
    [
      'a region with a target offset',
      {
        factors: [2, 2, 2],
        sourceOffset: [3, 1, 2],
        sourceDimensions: [6, 5, 5],
        targetOffset: [1, 0, 3],
      },
    ],
  ];

  it.each(cases)('agrees with the voxel path: %s', (_name, reduction) => {
    const frames = makeFrames();
    const fast = sliceSource(frames);

    fast.getAtIJK = () => {
      throw new Error('the fast path read voxel by voxel');
    };

    expect(reduce(fast, reduction)).toEqual(
      reduce(voxelSource(frames), reduction)
    );
  });

  it.each([[[1, 1, 3]], [[2, 3, 2]]])(
    'writes the array of a target that holds one: %j',
    (factors) => {
      const frames = makeFrames();
      const dimensions = [
        Math.ceil(width / factors[0]),
        Math.ceil(height / factors[1]),
        Math.ceil(depth / factors[2]),
      ];
      const scalars = new Uint8Array(
        dimensions[0] * dimensions[1] * dimensions[2]
      );

      reduceByBoxStatistic(
        sliceSource(frames),
        { factors },
        {
          dimensions,
          getWritableScalarData: () => scalars,
          setAtIJK: () => {
            throw new Error('wrote voxel by voxel');
          },
        },
        { statistic: VoxelStatistics.ForegroundMajority }
      );

      const expected = new Uint8Array(scalars.length);

      for (const [key, value] of reduce(voxelSource(frames), { factors })) {
        const [i, j, k] = key.split(',').map(Number);
        expected[(k * dimensions[1] + j) * dimensions[0] + i] = value;
      }

      expect(Array.from(scalars)).toEqual(Array.from(expected));
    }
  );

  it('leaves a float slice to the voxel path', () => {
    const frames = makeFrames().map((frame) => Float32Array.from(frame));
    const source = sliceSource(frames);
    let voxelReads = 0;
    const read = source.getAtIJK;

    source.getAtIJK = (...ijk) => {
      voxelReads++;
      return read(...ijk);
    };

    reduce(source, { factors: [1, 1, 2] });

    expect(voxelReads).toBeGreaterThan(0);
  });

  it('skips a slice that has not arrived, as the voxel path does', () => {
    const frames = makeFrames();

    frames[3] = undefined;

    expect(reduce(sliceSource(frames), { factors: [2, 2, 2] })).toEqual(
      reduce(voxelSource(frames), { factors: [2, 2, 2] })
    );
  });

  it('leaves a slice smaller than the volume to the voxel path', () => {
    const frames = makeFrames();
    const source = sliceSource(frames);
    let voxelReads = 0;

    source._getSliceData = ({ sliceIndex }) =>
      sliceIndex === 0 ? new Uint8Array(4) : frames[sliceIndex];
    source.getAtIJK = (i, j, k) => {
      voxelReads++;
      return frames[k][j * width + i];
    };

    reduce(source, { factors: [1, 1, 2] });

    expect(voxelReads).toBeGreaterThan(0);
  });
});
