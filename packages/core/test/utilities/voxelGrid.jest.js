import { describe, it, expect, afterAll, beforeAll } from '@jest/globals';
import { VoxelManager, voxelGrid } from '../../src/utilities';
import { VoxelStatistics } from '../../src/enums';
import { __resetVoxelStatisticRegistry } from '../../src/utilities/voxelGrid/voxelStatistics';

const {
  boxAverageAtIJK,
  boxAverageReductionFactors,
  deriveBoxAverageGrid,
  getVoxelStatistic,
  getVoxelStatistics,
  isDefaultSelectionStatistic,
  maxEdgeOfGrid,
  reduceByBoxAverage,
  reduceByBoxStatistic,
  reducedDimensions,
  registerVoxelStatistic,
  voxelCountOfGrid,
  voxelGridKey,
  voxelGridWithinLimits,
  voxelGridsEqual,
} = voxelGrid;

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Builds an axis aligned grid, with one millimetre voxels unless stated. */
function makeGrid({
  dimensions,
  spacing = [1, 1, 1],
  origin = [0, 0, 0],
  direction = identityDirection,
}) {
  return { dimensions, spacing, origin, direction };
}

/** Builds a source that reads a dense array, in i, then j, then k order. */
function makeSource(dimensions, values) {
  const [width, height] = dimensions;

  return {
    dimensions,
    getAtIJK: (i, j, k) => values[i + j * width + k * width * height],
  };
}

/** Builds a target that collects every write. */
function makeTarget() {
  const written = new Map();

  return {
    written,
    setAtIJK: (i, j, k, value) => written.set(`${i},${j},${k}`, value),
  };
}

describe('voxelGrid.boxAverageReductionFactors', () => {
  it('reduces exactly one axis for an edge of 2049 against a limit of 2048', () => {
    // Acceptance criterion 4 of issue #2921. A uniform reduction by 2 on three
    // axes takes 8 times fewer voxels for an excess of one voxel.
    const factors = boxAverageReductionFactors([2049, 512, 512], {
      maxEdge: 2048,
    });

    expect(factors).toEqual([2, 1, 1]);
    expect(reducedDimensions([2049, 512, 512], factors)).toEqual([
      1025, 512, 512,
    ]);
  });

  it('reduces no axis when every edge is inside the limit', () => {
    expect(
      boxAverageReductionFactors([512, 512, 300], { maxEdge: 2048 })
    ).toEqual([1, 1, 1]);
  });

  it('reduces each axis by its own factor', () => {
    // MR-CODE-3: a device whose maximum edge is 256 takes the 512 x 1024 x 25
    // slab down to 256 x 256 x 25.
    const dimensions = [512, 1024, 25];
    const factors = boxAverageReductionFactors(dimensions, { maxEdge: 256 });

    expect(factors).toEqual([2, 4, 1]);
    expect(reducedDimensions(dimensions, factors)).toEqual([256, 256, 25]);
  });

  it('reduces the largest axis first for a limit on the number of voxels', () => {
    const dimensions = [512, 256, 64];
    const factors = boxAverageReductionFactors(dimensions, {
      maxVoxelCount: (512 * 256 * 64) / 8,
    });
    const reduced = reducedDimensions(dimensions, factors);

    expect(reduced[0] * reduced[1] * reduced[2]).toBeLessThanOrEqual(
      (512 * 256 * 64) / 8
    );
    expect(factors[0]).toBeGreaterThan(1);
  });

  it('applies the two limits together', () => {
    const dimensions = [2049, 1024, 1024];
    const factors = boxAverageReductionFactors(dimensions, {
      maxEdge: 2048,
      maxVoxelCount: 256 * 256 * 256,
    });
    const reduced = reducedDimensions(dimensions, factors);

    expect(Math.max(...reduced)).toBeLessThanOrEqual(2048);
    expect(reduced[0] * reduced[1] * reduced[2]).toBeLessThanOrEqual(
      256 * 256 * 256
    );
  });

  it('rounds the number of reduced voxels up, so the grid covers the region', () => {
    expect(reducedDimensions([2049, 3, 1], [2, 2, 2])).toEqual([1025, 2, 1]);
  });
});

