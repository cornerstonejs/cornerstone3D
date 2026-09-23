import type {
  Point3,
  VoxelGridReduction,
  VoxelStatistic,
  VoxelStatisticAccumulator,
  VoxelStatisticDefinition,
} from '../../types';
import { normalizedFactors, reducedDimensions } from './reducedDimensions';
import VoxelStatistics from '../../enums/VoxelStatistics';
import { requireVoxelStatistic } from './voxelStatistics';

/**
 * The value of one voxel. A voxel of one component is a number, and a voxel of
 * more than one component is an array of numbers. `VoxelManager` gives an `RGB`
 * value, which is an array of three numbers, for each factory that takes a
 * `numberOfComponents` above 1.
 */
export type BoxStatisticValue = number | number[];

/**
 * The source of a box reduction. `IVoxelManager<number>` satisfies this shape,
 * and so does `IVoxelManager<RGB>`, so a caller can pass a sub voxel manager
 * directly.
 */
export type BoxStatisticSource<T extends BoxStatisticValue = number> = {
  /** The number of source voxels on each axis. */
  dimensions: Point3;
  /** Reads one source voxel. */
  getAtIJK: (i: number, j: number, k: number) => T;
};

/**
 * The destination of a box reduction. `IVoxelManager` satisfies this shape as
 * well, for a value of one component and for a value of more than one.
 */
export type BoxStatisticTarget<T extends BoxStatisticValue = number> = {
  /** Writes one reduced voxel. */
  setAtIJK: (i: number, j: number, k: number, value: T) => unknown;
};

export type BoxStatisticOptions = {
  /**
   * The statistic of the reduction. The default is `'average'`. An extension
   * registers another statistic with `registerVoxelStatistic`.
   */
  statistic?: VoxelStatistic;
  /**
   * Rounds each value to the nearest whole number. The default is `true`,
   * because a store of whole numbers truncates otherwise, and a truncation
   * moves every value down by up to one unit. A voxel of more than one
   * component rounds each component. Set this to `false` for a store of
   * floating point numbers.
   */
  round?: boolean;
};

/** The region and the box sizes, each one resolved to a usable value. */
type ResolvedReduction = {
  factors: Point3;
  sourceOffset: Point3;
  sourceEnd: Point3;
  dimensions: Point3;
};

/**
 * The accumulators of one reduction. The reduction reuses them for every box,
 * and it adds one accumulator when a voxel holds more components than the
 * accumulators that the reduction already built.
 */
type BoxAccumulators = {
  definition: VoxelStatisticDefinition;
  perComponent: VoxelStatisticAccumulator[];
};

function resolveReduction(
  source: BoxStatisticSource<BoxStatisticValue>,
  reduction: VoxelGridReduction
): ResolvedReduction {
  const factors = normalizedFactors(reduction.factors);
  const sourceOffset = (reduction.sourceOffset ?? [0, 0, 0]) as Point3;
  const sourceDimensions = (reduction.sourceDimensions ??
    source.dimensions) as Point3;

  return {
    factors,
    sourceOffset,
    sourceEnd: [
      sourceOffset[0] + sourceDimensions[0],
      sourceOffset[1] + sourceDimensions[1],
      sourceOffset[2] + sourceDimensions[2],
    ],
    dimensions: reducedDimensions(sourceDimensions, factors),
  };
}

function createAccumulators(statistic: VoxelStatistic): BoxAccumulators {
  return { definition: requireVoxelStatistic(statistic), perComponent: [] };
}

/** Builds the accumulators that a voxel of `count` components needs. */
function growAccumulators(accumulators: BoxAccumulators, count: number): void {
  const { definition, perComponent } = accumulators;

  while (perComponent.length < count) {
    perComponent.push(definition.createAccumulator());
  }
}

/**
 * Gives the statistic of one box.
 *
 * A VALUE OF MORE THAN ONE COMPONENT GETS ONE ACCUMULATOR FOR EACH COMPONENT.
 * The components of one voxel are independent of each other, so a definition of
 * a statistic states the arithmetic of one component only, and the same
 * definition then serves a value of one component and a value of three.
 *
 * The function reads the number of the components from each value, and it does
 * not read `numberOfComponents` of the source. A voxel manager of a source that
 * holds four components for each voxel gives three components to a reader, and
 * the shape of the value is therefore the only statement that is always true.
 */
