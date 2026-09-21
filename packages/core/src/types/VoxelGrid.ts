import type Mat3 from './Mat3';
import type Point3 from './Point3';
import type { VoxelStatistic } from './VoxelStatisticRegistry';

/**
 * A grid descriptor. A grid is one representation of the voxel data, and the
 * descriptor carries an origin, a direction, a spacing and a set of dimensions.
 * IT CARRIES NOTHING ELSE.
 *
 * One type describes each of these cases, and a grid can be more than one of
 * them at the same time:
 *
 * - A sub-resolution grid covers the whole volume at a larger spacing.
 * - A sub-region grid covers a part of the volume at the full spacing. A brick
 *   of a brick store is a sub-region grid, and so is an oblique slab.
 * - A level of a server side brick store is a grid whose values are on the
 *   server.
 *
 * THERE IS NO LEVEL INDEX. There is no `levelIndex` field, no convention that
 * "level 0 is the finest", no array of levels, and no pool that a level number
 * keys. There are two reasons:
 *
 * - The spacing already carries on three axes what an ordinal carries on one.
 * - The question of the brick format is open, and an answer that interleaves
 *   the k axis makes the space of the levels two-dimensional, that is an
 *   in-plane level and a k group. A descriptor that holds no ordinal cannot be
 *   wrong either way.
 *
 * Two grids can share a spacing and differ in origin. A set of the odd slices
 * and a set of the even slices are two distinct grids, and so are a decimation
 * and a box average of one region, which lie apart by a part of a voxel. NO
 * CODE MAY ASSUME ONE GRID FOR EACH SPACING.
 *
 * MANY GRIDS CAN EXIST AT ONE RESOLUTION, each one covering a different part of
 * the volume. A set of bricks is exactly that. What is single is one sub voxel
 * manager for one region, at one resolution, at one statistic.
 *
 * The direction admits a grid that is not aligned with the axes of the volume,
 * so an oblique texture grid is expressible, and an oblique texture grid is not
 * a new kind of object.
 */
export type VoxelGrid = {
  /** The world position of the centre of the voxel at index `[0, 0, 0]`. */
  origin: Point3;
  /**
   * The unit vectors of the three axes, as `[i0, i1, i2, j0, j1, j2, k0, k1,
   * k2]`. This is the layout that `IImageVolume.direction` uses.
   */
  direction: Mat3;
  /** The distance in world units between two voxels on each axis. */
  spacing: Point3;
  /** The number of voxels on each axis, as `[width, height, depth]`. */
  dimensions: Point3;
};

/**
 * The identity of one representation of the voxel data.
 *
 * A representation is identified by the pair (grid, statistic), and not by the
 * grid alone. The pool of the textures uses the same pair as the key of an
 * entry, so a `minimum` grid of an extension does not collide with the
 * `average` grid that shares its geometry.
 */
export type VoxelRepresentationId = {
  grid: VoxelGrid;
  statistic: VoxelStatistic;
};

/**
 * The description of a box reduction of a region of a source grid.
 *
 * The reduction applies A SEPARATE FACTOR TO EACH AXIS, and the reduction is
 * not uniform. A volume that has an edge of 2049 voxels exceeds a limit of 2048
 * on one axis and by one voxel, and the correct answer reduces that one axis. A
 * uniform reduction by a factor of 2 on three axes takes 8 times fewer voxels
 * for an excess of one voxel, and that answer is wrong.
 */
export type VoxelGridReduction = {
  /**
   * The size of the box on each axis, in source voxels. A factor of 1 leaves
   * that axis at the source resolution.
   */
  factors: Point3;
  /**
   * The index in the source grid of the first voxel of the region. The default
   * is `[0, 0, 0]`, which is the whole grid.
   */
  sourceOffset?: Point3;
  /**
   * The number of source voxels of the region on each axis. The default is the
   * dimensions of the source grid.
   */
  sourceDimensions?: Point3;
};

/**
 * The limits that a grid must respect.
 *
 * "The texture is too large" and "there is not sufficient memory" produce the
 * same result for the user, so one mechanism covers the two causes.
 */
export type VoxelGridLimits = {
  /** The largest number of voxels that one axis can hold. */
  maxEdge?: number;
  /** The largest number of voxels that the whole grid can hold. */
  maxVoxelCount?: number;
};