describe('voxelGrid.deriveBoxAverageGrid', () => {
  it('changes nothing when every factor is 1', () => {
    const source = makeGrid({ dimensions: [8, 8, 4], origin: [5, 6, 7] });
    const derived = deriveBoxAverageGrid(source, { factors: [1, 1, 1] });

    expect(voxelGridsEqual(source, derived)).toBe(true);
  });

  it('puts the sample offset of the box average in the origin', () => {
    // A decimation reports the corner voxel of the box, and a box average
    // reports the centre. The two lie apart by (factor - 1) / 2 source voxels.
    const source = makeGrid({ dimensions: [8, 8, 4], spacing: [0.5, 0.5, 2] });
    const derived = deriveBoxAverageGrid(source, { factors: [2, 4, 1] });

    expect(derived.dimensions).toEqual([4, 2, 4]);
    expect(derived.spacing).toEqual([1, 2, 2]);
    expect(derived.origin[0]).toBeCloseTo(0.25, 10);
    expect(derived.origin[1]).toBeCloseTo(0.75, 10);
    expect(derived.origin[2]).toBeCloseTo(0, 10);
    expect(Array.from(derived.direction)).toEqual(identityDirection);
  });

  it('moves the origin along the axes of an oblique grid', () => {
    const direction = [0, 1, 0, 0, 0, 1, 1, 0, 0];
    const source = makeGrid({
      dimensions: [4, 4, 4],
      spacing: [1, 1, 1],
      origin: [10, 20, 30],
      direction,
    });
    const derived = deriveBoxAverageGrid(source, { factors: [3, 1, 1] });

    // The i axis points along y, so only y moves, and it moves by
    // (3 - 1) / 2 = 1 source voxel.
    expect(derived.origin[0]).toBeCloseTo(10, 10);
    expect(derived.origin[1]).toBeCloseTo(21, 10);
    expect(derived.origin[2]).toBeCloseTo(30, 10);
    expect(derived.dimensions).toEqual([2, 4, 4]);
  });

  it('describes a region of the source, which is one brick', () => {
    const source = makeGrid({ dimensions: [64, 64, 64], spacing: [1, 1, 1] });
    const derived = deriveBoxAverageGrid(source, {
      factors: [2, 2, 2],
      sourceOffset: [16, 0, 0],
      sourceDimensions: [32, 64, 64],
    });

    expect(derived.dimensions).toEqual([16, 32, 32]);
    expect(derived.origin[0]).toBeCloseTo(16.5, 10);
    expect(derived.origin[1]).toBeCloseTo(0.5, 10);
  });

  it('refuses a region that leaves the source grid', () => {
    const source = makeGrid({ dimensions: [8, 8, 8] });

    expect(() =>
      deriveBoxAverageGrid(source, {
        factors: [1, 1, 1],
        sourceOffset: [4, 0, 0],
        sourceDimensions: [8, 8, 8],
      })
    ).toThrow();
  });

  it('gives two distinct grids for the odd slices and for the even slices', () => {
    // The two grids share a spacing and they differ in origin. Nothing may
    // assume one grid for each spacing.
    const source = makeGrid({ dimensions: [8, 8, 8], spacing: [1, 1, 1] });
    const even = deriveBoxAverageGrid(source, {
      factors: [1, 1, 2],
      sourceDimensions: [8, 8, 8],
    });
    const odd = deriveBoxAverageGrid(source, {
      factors: [1, 1, 2],
      sourceOffset: [0, 0, 1],
      sourceDimensions: [8, 8, 7],
    });

    expect(even.spacing).toEqual(odd.spacing);
    expect(voxelGridsEqual(even, odd)).toBe(false);
    expect(voxelGridKey(even, VoxelStatistics.Average)).not.toBe(
      voxelGridKey(odd, VoxelStatistics.Average)
    );
  });
});

