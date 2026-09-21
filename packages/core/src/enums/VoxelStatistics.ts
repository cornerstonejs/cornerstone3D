import type {
  CoreVoxelStatisticConstants,
  VoxelStatisticConstants,
} from '../types/VoxelStatisticRegistry';

/**
 * Shape of `Enums.VoxelStatistics`. Augment {@link VoxelStatisticConstants} in
 * your extension `.d.ts`; property types on `Enums.VoxelStatistics` follow that
 * interface.
 */
export type VoxelStatisticsMap = VoxelStatisticConstants;

const builtInVoxelStatistics: CoreVoxelStatisticConstants = {
  Average: 'average',
};

/**
 * Runtime voxel statistic constants: built-in names map to wire-type strings.
 *
 * The statistic of a representation of the voxel data. `Average` is available
 * immediately. Extension statistics are added when you call
 * `registerVoxelStatistic({ name: 'MINIMUM', statistic: 'myOrg:minimum', ... })`.
 *
 * For compile-time names, augment `VoxelStatisticConstants` only —
 * `Enums.VoxelStatistics` is typed from it.
 */
const VoxelStatistics = builtInVoxelStatistics as VoxelStatisticsMap;

export function registerVoxelStatisticsConstant<
  Name extends keyof VoxelStatisticConstants,
>(name: Name, statistic: VoxelStatisticConstants[Name]): void {
  if (Object.prototype.hasOwnProperty.call(VoxelStatistics, name)) {
    throw new Error(
      `Voxel statistic constant "${String(name)}" already exists`
    );
  }

  (VoxelStatistics as Record<keyof VoxelStatisticConstants, string>)[name] =
    statistic;
}

export default VoxelStatistics;
