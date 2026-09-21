export interface CoreVoxelStatisticRegistry {
  average: 'average';
}

export interface CoreVoxelStatisticConstants {
  readonly Average: 'average';
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
 * The core package holds `'average'` only. The reduction of the resolution uses
 * that statistic, because a decimation aliases: a decimation keeps the high
 * spatial frequencies and folds them into the signal, and a reformat then shows
 * vertical blur with stair steps on an oblique structure.
 *
 * A minimum and a maximum, for a short circuit of a ray cast over a very low
 * resolution copy of the whole volume, are an example of what an extension
 * adds. An extension augments `VoxelStatisticRegistry` and
 * `VoxelStatisticConstants`, and it calls `registerVoxelStatistic`.
 */
export type VoxelStatistic =
  VoxelStatisticRegistry[keyof VoxelStatisticRegistry];
