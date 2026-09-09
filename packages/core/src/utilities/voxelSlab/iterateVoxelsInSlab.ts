import type { BoundsIJK, Point2, Point3 } from '../../types';
import type { IndexSpaceSlab, VolumeGeometry } from './indexSpaceSlab';
import {
  buildIndexSpaceSlab,
  getDepthRun,
  getSlabAxisBound,
} from './indexSpaceSlab';
import { signedDistanceToPlane } from './slabMembership';

/**
 * One voxel visited by {@link iterateVoxelsInSlab}.
 *
 * The arrays are **reused between iterations** so that iterating a large ROI
 * does not allocate three arrays per voxel. Copy anything you intend to retain.
 * `iterateVoxelsInSlab` is a generator, so a consumer that reads the fields and
 * moves on - which is what a statistics accumulator does - never notices.
 */
export interface VoxelSlabVisit {
  /** Voxel index. Reused; copy to retain. */
  ijk: Point3;
  /** Voxel centre in world coordinates. Reused; copy to retain. */
  center: Point3;
  /** Signed distance from the annotation plane along the normal. */
  depth: number;
}

/**
 * Yields inclusive `[min, max]` runs along the slab's column axis that the
 * annotation's 2D shape covers, for one (outer, row) position. Yielding nothing
 * means the shape does not reach this row.
 *
 * Runs may be exact, exact-multiple or an approximate superset paired with
 * `isInShape`. See
 * `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 */
export type ShapeRunProvider = (
  outerIndex: number,
  rowIndex: number,
  depthRun: Point2,
  slab: IndexSpaceSlab
) => Iterable<Point2>;

export interface VoxelSlabIterationOptions {
  /** Geometry of the volume being measured. */
  volume: VolumeGeometry;
  /** `P0`, the annotation plane anchor, in world coordinates. */
  planePoint: Point3;
  /** `n`, the annotation view plane normal. Must be unit length. */
  normal: Point3;
  /**
   * `T` in mm. Omit, or pass null or 0, to default to one voxel along the
   * normal. A planar shape reports 0 from `getRequiredThickness`, so a caller
   * can pass that value straight through.
   */
  annotationThickness?: number | null;
  /**
   * Inclusive index bounds to confine iteration to. Defaults to the whole
   * volume. Supply the annotation's own index-space bounding box when you have
   * one; the slab bound tightening below only narrows along the normal.
   *
   * Bounds only narrow: each axis intersects the volume extent, so a box that
   * reaches outside the volume still yields no index outside it.
   */
  bounds?: BoundsIJK;
  /** Exact or exact-multiple in-plane runs. See {@link ShapeRunProvider}. */
  getShapeRuns?: ShapeRunProvider;
  /**
   * Per-voxel in-plane predicate. Required when `getShapeRuns` is absent or
   * only approximate. Receives the voxel centre in world coordinates; project
   * it onto the annotation plane yourself if the shape needs that.
   */
  isInShape?: (center: Point3, ijk: Point3) => boolean;
  /** Force which axis carries the runs. See `buildIndexSpaceSlab`. */
  columnAxis?: 0 | 1 | 2;
}

/**
 * Iterates the voxels of an area annotation according to Rule M of
 * https://github.com/cornerstonejs/cornerstone3D/issues/2889
 *
 * A voxel is visited exactly when its centre lies within `(T + T_v) / 2` of the
 * annotation plane along the normal, and its projection onto that plane falls
 * inside the annotation's 2D shape. Every qualifying voxel is visited exactly
 * once, and iteration is independent of zoom, canvas size and any other display
 * property.
 *
 * The depth half of the rule is solved in closed form rather than tested per
 * voxel: see {@link IndexSpaceSlab}. Cost is therefore proportional to the
 * number of voxels emitted plus the number of rows touched, not to the volume
 * of any bounding box.
 */
