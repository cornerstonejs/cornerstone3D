export interface CoreVoxelStatisticRegistry {
  average: 'average';
  foregroundMajority: 'foregroundMajority';
}

export interface CoreVoxelStatisticConstants {
  readonly Average: 'average';
  readonly ForegroundMajority: 'foregroundMajority';
}

/**
 * Extensions can augment this interface to add additional voxel statistic
 * strings, e.g.
 * `interface VoxelStatisticRegistry { 'myOrg:minimum': 'myOrg:minimum' }`.
 */
export interface VoxelStatisticRegistry extends CoreVoxelStatisticRegistry {}

/**
 * Extensions augment this interface to add names on `Enums.VoxelStatistics`.
 * `VoxelStatisticsMap` and the runtime `Enums.VoxelStatistics` object are typed
 * from this interface — update it once, e.g.:
 *
 * `interface VoxelStatisticConstants { readonly MINIMUM: 'myOrg:minimum' }`
 */
export interface VoxelStatisticConstants extends CoreVoxelStatisticConstants {}

/**
 * The statistic that a representation of the voxel data holds.
 *
 * A representation is identified by the pair (grid, statistic), and not by the
 * grid alone. Two representations can share one grid and hold a different
 * statistic of the same source voxels.
 *
 * The core package holds `'average'` and `'foregroundMajority'`. Intensity
 * volumes reduce with average. Labelmaps reduce with foreground majority
 * (majority among non-zero labels; background only if the box is empty),
 * because a mean of segment indices invents a label that nothing drew. A
 * decimation aliases: it keeps the high spatial frequencies and folds them into
 * the signal, and a reformat then shows vertical blur with stair steps on an
 * oblique structure.
 *
 * A minimum and a maximum, for a short circuit of a ray cast over a very low
 * resolution copy of the whole volume, are an example of what an extension
 * adds. An extension augments `VoxelStatisticRegistry` and
 * `VoxelStatisticConstants`, and it calls `registerVoxelStatistic`.
 */
export type VoxelStatistic =
  VoxelStatisticRegistry[keyof VoxelStatisticRegistry];
