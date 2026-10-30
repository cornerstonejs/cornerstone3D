import type { BoundsIJK, Point3, VoxelGrid } from '../../types';

/**
 * Gives the world position of one voxel of a grid.
 *
 * The origin of a grid is the world position of the centre of the voxel at
 * `[0, 0, 0]`, and the direction holds the unit vector of each axis, as
 * `[i0, i1, i2, j0, j1, j2, k0, k1, k2]`. The index can hold a fraction.
 *
 * @param grid - the grid
 * @param ijk - the index of the voxel
 * @returns the world position
 */
function gridIndexToWorld(grid: VoxelGrid, ijk: Point3): Point3 {
  const world: Point3 = [grid.origin[0], grid.origin[1], grid.origin[2]];

  for (let axis = 0; axis < 3; axis++) {
    const distance = ijk[axis] * grid.spacing[axis];

    world[0] += grid.direction[axis * 3] * distance;
    world[1] += grid.direction[axis * 3 + 1] * distance;
    world[2] += grid.direction[axis * 3 + 2] * distance;
  }

  return world;
}

/**
 * Gives the index of a world position in a grid. The index holds a fraction,
 * and the index can lie outside the grid.
 *
 * THE FUNCTION TAKES THE AXES OF THE GRID AS UNIT VECTORS THAT ARE AT A RIGHT
 * ANGLE TO EACH OTHER, which every grid of Cornerstone3D is. The inverse of
 * such a direction is its transpose, so the function needs no inverse of a
 * matrix: it projects the distance from the origin onto each axis.
 *
 * @param grid - the grid
 * @param world - the world position
 * @returns the index, which holds a fraction
 */
function gridWorldToIndex(grid: VoxelGrid, world: Point3): Point3 {
  const dx = world[0] - grid.origin[0];
  const dy = world[1] - grid.origin[1];
  const dz = world[2] - grid.origin[2];
  const ijk: Point3 = [0, 0, 0];

  for (let axis = 0; axis < 3; axis++) {
    const projection =
      dx * grid.direction[axis * 3] +
      dy * grid.direction[axis * 3 + 1] +
      dz * grid.direction[axis * 3 + 2];

    ijk[axis] = projection / grid.spacing[axis];
  }

  return ijk;
}

/**
 * Gives the index in the target grid of a voxel of the source grid. The index
 * holds a fraction.
 *
 * @param source - the grid that the index belongs to
 * @param target - the grid that the result belongs to
 * @param ijk - the index in the source grid
 * @returns the index in the target grid
 */
function mapIndexBetweenGrids(
  source: VoxelGrid,
  target: VoxelGrid,
  ijk: Point3
): Point3 {
  return gridWorldToIndex(target, gridIndexToWorld(source, ijk));
}

/**
 * Gives the index of the nearest voxel of the target grid.
 *
 * @param source - the grid that the index belongs to
 * @param target - the grid that the result belongs to
 * @param ijk - the index in the source grid
 * @returns the index of the nearest voxel of the target grid
 */
function mapIndexToNearestVoxel(
  source: VoxelGrid,
  target: VoxelGrid,
  ijk: Point3
): Point3 {
  const mapped = mapIndexBetweenGrids(source, target, ijk);

  return [Math.round(mapped[0]), Math.round(mapped[1]), Math.round(mapped[2])];
}

/** States whether an index of whole numbers lies inside the grid. */
function gridContainsIndex(grid: VoxelGrid, ijk: Point3): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (ijk[axis] < 0 || ijk[axis] > grid.dimensions[axis] - 1) {
      return false;
    }
  }

  return true;
}

/** Gives the eight corners of a region, as indices of the source grid. */
function cornersOfBounds(bounds: BoundsIJK): Point3[] {
  const corners: Point3[] = [];

  for (const i of bounds[0]) {
    for (const j of bounds[1]) {
      for (const k of bounds[2]) {
        corners.push([i, j, k]);
      }
    }
  }

  return corners;
}

/**
 * States whether the target grid covers a region of the source grid.
 *
 * The function maps the EIGHT CORNERS of the region, and not the two extreme
 * corners alone, because the direction of the target grid can differ from the
 * direction of the source grid. A tolerance of half a voxel of the target grid
 * applies at each face, so a voxel of the target grid that holds the corner
 * counts as coverage.
 *
 * @param source - the grid of the region
 * @param bounds - the region, as `[[minI, maxI], [minJ, maxJ], [minK, maxK]]`
 * @param target - the grid that must cover the region
 * @returns true when the target grid covers the whole region
 */