export function* iterateVoxelsInSlab(
  options: VoxelSlabIterationOptions
): Generator<VoxelSlabVisit, void, undefined> {
  const {
    volume,
    planePoint,
    normal,
    annotationThickness,
    getShapeRuns,
    isInShape,
    columnAxis: forcedColumnAxis,
  } = options;

  const { dimensions, direction, spacing, origin } = volume;

  const slab = buildIndexSpaceSlab(
    volume,
    planePoint,
    normal,
    annotationThickness,
    { columnAxis: forcedColumnAxis }
  );
  const { outerAxis, rowAxis, columnAxis } = slab;

  const volumeBounds = [0, 1, 2].map((axis) => [
    0,
    dimensions[axis] - 1,
  ]) as BoundsIJK;

  // Intersect, do not substitute: an index past the volume reads the wrong
  // voxel, and a box derived from world coordinates can reach past it.
  const requestedBounds = options.bounds;
  const bounds: BoundsIJK = requestedBounds
    ? ([0, 1, 2].map((axis) => [
        Math.max(requestedBounds[axis][0], volumeBounds[axis][0]),
        Math.min(requestedBounds[axis][1], volumeBounds[axis][1]),
      ]) as BoundsIJK)
    : volumeBounds;

  // An empty bound on any axis selects nothing.
  if (bounds.some(([min, max]) => min > max)) {
    return;
  }

  // World displacement per unit step of each index.
  const axisStep: Point3[] = [0, 1, 2].map((axis) => {
    const unit = direction.slice(axis * 3, axis * 3 + 3);
    return [
      unit[0] * spacing[axis],
      unit[1] * spacing[axis],
      unit[2] * spacing[axis],
    ] as Point3;
  });

  const outerRange = getSlabAxisBound(slab, outerAxis, bounds);
  if (!outerRange) {
    return;
  }

  const ijk: Point3 = [0, 0, 0];
  const center: Point3 = [0, 0, 0];
  const visit: VoxelSlabVisit = { ijk, center, depth: 0 };

  const columnStep = axisStep[columnAxis];

  for (let outer = outerRange[0]; outer <= outerRange[1]; outer++) {
    const rowRange = getSlabAxisBound(slab, rowAxis, bounds, {
      axis: outerAxis,
      index: outer,
    });
    if (!rowRange) {
      continue;
    }

    const outerStep = axisStep[outerAxis];
    const rowStep = axisStep[rowAxis];

    for (let row = rowRange[0]; row <= rowRange[1]; row++) {
      const depthRun = getDepthRun(slab, outer, row, bounds[columnAxis]);
      if (!depthRun) {
        continue;
      }

      const shapeRuns = getShapeRuns
        ? getShapeRuns(outer, row, depthRun, slab)
        : [depthRun];

      ijk[outerAxis] = outer;
      ijk[rowAxis] = row;

      for (const shapeRun of shapeRuns) {
        const runMin = Math.max(shapeRun[0], depthRun[0]);
        const runMax = Math.min(shapeRun[1], depthRun[1]);
        if (runMin > runMax) {
          continue;
        }

        // Start-plus-delta: a run is a straight line in world space, so the
        // centre advances by one vector add per step rather than a matrix
        // multiply per voxel.
        for (let axis = 0; axis < 3; axis++) {
          center[axis] =
            origin[axis] +
            outer * outerStep[axis] +
            row * rowStep[axis] +
            runMin * columnStep[axis];
        }

        for (let column = runMin; column <= runMax; column++) {
          ijk[columnAxis] = column;

          if (!isInShape || isInShape(center, ijk)) {
            visit.depth = signedDistanceToPlane(center, planePoint, normal);
            yield visit;
          }

          center[0] += columnStep[0];
          center[1] += columnStep[1];
          center[2] += columnStep[2];
        }
      }
    }
  }
}

/**
 * Collects the voxel indices {@link iterateVoxelsInSlab} would visit.
 *
 * Copies each index, unlike the generator, so the result is safe to retain.
 * Intended for tests and for callers that genuinely need the whole list;
 * prefer the generator when accumulating statistics.
 */
export function collectVoxelsInSlab(
  options: VoxelSlabIterationOptions
): Point3[] {
  const collected: Point3[] = [];
  for (const { ijk } of iterateVoxelsInSlab(options)) {
    collected.push([ijk[0], ijk[1], ijk[2]]);
  }
  return collected;
}
