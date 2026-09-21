import type { VoxelStatistic } from './VoxelStatisticRegistry';

/**
 * The accumulator of one statistic over one box of source voxels.
 *
 * The code that reduces a grid creates ONE accumulator, and it calls `reset`
 * for each box. An accumulator that a box needs is therefore not an allocation
 * for each reduced voxel.
 *
 * AN ACCUMULATOR TAKES ONE COMPONENT OF ONE VOXEL. A voxel of a volume of one
 * component is a number, and a voxel of an RGB volume is an array of numbers.
 * The code that reduces a grid builds one accumulator for each component, and
 * the components are independent of each other. A definition therefore states
 * the arithmetic of one component only, and the same definition serves a volume
 * of one component and a volume of three.
 */
export interface VoxelStatisticAccumulator {
  /** Drops every value of the box that came before. */
  reset: () => void;
  /** Takes one component of one source voxel. The value is always a number. */
  add: (value: number) => void;
  /**
   * Gives the value of the box, or `undefined` when the box took no value. A
   * caller then keeps the value that the target already holds.
   */
  getValue: () => number;
}

/**
 * The definition of one statistic.
 *
 * An extension builds a definition and calls `registerVoxelStatistic`. The
 * reduction of a grid, the key of a representation and the selection rule then
 * work for that statistic, and no file of the core package changes.
 */
export interface VoxelStatisticDefinition {
  /**
   * The identifier of the statistic. A key of a representation holds it. An
   * extension augments `VoxelStatisticRegistry` with the string, so the
   * compiler accepts the string here and at each call site.
   */
  statistic: VoxelStatistic;
  /**
   * Whether a default selection can return a representation of this statistic.
   *
   * A DEFAULT SELECTION MUST CONSIDER THE `average` STATISTIC ONLY, so a
   * definition of a minimum or of a maximum sets this field to `false`. A
   * minimum grid at a high resolution would otherwise win a selection that asks
   * for the highest resolution, and a read would then return minimum values in
   * place of the data. That result is a wrong answer, and not a lossy one, so
   * no quality record reports it. A caller reaches such a statistic by direct
   * addressing.
   *
   * The default is `false`.
   */
  defaultSelection?: boolean;
  /** A short description of the statistic, for a user interface and for a log. */
  description?: string;
  /** Builds an accumulator over one box of source voxels. */
  createAccumulator: () => VoxelStatisticAccumulator;
}
