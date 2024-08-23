import type RLEVoxelMap from '../utilities/RLEVoxelMap';

/**
 * The RLERun specifies a contigous run of values for a row,
 * where all indices (i only) from `[start,end)` have the specified
 * value.
 */
export interface RLERun<T> {
  value: T;
  start: number;
  end: number;
}

export type IRLEVoxelMap<T> = RLEVoxelMap<T>;
