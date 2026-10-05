import VoxelStatistics, {
  registerVoxelStatisticsConstant,
} from '../../enums/VoxelStatistics';
import type {
  VoxelStatistic,
  VoxelStatisticAccumulator,
  VoxelStatisticConstants,
  VoxelStatisticDefinition,
} from '../../types';
import VoxelReductions from '../../enums/VoxelReductions';
import {
  reduceAverageAlongKBySlices,
  reduceForegroundMajorityBySlices,
} from './sliceReductions';
import fillPlaneByAverage from './averagePlane';
import fillPlaneByForegroundMajority from './foregroundMajorityPlane';

type RegisterVoxelStatisticNamedOptions<
  Name extends keyof VoxelStatisticConstants,
> = VoxelStatisticDefinition & {
  /** Constant name added on `Enums.VoxelStatistics`, e.g. 'MINIMUM'. */
  name: Name;
  statistic: VoxelStatisticConstants[Name];
};

type RegisterVoxelStatisticUnnamedOptions = VoxelStatisticDefinition & {
  statistic: VoxelStatistic | string;
  name?: never;
};

export type RegisterVoxelStatisticOptions =
  | RegisterVoxelStatisticNamedOptions<keyof VoxelStatisticConstants>
  | RegisterVoxelStatisticUnnamedOptions;

const statisticDefinitions = new Map<string, VoxelStatisticDefinition>();
const registeredConstantNames: Array<keyof VoxelStatisticConstants> = [];
let hasRegisteredCoreVoxelStatistics = false;

/** Builds the accumulator of the mean of a box. */
function createAverageAccumulator(): VoxelStatisticAccumulator {
  let sum = 0;
  let count = 0;

  return {
    reset: () => {
      sum = 0;
      count = 0;
    },
    add: (value: number) => {
      sum += value;
      count++;
    },
    getValue: () => (count === 0 ? undefined : sum / count),
  };
}

/**
 * Builds the accumulator of the foreground majority of a box.
 *
 * Background (0) does not compete: a box that holds any non-zero label keeps
 * the majority among those labels. Otherwise a 2×2×N reduction at an organ
 * edge is mostly empty and a plain majority would erase the segment. On a tie
 * among non-zero labels, keeps the first label that reached the winning count.
 */
function createForegroundMajorityAccumulator(): VoxelStatisticAccumulator {
  const counts = new Map<number, number>();
  let majority: number | undefined;
  let majorityCount = 0;
  let sawBackground = false;

  return {
    reset: () => {
      counts.clear();
      majority = undefined;
      majorityCount = 0;
      sawBackground = false;
    },
    add: (value: number) => {
      if (value === 0) {
        sawBackground = true;
        return;
      }

      const next = (counts.get(value) ?? 0) + 1;

      counts.set(value, next);

      if (next > majorityCount) {
        majorityCount = next;
        majority = value;
      }
    },
    getValue: () => {
      if (majority !== undefined) {
        return majority;
      }

      return sawBackground ? 0 : undefined;
    },
  };
}

function registerCoreVoxelStatistics(): void {
  if (hasRegisteredCoreVoxelStatistics) {
    return;
  }
  hasRegisteredCoreVoxelStatistics = true;

  // The core statistics carry no constant name here: `Enums.VoxelStatistics`
  // already holds `Average` and `ForegroundMajority` as built-in constants.
  registerVoxelStatistic({
    statistic: VoxelStatistics.Average,
    defaultSelection: true,
    description: 'The mean of the source voxels of one box.',
    createAccumulator: createAverageAccumulator,
    reduceBySlices: reduceAverageAlongKBySlices,
    fillPlane: fillPlaneByAverage,
    boxReduction: VoxelReductions.BoxAverage,
  });
  registerVoxelStatistic({
    statistic: VoxelStatistics.ForegroundMajority,
    defaultSelection: false,
    description:
      'The majority non-zero label of one box (background ignored unless the box is empty). Used to reduce labelmaps.',
    createAccumulator: createForegroundMajorityAccumulator,
    reduceBySlices: reduceForegroundMajorityBySlices,
    fillPlane: fillPlaneByForegroundMajority,
    boxReduction: VoxelReductions.BoxForegroundMajority,
  });
}

/**
 * Adds a statistic of a representation of the voxel data, and — when `name` is
 * given — a constant on `Enums.VoxelStatistics`.
 *
 * The definition carries the arithmetic of the statistic. An accumulator takes
 * ONE COMPONENT of one voxel, because the code that reduces a grid builds one
 * accumulator for each component of a voxel. A definition therefore serves a
 * volume of one component and an RGB volume, and it states the arithmetic once.
 *
 * `reduceBySlices`, `fillPlane` and `boxReduction` are optional. Without
 * them, a reduction takes the accumulator, a reduced texture slice falls back
 * to the composite, and a box derivation records `boxAverage`.
 *
 * `defaultSelection` states whether a default selection can return a
 * representation of this statistic. A minimum and a maximum leave the field
 * `false`: a minimum grid at a high resolution would otherwise win a selection
 * that asks for the highest resolution, and a read would then return minimum
 * values in place of the data.
 *
 * For compile-time typing, augment the `VoxelStatisticRegistry` (wire strings)
 * and `VoxelStatisticConstants` (constant names) interfaces in your extension's
 * `.d.ts`:
 *
 * ```ts
 * declare module '@cornerstonejs/core' {
 *   interface VoxelStatisticRegistry {
 *     'myOrg:minimum': 'myOrg:minimum';
 *   }
 *   interface VoxelStatisticConstants {
 *     readonly MINIMUM: 'myOrg:minimum';
 *   }
 * }
 * ```
 *
 * @example
 * ```ts
 * registerVoxelStatistic({
 *   name: 'MINIMUM',
 *   statistic: 'myOrg:minimum',
 *   createAccumulator: () => {
 *     let minimum;
 *     return {
 *       reset: () => {
 *         minimum = undefined;
 *       },
 *       add: (value) => {
 *         minimum = minimum === undefined ? value : Math.min(minimum, value);
 *       },
 *       getValue: () => minimum,
 *     };
 *   },
 * });
 * reduceByBoxStatistic(source, reduction, target, {
 *   statistic: VoxelStatistics.MINIMUM,
 * });
 * ```
 */