function valueOfBox(
  source: BoxStatisticSource<BoxStatisticValue>,
  resolved: ResolvedReduction,
  accumulators: BoxAccumulators,
  i: number,
  j: number,
  k: number
): BoxStatisticValue {
  const { factors, sourceOffset, sourceEnd } = resolved;
  const { perComponent } = accumulators;

  const startI = sourceOffset[0] + i * factors[0];
  const startJ = sourceOffset[1] + j * factors[1];
  const startK = sourceOffset[2] + k * factors[2];
  const endI = Math.min(startI + factors[0], sourceEnd[0]);
  const endJ = Math.min(startJ + factors[1], sourceEnd[1]);
  const endK = Math.min(startK + factors[2], sourceEnd[2]);

  for (let component = 0; component < perComponent.length; component++) {
    perComponent[component].reset();
  }

  // 0 means that every value of this box holds one component.
  let components = 0;

  for (let sourceK = startK; sourceK < endK; sourceK++) {
    for (let sourceJ = startJ; sourceJ < endJ; sourceJ++) {
      for (let sourceI = startI; sourceI < endI; sourceI++) {
        const value = source.getAtIJK(sourceI, sourceJ, sourceK);

        if (typeof value === 'number') {
          // THE BOX TAKES ONLY THE VALUES THAT ARE NUMBERS. A source that is
          // not completely loaded gives `undefined` for a voxel that has not
          // arrived, and one such voxel must not destroy the value of the box.
          if (Number.isFinite(value)) {
            growAccumulators(accumulators, 1);
            perComponent[0].add(value);
          }

          continue;
        }

        if (!value) {
          continue;
        }

        const length = value.length;

        growAccumulators(accumulators, length);

        if (length > components) {
          components = length;
        }

        for (let component = 0; component < length; component++) {
          const componentValue = value[component];

          if (Number.isFinite(componentValue)) {
            perComponent[component].add(componentValue);
          }
        }
      }
    }
  }

  if (components === 0) {
    return perComponent.length === 0 ? undefined : perComponent[0].getValue();
  }

  const result: number[] = [];

  for (let component = 0; component < components; component++) {
    const componentValue = perComponent[component].getValue();

    // One component with no value makes the whole voxel empty. A partial voxel
    // would otherwise carry a colour that no source voxel holds.
    if (componentValue === undefined) {
      return undefined;
    }

    result.push(componentValue);
  }

  return result;
}

/** Rounds a value of one component, or each component of a value. */
function roundValue(value: BoxStatisticValue): BoxStatisticValue {
  if (typeof value === 'number') {
    return Math.round(value);
  }

  for (let component = 0; component < value.length; component++) {
    value[component] = Math.round(value[component]);
  }

  return value;
}

/**
 * Gives the statistic of the source voxels of one box.
 *
 * The box is the box of the reduced voxel at `[i, j, k]`, and the function
 * clips the box to the region. A box at the end of an axis can therefore hold
 * fewer source voxels than the factor of that axis states.
 *
 * THE FUNCTION TAKES ONLY THE VALUES THAT ARE NUMBERS. A source that is not
 * completely loaded returns `undefined` for a voxel that has not arrived, and
 * one such voxel must not destroy the value of the whole box. The function
 * returns `undefined` when the box holds no such value, and a caller then keeps
 * the value that the target already holds.
 *
 * @param source - the data that the box reads
 * @param reduction - the box size of each axis, and the region of the source
 * @param i - the index of the reduced voxel on the first axis
 * @param j - the index of the reduced voxel on the second axis
 * @param k - the index of the reduced voxel on the third axis
 * @param statistic - the statistic of the reduction, `'average'` by default
 * @returns the value of the box, or `undefined`
 */
function boxStatisticAtIJK<T extends BoxStatisticValue = number>(
  source: BoxStatisticSource<T>,
  reduction: VoxelGridReduction,
  i: number,
  j: number,
  k: number,
  statistic: VoxelStatistic = VoxelStatistics.Average
): T {
  return valueOfBox(
    source,
    resolveReduction(source, reduction),
    createAccumulators(statistic),
    i,
    j,
    k
  ) as T;
}

