import type { mat3 } from 'gl-matrix';
import { vec3 } from 'gl-matrix';
import type { BoundsIJK, IImageVolume, Point2, Point3 } from '../../types';
import getVoxelThicknessAlongNormal from './getVoxelThicknessAlongNormal';
import {
  getMembershipHalfWidth,
  getSlabEpsilon,
  resolveAnnotationThickness,
} from './slabMembership';

export type VolumeGeometry =
  | IImageVolume
  | { direction: mat3; spacing: Point3; origin: Point3; dimensions: Point3 };

/**
 * The slab of Rule M expressed in index space.
 *
 * The key property is that the depth test is *exactly linear in the integer
 * voxel indices*. A voxel at index `p` has its centre at `origin + M p` in
 * world space, where `M` is the index-to-world matrix, so
 *
 * ```
 *   depth(p) = (centre - P0) . n = p . g + c0
 *   g  = Mᵀ n      (the index space normal)
 *   c0 = (origin - P0) . n
 * ```
 *
 * `g` and `c0` are constants, so along any single axis the set of voxels
 * satisfying `|depth(p)| < halfWidth` is a closed-form interval. That is what
 * lets the iterator emit exact integer runs rather than testing every voxel,
 * and it holds for every orientation, oblique included.
 *
 * `g` is deliberately not normalised: its components are the change in world
 * depth per unit step of each index, which is exactly what the run arithmetic
 * needs. In acquisition orientation it comes out parallel to (0, 0, 1), since
 * the normal is the k axis so `d0 . n` and `d1 . n` vanish and only
 * `s2 * (d2 . n) = s2` survives.
 *
 * ## Axis roles
 *
 * Iteration is nested outer -> row -> column:
 *
 * - `outerAxis` is `argmax |g|`, the axis whose index step moves depth most.
 *   Sweeping it outermost means each outer step covers a thin band of the
 *   volume, and the two remaining axes are the ones lying closest to the
 *   annotation plane.
 * - `rowAxis` and `columnAxis` are the remaining two, and are the in-plane-ish
 *   pair. A 2D shape's spans are naturally expressed as runs along
 *   `columnAxis` for each `rowAxis` value, which is why the shape constraint
 *   belongs innermost: for each (outer, row) the depth constraint gives one
 *   interval along `columnAxis` and the shape gives one or more, and the
 *   iterator emits their intersection.
 *
 * Note the depth interval along `columnAxis` is frequently unbounded - in
 * acquisition orientation `g[columnAxis]` is zero, so depth does not vary along
 * it at all and the shape is the only binding constraint.
 */
export interface IndexSpaceSlab {
  /** `g`, the unnormalised index space normal. */
  g: Point3;
  /** `c0`, the world depth of index (0, 0, 0). */
  c0: number;
  /** `T_v`, the voxel thickness along the normal. */
  voxelThickness: number;
  /** `T`, the resolved annotation thickness. */
  annotationThickness: number;
  /**
   * The strict half width the depth must fall inside, already tightened by the
   * epsilon. Test `Math.abs(depth) < halfWidth`.
   */
  halfWidth: number;
  /** `argmax |g|`. Swept outermost. */
  outerAxis: 0 | 1 | 2;
  /** Swept in the middle loop. */
  rowAxis: 0 | 1 | 2;
  /** Runs are emitted along this axis, innermost. */
  columnAxis: 0 | 1 | 2;
}

/**
 * Computes `g = Mᵀ n`, the index space normal.
 *
 * Note this is the transpose, not the inverse: a plane with world normal `n`
 * maps to the index space plane `(Mᵀ n) . p = const`. Using `M⁻¹ n` gives the
 * wrong vector as soon as the spacing is anisotropic.
 *
 * The result is parallel to the projected spacing vector whose L2 length
 * `getSpacingInNormalDirection` returns.
 */
export function getIndexSpaceNormal(
  volume: VolumeGeometry,
  normal: Point3
): Point3 {
  const { direction, spacing } = volume;
  const iVector = direction.slice(0, 3) as Point3;
  const jVector = direction.slice(3, 6) as Point3;
  const kVector = direction.slice(6, 9) as Point3;

  return [
    spacing[0] * vec3.dot(iVector, normal as vec3),
    spacing[1] * vec3.dot(jVector, normal as vec3),
    spacing[2] * vec3.dot(kVector, normal as vec3),
  ];
}

/** `argmax |g|`, with ties resolved to the lowest axis for determinism. */
export function pickOuterAxis(g: Point3): 0 | 1 | 2 {
  const magnitudes = [Math.abs(g[0]), Math.abs(g[1]), Math.abs(g[2])];
  let best: 0 | 1 | 2 = 0;
  for (const axis of [1, 2] as const) {
    if (magnitudes[axis] > magnitudes[best]) {
      best = axis;
    }
  }
  return best;
}

/**
 * Builds the index space form of an annotation's slab.
 *
 * @param volume - Geometry of the volume being measured.
 * @param planePoint - `P0`, the annotation plane anchor, in world coordinates.
 * @param normal - `n`, the annotation view plane normal. Must be unit length.
 * @param annotationThickness - `T` in mm, or null/undefined to default to one voxel.
 * @param options.columnAxis - Force which of the two non-outer axes carries the
 *   runs. Defaults to the higher-numbered one, so an acquisition-orientation
 *   volume emits runs along i for each j, matching row-major memory order.
 */