describe('voxelGrid.reduceByBoxAverage', () => {
  it('gives the mean of each box, and not the corner voxel of each box', () => {
    // A decimation of this plane gives 0, 2, 8, 10. A box average gives the
    // mean of each 2 x 2 box.
    const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const source = makeSource([4, 4, 1], values);
    const target = makeTarget();

    const written = reduceByBoxAverage(source, { factors: [2, 2, 1] }, target, {
      round: false,
    });

    expect(written).toBe(4);
    expect(target.written.get('0,0,0')).toBeCloseTo(2.5, 10);
    expect(target.written.get('1,0,0')).toBeCloseTo(4.5, 10);
    expect(target.written.get('0,1,0')).toBeCloseTo(10.5, 10);
    expect(target.written.get('1,1,0')).toBeCloseTo(12.5, 10);
  });

  it('averages only the source voxels that a partial box holds', () => {
    const source = makeSource([3, 1, 1], [10, 20, 30]);
    const target = makeTarget();

    reduceByBoxAverage(source, { factors: [2, 1, 1] }, target, {
      round: false,
    });

    expect(target.written.get('0,0,0')).toBeCloseTo(15, 10);
    // The last box holds one source voxel, and not two.
    expect(target.written.get('1,0,0')).toBeCloseTo(30, 10);
  });

  it('rounds each average by default, so a store of whole numbers keeps the level', () => {
    const source = makeSource([2, 1, 1], [10, 11]);
    const target = makeTarget();

    reduceByBoxAverage(source, { factors: [2, 1, 1] }, target);

    expect(target.written.get('0,0,0')).toBe(11);
  });

  it('skips a source voxel that has not arrived, and writes nothing for an empty box', () => {
    const source = makeSource([4, 1, 1], [10, undefined, undefined, undefined]);
    const target = makeTarget();

    const written = reduceByBoxAverage(source, { factors: [2, 1, 1] }, target, {
      round: false,
    });

    expect(written).toBe(1);
    expect(target.written.get('0,0,0')).toBeCloseTo(10, 10);
    expect(target.written.has('1,0,0')).toBe(false);
  });

  it('reduces a region of the source only', () => {
    const values = [0, 1, 2, 3, 4, 5, 6, 7];
    const source = makeSource([8, 1, 1], values);

    expect(
      boxAverageAtIJK(
        source,
        {
          factors: [2, 1, 1],
          sourceOffset: [4, 0, 0],
          sourceDimensions: [4, 1, 1],
        },
        0,
        0,
        0
      )
    ).toBeCloseTo(4.5, 10);
  });
});