/**
 * Gives the mean of the source voxels of one box. A voxel of more than one
 * component gives the mean of each component.
 *
 * @param source - the data that the box reads
 * @param reduction - the box size of each axis, and the region of the source
 * @param i - the index of the reduced voxel on the first axis
 * @param j - the index of the reduced voxel on the second axis
 * @param k - the index of the reduced voxel on the third axis
 * @returns the mean of the box, or `undefined`
 */
function boxAverageAtIJK<T extends BoxStatisticValue = number>(
  source: BoxStatisticSource<T>,
  reduction: VoxelGridReduction,
  i: number,
  j: number,
  k: number
): T {
  return boxStatisticAtIJK(source, reduction, i, j, k, VoxelStatistics.Average);
}

/**
 * Writes the statistic of each box of a region of the source into the target.
 *
 * The target holds the dimensions that `reducedDimensions` gives for the region
 * and the factors, and `targetOffset` moves the result to another place in a
 * larger target. The function writes no value for a box that holds no value, so
 * the target keeps what the target already holds for that voxel.
 *
 * The function builds ONE accumulator for each component, and it resets those
 * accumulators for each box.
 *
 * @param source - the data that the reduction reads
 * @param reduction - the box size of each axis, and the region of the source
 * @param target - the data that the reduction writes
 * @param options - the statistic, and the rounding of each value
 * @returns the number of reduced voxels that the function wrote
 */
function reduceByBoxStatistic<T extends BoxStatisticValue = number>(
  source: BoxStatisticSource<T>,
  reduction: VoxelGridReduction,
  target: BoxStatisticTarget<T>,
  options: BoxStatisticOptions = {}
): number {
  const { round = true, statistic = VoxelStatistics.Average } = options;
  const accumulators = createAccumulators(statistic);
  const resolved = resolveReduction(source, reduction);
  const { dimensions } = resolved;
  const [targetI, targetJ, targetK] = reduction.targetOffset ?? [0, 0, 0];

  let written = 0;

  for (let k = 0; k < dimensions[2]; k++) {
    for (let j = 0; j < dimensions[1]; j++) {
      for (let i = 0; i < dimensions[0]; i++) {
        const value = valueOfBox(source, resolved, accumulators, i, j, k);

        if (value === undefined) {
          continue;
        }

        target.setAtIJK(
          targetI + i,
          targetJ + j,
          targetK + k,
          (round ? roundValue(value) : value) as T
        );
        written++;
      }
    }
  }

  return written;
}

/**
 * Writes the box average of a region of the source into the target.
 *
 * THE REDUCTION OF THE RESOLUTION IS A BOX AVERAGE, AND IT IS NEVER A
 * DECIMATION. A decimation of 2 takes every second voxel, which keeps the high
 * spatial frequencies and folds them into the signal as an alias. A reformat
 * then shows vertical blur with stair steps on an oblique structure, and that
 * result is not acceptable when a reformat is diagnostic.
 *
 * THE AVERAGE APPLIES TO A VALUE THAT A MEAN DESCRIBES. A mean of the labels of
 * a segmentation has no meaning, and a reduction of a labelmap therefore needs
 * another statistic, which an extension registers.
 *
 * @param source - the data that the reduction reads
 * @param reduction - the box size of each axis, and the region of the source
 * @param target - the data that the reduction writes
 * @param options - the rounding of each average
 * @returns the number of reduced voxels that the function wrote
 */
function reduceByBoxAverage<T extends BoxStatisticValue = number>(
  source: BoxStatisticSource<T>,
  reduction: VoxelGridReduction,
  target: BoxStatisticTarget<T>,
  options: Omit<BoxStatisticOptions, 'statistic'> = {}
): number {
  return reduceByBoxStatistic(source, reduction, target, {
    ...options,
    statistic: VoxelStatistics.Average,
  });
}

export {
  reduceByBoxStatistic as default,
  reduceByBoxStatistic,
  reduceByBoxAverage,
  boxStatisticAtIJK,
  boxAverageAtIJK,
};