function gridCoversRegion(
  source: VoxelGrid,
  bounds: BoundsIJK,
  target: VoxelGrid
): boolean {
  const tolerance = 0.5 + 1e-6;

  for (const corner of cornersOfBounds(bounds)) {
    const mapped = mapIndexBetweenGrids(source, target, corner);

    for (let axis = 0; axis < 3; axis++) {
      if (
        mapped[axis] < -tolerance ||
        mapped[axis] > target.dimensions[axis] - 1 + tolerance
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Gives the voxels of the target grid that a region of the source grid covers.
 *
 * THE FUNCTION WORKS ON THE EXTENT OF A VOXEL, and not on the centre of a
 * voxel. A voxel covers half a spacing on each side of its centre, so the
 * region of the source reaches from `min - 0.5` to `max + 0.5` in the index
 * space of the source. The function maps those two faces, and it then gives
 * every voxel of the target whose own extent meets them.
 *
 * That rule is correct in BOTH DIRECTIONS, and a rule that rounds a centre is
 * not:
 *
 * - From a fine grid to a coarse grid, four slices of the full resolution meet
 *   ONE frame of a grid whose k factor is 4, and not two.
 * - From a coarse grid to a fine grid, one voxel of that coarse grid meets the
 *   FOUR slices that feed it, and not one.
 *
 * @param source - the grid of the region
 * @param target - the grid that the result belongs to
 * @param bounds - the region in the source grid
 * @returns the region in the target grid, which can be empty
 */
function mapBoundsBetweenGrids(
  source: VoxelGrid,
  target: VoxelGrid,
  bounds: BoundsIJK
): BoundsIJK {
  // A face that falls exactly on the face of a voxel of the target belongs to
  // neither voxel, and this tolerance keeps that voxel out of the result.
  const tolerance = 1e-6;
  const faces: BoundsIJK = [
    [bounds[0][0] - 0.5, bounds[0][1] + 0.5],
    [bounds[1][0] - 0.5, bounds[1][1] + 0.5],
    [bounds[2][0] - 0.5, bounds[2][1] + 0.5],
  ];
  const mapped: BoundsIJK = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ];

  for (const corner of cornersOfBounds(faces)) {
    const point = mapIndexBetweenGrids(source, target, corner);

    for (let axis = 0; axis < 3; axis++) {
      mapped[axis][0] = Math.min(mapped[axis][0], point[axis]);
      mapped[axis][1] = Math.max(mapped[axis][1], point[axis]);
    }
  }

  return [
    [
      Math.ceil(mapped[0][0] - 0.5 + tolerance),
      Math.floor(mapped[0][1] + 0.5 - tolerance),
    ],
    [
      Math.ceil(mapped[1][0] - 0.5 + tolerance),
      Math.floor(mapped[1][1] + 0.5 - tolerance),
    ],
    [
      Math.ceil(mapped[2][0] - 0.5 + tolerance),
      Math.floor(mapped[2][1] + 0.5 - tolerance),
    ],
  ];
}

/** Gives the region that holds every voxel of the grid. */
function boundsOfGrid(grid: VoxelGrid): BoundsIJK {
  return [
    [0, grid.dimensions[0] - 1],
    [0, grid.dimensions[1] - 1],
    [0, grid.dimensions[2] - 1],
  ];
}

/**
 * Gives the region of one frame of the grid, which is one k slice. A frame is
 * the delivery unit of a streaming volume, and a brick or a tile states its own
 * region instead.
 */
function boundsOfFrame(grid: VoxelGrid, frameIndex: number): BoundsIJK {
  return [
    [0, grid.dimensions[0] - 1],
    [0, grid.dimensions[1] - 1],
    [frameIndex, frameIndex],
  ];
}

/** Gives the region that lies in both regions, which can be empty. */
function intersectBounds(a: BoundsIJK, b: BoundsIJK): BoundsIJK {
  return [
    [Math.max(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.min(a[1][1], b[1][1])],
    [Math.max(a[2][0], b[2][0]), Math.min(a[2][1], b[2][1])],
  ];
}

/** Gives the number of voxels of a region. An empty region gives 0. */
function volumeOfBounds(bounds: BoundsIJK): number {
  let volume = 1;

  for (let axis = 0; axis < 3; axis++) {
    const length = bounds[axis][1] - bounds[axis][0] + 1;

    if (length <= 0) {
      return 0;
    }

    volume *= length;
  }

  return volume;
}

/** States whether the outer region holds every voxel of the inner region. */
function containsBounds(outer: BoundsIJK, inner: BoundsIJK): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (inner[axis][0] < outer[axis][0] || inner[axis][1] > outer[axis][1]) {
      return false;
    }
  }

  return true;
}

/** States whether two regions name the same voxels. */
function sameBounds(a: BoundsIJK, b: BoundsIJK): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (a[axis][0] !== b[axis][0] || a[axis][1] !== b[axis][1]) {
      return false;
    }
  }

  return true;
}

export {
  gridIndexToWorld,
  gridWorldToIndex,
  mapBoundsBetweenGrids,
  boundsOfGrid,
  boundsOfFrame,
  intersectBounds,
  volumeOfBounds,
  sameBounds,
  containsBounds,
  mapIndexBetweenGrids,
  mapIndexToNearestVoxel,
  gridContainsIndex,
  gridCoversRegion,
  cornersOfBounds,
};