describe('voxelGrid.reduceByBoxAverage over more than one component', () => {
  it('averages each component of an RGB value on its own', () => {
    const source = {
      dimensions: [4, 1, 1],
      getAtIJK: (i) =>
        [
          [10, 20, 30],
          [20, 40, 60],
          [0, 0, 0],
          [100, 100, 100],
        ][i],
    };
    const target = makeTarget();

    const written = reduceByBoxAverage(source, { factors: [2, 1, 1] }, target, {
      round: false,
    });

    expect(written).toBe(2);
    expect(target.written.get('0,0,0')).toEqual([15, 30, 45]);
    expect(target.written.get('1,0,0')).toEqual([50, 50, 50]);
  });

  it('rounds each component of an RGB value', () => {
    const source = {
      dimensions: [2, 1, 1],
      getAtIJK: (i) =>
        [
          [10, 11, 12],
          [11, 12, 13],
        ][i],
    };
    const target = makeTarget();

    reduceByBoxAverage(source, { factors: [2, 1, 1] }, target);

    expect(target.written.get('0,0,0')).toEqual([11, 12, 13]);
  });

  it('writes nothing for a box whose RGB values have not arrived', () => {
    const source = {
      dimensions: [4, 1, 1],
      getAtIJK: (i) => [[10, 20, 30], [20, 40, 60], undefined, undefined][i],
    };
    const target = makeTarget();

    const written = reduceByBoxAverage(source, { factors: [2, 1, 1] }, target);

    expect(written).toBe(1);
    expect(target.written.get('0,0,0')).toEqual([15, 30, 45]);
    expect(target.written.has('1,0,0')).toBe(false);
  });

  it('reduces one RGB voxel manager into another', () => {
    // The source and the target are the real voxel managers of an RGB volume,
    // and they read and write an array of three numbers for each voxel.
    const sourceData = new Uint8Array([
      10, 20, 30, 20, 40, 60, 0, 0, 0, 100, 100, 100,
    ]);
    const targetData = new Uint8Array(6);
    const source = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [4, 1, 1],
      scalarData: sourceData,
      numberOfComponents: 3,
    });
    const target = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [2, 1, 1],
      scalarData: targetData,
      numberOfComponents: 3,
    });

    const written = reduceByBoxAverage(source, { factors: [2, 1, 1] }, target);

    expect(written).toBe(2);
    expect(Array.from(targetData)).toEqual([15, 30, 45, 50, 50, 50]);
  });

  it('reduces one voxel manager of one component into another', () => {
    const sourceData = new Uint8Array([10, 20, 30, 41]);
    const targetData = new Uint8Array(2);
    const source = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [4, 1, 1],
      scalarData: sourceData,
      numberOfComponents: 1,
    });
    const target = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [2, 1, 1],
      scalarData: targetData,
      numberOfComponents: 1,
    });

    reduceByBoxAverage(source, { factors: [2, 1, 1] }, target);

    expect(Array.from(targetData)).toEqual([15, 36]);
  });
});

describe('voxelGrid statistics registry', () => {
  // The statistic of a maximum is an example of what an extension adds. No file
  // of the core package changes, and the core package registers no such
  // statistic. An extension of TypeScript also augments the interfaces
  // VoxelStatisticRegistry and VoxelStatisticConstants, and the constant is
  // then Enums.VoxelStatistics.MAXIMUM.
  const MAXIMUM = 'myOrg:maximum';

  beforeAll(() => {
    registerVoxelStatistic({
      name: 'MAXIMUM',
      statistic: MAXIMUM,
      description: 'The largest of the source voxels of one box.',
      createAccumulator: () => {
        let maximum;

        return {
          reset: () => {
            maximum = undefined;
          },
          add: (value) => {
            maximum = maximum === undefined ? value : Math.max(maximum, value);
          },
          getValue: () => maximum,
        };
      },
    });
  });

  afterAll(() => {
    __resetVoxelStatisticRegistry();
  });

  it('adds a constant on Enums.VoxelStatistics', () => {
    expect(VoxelStatistics.MAXIMUM).toBe(MAXIMUM);
    expect(VoxelStatistics.Average).toBe('average');
  });

  it('refuses a statistic that the registry already holds', () => {
    expect(() =>
      registerVoxelStatistic({
        statistic: MAXIMUM,
        createAccumulator: () => null,
      })
    ).toThrow(/already registered/);
  });

  it('reduces with a statistic that an extension registered', () => {
    const source = makeSource([4, 1, 1], [1, 9, 3, 4]);
    const target = makeTarget();

    reduceByBoxStatistic(source, { factors: [2, 1, 1] }, target, {
      statistic: MAXIMUM,
    });

    expect(target.written.get('0,0,0')).toBe(9);
    expect(target.written.get('1,0,0')).toBe(4);
  });

  it('keeps the average as the statistic of a default selection', () => {
    expect(isDefaultSelectionStatistic(VoxelStatistics.Average)).toBe(true);
    expect(isDefaultSelectionStatistic(MAXIMUM)).toBe(false);
    expect(isDefaultSelectionStatistic('nothing registered this')).toBe(false);
  });

  it('holds the definition of each registered statistic', () => {
    expect(getVoxelStatistic(VoxelStatistics.Average).statistic).toBe(
      'average'
    );
    expect(
      getVoxelStatistics().map((definition) => definition.statistic)
    ).toEqual(expect.arrayContaining([VoxelStatistics.Average, MAXIMUM]));
  });

  it('refuses a reduction with a statistic that nothing registered', () => {
    const source = makeSource([2, 1, 1], [1, 2]);

    expect(() =>
      reduceByBoxStatistic(source, { factors: [2, 1, 1] }, makeTarget(), {
        statistic: 'nothing registered this',
      })
    ).toThrow(/is not registered/);
  });

  it('refuses a definition that carries no arithmetic', () => {
    expect(() =>
      registerVoxelStatistic({ statistic: 'myOrg:no arithmetic' })
    ).toThrow(/createAccumulator/);
  });

  it('gives two keys to two statistics of one grid', () => {
    const grid = makeGrid({ dimensions: [4, 4, 4] });

    expect(voxelGridKey(grid, VoxelStatistics.Average)).not.toBe(
      voxelGridKey(grid, MAXIMUM)
    );
  });
});

