/**
 * The arithmetic of a grid descriptor, and the arithmetic of a box reduction.
 *
 * A grid descriptor identifies one representation of the voxel data, and the
 * type of the descriptor is `VoxelGrid` in `packages/core/src/types/`. This
 * directory holds the functions that derive one grid from another, that fit a
 * grid inside the limits of a device, that reduce the values, and that give a
 * key to a representation.
 *
 * A representation is identified by the pair (grid, statistic). The set of the
 * statistics is open: the core package registers `'average'`, which is
 * `Enums.VoxelStatistics.Average`, and an extension registers another statistic
 * with `registerVoxelStatistic`. An extension augments the interfaces
 * `VoxelStatisticRegistry` and `VoxelStatisticConstants` for the types.
 *
 * Nothing here holds voxel data, and nothing here allocates a texture. A
 * composite voxel manager and a pool of textures consume these functions.
 */
export { reducedDimensions, normalizedFactors } from './reducedDimensions';
export {
  boxAverageReductionFactors,
  largestAxis,
} from './boxAverageReductionFactors';
export { deriveBoxAverageGrid } from './deriveBoxAverageGrid';
export {
  reduceByBoxStatistic,
  reduceByBoxAverage,
  boxStatisticAtIJK,
  boxAverageAtIJK,
  type BoxStatisticSource,
  type BoxStatisticTarget,
  type BoxStatisticOptions,
} from './boxStatistic';
export {
  registerVoxelStatistic,
  getVoxelStatistic,
  requireVoxelStatistic,
  getVoxelStatistics,
  isRegisteredVoxelStatistic,
  isDefaultSelectionStatistic,
  createAverageAccumulator,
  type RegisterVoxelStatisticOptions,
} from './voxelStatistics';
export {
  registerVoxelReduction,
  getVoxelReduction,
  isAliasingReduction,
  imageQualityStatusOfRecord,
  compareVoxelQuality,
  type RegisterVoxelReductionOptions,
} from './voxelQuality';
export { voxelGridKey, voxelGridsEqual } from './voxelGridKey';
export {
  gridIndexToWorld,
  gridWorldToIndex,
  mapIndexBetweenGrids,
  mapIndexToNearestVoxel,
  mapBoundsBetweenGrids,
  gridContainsIndex,
  gridCoversRegion,
  cornersOfBounds,
  boundsOfGrid,
  boundsOfFrame,
  intersectBounds,
  volumeOfBounds,
  sameBounds,
  containsBounds,
} from './voxelGridTransforms';
export {
  voxelCountOfGrid,
  maxEdgeOfGrid,
  voxelGridWithinLimits,
} from './voxelGridSize';