function registerVoxelStatistic<Name extends keyof VoxelStatisticConstants>(
  options: RegisterVoxelStatisticNamedOptions<Name>
): void;
function registerVoxelStatistic(
  options: RegisterVoxelStatisticUnnamedOptions
): void;
function registerVoxelStatistic({
  statistic,
  name,
  defaultSelection = false,
  description,
  createAccumulator,
  reduceBySlices,
  fillPlane,
  boxReduction,
}: RegisterVoxelStatisticOptions): void {
  if (!statistic) {
    throw new Error('registerVoxelStatistic: the definition needs a statistic');
  }

  if (statisticDefinitions.has(statistic)) {
    throw new Error(`Voxel statistic "${statistic}" is already registered`);
  }

  if (typeof createAccumulator !== 'function') {
    throw new Error(
      `Voxel statistic "${statistic}" must declare a createAccumulator function`
    );
  }

  for (const [field, hook] of Object.entries({ reduceBySlices, fillPlane })) {
    if (hook !== undefined && typeof hook !== 'function') {
      throw new Error(
        `Voxel statistic "${statistic}" declares ${field}, which is not a function`
      );
    }
  }

  if (name && Object.prototype.hasOwnProperty.call(VoxelStatistics, name)) {
    throw new Error(
      `Voxel statistic constant "${String(name)}" already exists`
    );
  }

  statisticDefinitions.set(statistic, {
    statistic,
    defaultSelection,
    description,
    createAccumulator,
    reduceBySlices,
    fillPlane,
    boxReduction,
  });

  if (name) {
    registerVoxelStatisticsConstant(
      name,
      statistic as VoxelStatisticConstants[typeof name]
    );
    registeredConstantNames.push(name);
  }
}

/**
 * Gives the definition of one statistic.
 *
 * @param statistic - the identifier of the statistic
 * @returns the definition, or `undefined` when nothing registered it
 */
function getVoxelStatistic(
  statistic: VoxelStatistic | string
): VoxelStatisticDefinition {
  registerCoreVoxelStatistics();

  return statisticDefinitions.get(statistic);
}

/**
 * Gives the definition of one statistic, and throws when nothing registered
 * that statistic. The code that reduces a grid uses this function, because a
 * statistic that nothing registered gives no arithmetic, and a silent default
 * to the average would write the wrong values.
 *
 * @param statistic - the identifier of the statistic
 * @returns the definition
 */
function requireVoxelStatistic(
  statistic: VoxelStatistic | string
): VoxelStatisticDefinition {
  const definition = getVoxelStatistic(statistic);

  if (!definition) {
    throw new Error(
      `Voxel statistic "${statistic}" is not registered. Call registerVoxelStatistic first.`
    );
  }

  return definition;
}

/**
 * Gives every definition that the registry holds.
 *
 * @returns the definitions, in the order of the registration
 */
function getVoxelStatistics(): VoxelStatisticDefinition[] {
  registerCoreVoxelStatistics();

  return [...statisticDefinitions.values()];
}

/** Whether `statistic` names a registered statistic. */
function isRegisteredVoxelStatistic(statistic: string): boolean {
  return getVoxelStatistic(statistic) !== undefined;
}

/**
 * States whether a default selection can return a representation of this
 * statistic. See the note on `VoxelStatisticDefinition.defaultSelection`.
 *
 * @param statistic - the identifier of the statistic
 * @returns true when a default selection can return that statistic
 */
function isDefaultSelectionStatistic(
  statistic: VoxelStatistic | string
): boolean {
  return getVoxelStatistic(statistic)?.defaultSelection === true;
}

/**
 * Test-only: wipes all statistic registrations (including the lazily registered
 * core statistics) and removes the `Enums.VoxelStatistics` constants added
 * through `registerVoxelStatistic()`. Not part of the public API — import it
 * from this module directly in test setup/teardown.
 * @internal
 */
function __resetVoxelStatisticRegistry(): void {
  statisticDefinitions.clear();
  hasRegisteredCoreVoxelStatistics = false;

  for (const name of registeredConstantNames) {
    delete (VoxelStatistics as Record<keyof VoxelStatisticConstants, string>)[
      name
    ];
  }
  registeredConstantNames.length = 0;
}

export {
  registerVoxelStatistic,
  getVoxelStatistic,
  requireVoxelStatistic,
  getVoxelStatistics,
  isRegisteredVoxelStatistic,
  isDefaultSelectionStatistic,
  createAverageAccumulator,
  __resetVoxelStatisticRegistry,
};