describe('voxelGrid.voxelGridKey', () => {
  it('gives one key to one representation, and it holds the statistic', () => {
    const grid = makeGrid({ dimensions: [4, 4, 4] });
    const same = makeGrid({ dimensions: [4, 4, 4] });

    expect(voxelGridKey(grid, VoxelStatistics.Average)).toBe(
      voxelGridKey(same, VoxelStatistics.Average)
    );
    expect(voxelGridKey(grid, VoxelStatistics.Average)).toContain('average');
  });

  it('gives two keys to two grids that differ in direction alone', () => {
    const axisAligned = makeGrid({ dimensions: [4, 4, 4] });
    const oblique = makeGrid({
      dimensions: [4, 4, 4],
      direction: [0, 1, 0, 0, 0, 1, 1, 0, 0],
    });

    expect(voxelGridKey(axisAligned, VoxelStatistics.Average)).not.toBe(
      voxelGridKey(oblique, VoxelStatistics.Average)
    );
  });

  it('takes the noise of a floating point computation out of the key', () => {
    const grid = makeGrid({
      dimensions: [4, 4, 4],
      spacing: [0.1 + 0.2, 1, 1],
    });
    const same = makeGrid({ dimensions: [4, 4, 4], spacing: [0.3, 1, 1] });

    expect(voxelGridKey(grid, VoxelStatistics.Average)).toBe(
      voxelGridKey(same, VoxelStatistics.Average)
    );
  });
});

describe('voxelGrid.voxelGridWithinLimits', () => {
  it('counts the cost of a grid before a caller allocates a texture', () => {
    const grid = makeGrid({ dimensions: [2049, 256, 256] });

    expect(voxelCountOfGrid(grid)).toBe(2049 * 256 * 256);
    expect(maxEdgeOfGrid(grid)).toBe(2049);
    expect(voxelGridWithinLimits(grid, { maxEdge: 2048 })).toBe(false);
    expect(voxelGridWithinLimits(grid, { maxEdge: 4096 })).toBe(true);
    expect(
      voxelGridWithinLimits(grid, { maxEdge: 4096, maxVoxelCount: 1000 })
    ).toBe(false);
  });

  it('accepts the grid that the reduction factors produce', () => {
    const limits = { maxEdge: 2048 };
    const source = makeGrid({ dimensions: [2049, 512, 512] });
    const derived = deriveBoxAverageGrid(source, {
      factors: boxAverageReductionFactors(source.dimensions, limits),
    });

    expect(voxelGridWithinLimits(derived, limits)).toBe(true);
  });
});