export function buildIndexSpaceSlab(
  volume: VolumeGeometry,
  planePoint: Point3,
  normal: Point3,
  annotationThickness?: number | null,
  options: { columnAxis?: 0 | 1 | 2 } = {}
): IndexSpaceSlab {
  const { origin } = volume;
  const g = getIndexSpaceNormal(volume, normal);

  const voxelThickness = getVoxelThicknessAlongNormal(volume, normal);
  const thickness = resolveAnnotationThickness(
    annotationThickness,
    voxelThickness
  );

  const c0 =
    (origin[0] - planePoint[0]) * normal[0] +
    (origin[1] - planePoint[1]) * normal[1] +
    (origin[2] - planePoint[2]) * normal[2];

  const halfWidth =
    getMembershipHalfWidth(thickness, voxelThickness) -
    getSlabEpsilon(voxelThickness);

  const outerAxis = pickOuterAxis(g);
  const remaining = [0, 1, 2].filter((axis) => axis !== outerAxis) as [
    0 | 1 | 2,
    0 | 1 | 2,
  ];

  let columnAxis = remaining[0];
  let rowAxis = remaining[1];
  if (options.columnAxis !== undefined) {
    if (options.columnAxis === outerAxis) {
      throw new Error(
        `columnAxis ${options.columnAxis} cannot also be the outer axis`
      );
    }
    columnAxis = options.columnAxis;
    rowAxis = remaining[0] === columnAxis ? remaining[1] : remaining[0];
  }

  return {
    g,
    c0,
    voxelThickness,
    annotationThickness: thickness,
    halfWidth,
    outerAxis,
    rowAxis,
    columnAxis,
  };
}

/**
 * The world depth of a voxel index, i.e. its signed distance from the
 * annotation plane along the normal.
 */
export function depthAtIndex(slab: IndexSpaceSlab, ijk: Point3): number {
  const { g, c0 } = slab;
  return ijk[0] * g[0] + ijk[1] * g[1] + ijk[2] * g[2] + c0;
}

/**
 * The integers `x` satisfying `lo < x * coeff < hi`, as an inclusive range.
 *
 * Bounds are open, so an endpoint landing exactly on an integer excludes that
 * integer - which is what makes `T = T_v` select exactly one layer. Returns
 * null when no integer qualifies, and `[-Infinity, Infinity]` when the
 * constraint is vacuous.
 */
function integersWithProductInOpenInterval(
  coeff: number,
  lo: number,
  hi: number
): Point2 | null {
  if (lo >= hi) {
    return null;
  }

  if (coeff === 0) {
    // The product is always 0, so either every integer qualifies or none does.
    return lo < 0 && 0 < hi ? [-Infinity, Infinity] : null;
  }

  const a = lo / coeff;
  const b = hi / coeff;
  const lowExclusive = coeff > 0 ? a : b;
  const highExclusive = coeff > 0 ? b : a;

  const min = Math.floor(lowExclusive) + 1;
  const max = Math.ceil(highExclusive) - 1;

  return min > max ? null : [min, max];
}

/** Intersects an inclusive range with an optional inclusive clamp. */
function clampRange(range: Point2 | null, clampTo?: Point2): Point2 | null {
  if (!range) {
    return null;
  }
  if (!clampTo) {
    return Number.isFinite(range[0]) && Number.isFinite(range[1])
      ? range
      : null;
  }
  const min = Math.max(range[0], clampTo[0]);
  const max = Math.min(range[1], clampTo[1]);
  return min > max ? null : [min, max];
}

/**
 * The inclusive run along `slab.columnAxis` satisfying the depth half of Rule M
 * for a fixed position on the outer and row axes.
 *
 * Exact: every voxel in the returned run passes the depth test and no voxel
 * outside it can. Returns null when the column holds no voxels.
 *
 * @param clampTo - Inclusive bounds along the column axis, normally the volume
 *   dimension. Required whenever depth does not vary along the column axis,
 *   since the run is then unbounded.
 */
export function getDepthRun(
  slab: IndexSpaceSlab,
  outerIndex: number,
  rowIndex: number,
  clampTo?: Point2
): Point2 | null {
  const { g, c0, halfWidth, outerAxis, rowAxis, columnAxis } = slab;

  if (!(halfWidth > 0)) {
    return null;
  }

  const base = outerIndex * g[outerAxis] + rowIndex * g[rowAxis] + c0;

  return clampRange(
    integersWithProductInOpenInterval(
      g[columnAxis],
      -halfWidth - base,
      halfWidth - base
    ),
    clampTo
  );
}

/**
 * The inclusive range along `axis` that could contain any qualifying voxel,
 * given that the other two axes are confined to `bounds`.
 *
 * Used to tighten the outer and row loops so they do not sweep the whole volume
 * for a thin oblique slab. This is a bound rather than an exact answer: an
 * index inside it may still turn out to hold no voxels, but no index outside it
 * can hold any.
 */
export function getSlabAxisBound(
  slab: IndexSpaceSlab,
  axis: 0 | 1 | 2,
  bounds: BoundsIJK,
  fixed?: { axis: 0 | 1 | 2; index: number }
): Point2 | null {
  const { g, c0, halfWidth } = slab;

  if (!(halfWidth > 0)) {
    return null;
  }

  // Slack is the range the free axes can contribute to the depth.
  let slackLow = 0;
  let slackHigh = 0;
  let base = c0;

  for (const other of [0, 1, 2] as const) {
    if (other === axis) {
      continue;
    }
    if (fixed && other === fixed.axis) {
      base += fixed.index * g[other];
      continue;
    }
    const contributions = [
      bounds[other][0] * g[other],
      bounds[other][1] * g[other],
    ];
    slackLow += Math.min(contributions[0], contributions[1]);
    slackHigh += Math.max(contributions[0], contributions[1]);
  }

  // Need |base + x * g[axis] + t| < halfWidth for some t in [slackLow, slackHigh].
  return clampRange(
    integersWithProductInOpenInterval(
      g[axis],
      -halfWidth - slackHigh - base,
      halfWidth - slackLow - base
    ),
    bounds[axis]
  );
}
