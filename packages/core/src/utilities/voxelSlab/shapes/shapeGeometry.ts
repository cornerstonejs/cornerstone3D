import { vec3 } from 'gl-matrix';
import type { Point2, Point3 } from '../../../types';
import type { IndexSpaceSlab, VolumeGeometry } from '../indexSpaceSlab';

/**
 * A plane-anchored shape that can drive {@link iterateVoxelsInSlab}.
 *
 * Every shape exposes the same pair:
 *
 * - `containsPoint` is the *definition*. It answers, for one world point,
 *   whether the shape contains it. Slow but obviously correct.
 * - `getRuns` is the *optimisation*. It emits exact inclusive integer runs
 *   along the slab's column axis, computed in closed form.
 *
 * The two must always select the same voxels. That is the same relationship the
 * brute-force reference implementation has with the iterator itself, and it is
 * how these shapes are tested: run the iterator once with `isInShape:
 * shape.containsPoint` and once with `getShapeRuns: shape.getRuns`, and require
 * identical output.
 *
 * Boundaries are **inclusive**: a voxel centre lying exactly on the shape
 * boundary is inside it.
 */
export interface VoxelSlabShape {
  /** The definition. Does the shape contain this world point? */
  containsPoint(point: Point3): boolean;

  /**
   * The optimisation. Exact inclusive runs along `slab.columnAxis`.
   *
   * Signature matches `ShapeRunProvider`, so it can be handed straight to
   * `iterateVoxelsInSlab` as `getShapeRuns`.
   */
  getRuns(
    outerIndex: number,
    rowIndex: number,
    depthRun: Point2,
    slab: IndexSpaceSlab
  ): Iterable<Point2>;

  /**
   * The smallest annotation thickness `T` for which Rule M's slab contains the
   * whole shape.
   *
   * Planar shapes return 0: they have no extent along the normal, so any `T`
   * works and the caller picks it to suit the measurement. Shapes with depth
   * return that depth, and passing anything smaller as `annotationThickness`
   * will clip them - the slab and the shape are intersected, not unioned.
   */
  getRequiredThickness(): number;
}

/**
 * An orthonormal frame for a plane: `u` and `v` span it, `n` is the normal.
 */
export interface PlaneBasis {
  u: Point3;
  v: Point3;
  n: Point3;
}

/**
 * Builds an orthonormal in-plane frame from a normal and an orientation vector.
 *
 * `orientation` gives the direction of the shape's major axis. It need not be
 * unit length, and it need not already lie in the plane - its component along
 * the normal is removed. This is what lets a caller pass, say, an ellipse's
 * major-axis handle direction directly.
 *
 * @throws if `orientation` is parallel to the normal, since it then defines no
 *   in-plane direction at all.
 */
export function createPlaneBasis(
  normal: Point3,
  orientation: Point3
): PlaneBasis {
  const n = vec3.normalize(vec3.create(), normal as vec3) as Point3;

  const along = vec3.dot(orientation as vec3, n as vec3);
  const u = vec3.sub(
    vec3.create(),
    orientation as vec3,
    vec3.scale(vec3.create(), n as vec3, along)
  );

  const uLength = vec3.length(u);
  if (!(uLength > 1e-12)) {
    throw new Error(
      'Shape orientation vector is parallel to the plane normal, so it defines no in-plane direction'
    );
  }
  vec3.scale(u, u, 1 / uLength);

  const v = vec3.cross(vec3.create(), n as vec3, u) as Point3;

  return { u: u as Point3, v, n };
}

/**
 * The world displacement per unit step of each voxel index.
 */
export function getAxisSteps(volume: VolumeGeometry): [Point3, Point3, Point3] {
  const { direction, spacing } = volume;
  return [0, 1, 2].map((axis) => {
    const unit = direction.slice(axis * 3, axis * 3 + 3);
    return [
      unit[0] * spacing[axis],
      unit[1] * spacing[axis],
      unit[2] * spacing[axis],
    ] as Point3;
  }) as [Point3, Point3, Point3];
}

/**
 * The line, parameterised by column index, that a run of voxel centres traces.
 *
 * For fixed positions on the outer and row axes, the voxel centre is
 *
 * ```
 *   centre(col) = base + col * step
 * ```
 *
 * and its projection along the normal onto the annotation plane is
 *
 * ```
 *   projected(col) = projectedBase + col * projectedStep
 *   projectedStep  = step - g[columnAxis] * n
 * ```
 *
 * because `depth(col) = baseDepth + col * g[columnAxis]` is itself linear. Both
 * are straight lines, which is what reduces every shape test to a
 * one-dimensional intersection in `col`.
 */
export interface ColumnLine {
  /** Voxel centre at column 0. */
  base: Point3;
  /** Voxel centre displacement per column step. */
  step: Point3;
  /** Projected point at column 0. */
  projectedBase: Point3;
  /** Projected point displacement per column step. */
  projectedStep: Point3;
}

/**
 * Creates a reusable resolver for the column line of a given volume and plane.
 *
 * The step vectors depend only on the volume and the slab, so they are computed
 * once per slab; only the bases change as the outer and row indices advance.
 * The returned `ColumnLine` is reused between calls - copy anything retained.
 */
export function createColumnLineResolver(
  volume: VolumeGeometry,
  normal: Point3
) {
  const axisSteps = getAxisSteps(volume);
  const { origin } = volume;

  const line: ColumnLine = {
    base: [0, 0, 0],
    step: [0, 0, 0],
    projectedBase: [0, 0, 0],
    projectedStep: [0, 0, 0],
  };

  let preparedSlab: IndexSpaceSlab | null = null;

  return function resolve(
    slab: IndexSpaceSlab,
    outerIndex: number,
    rowIndex: number
  ): ColumnLine {
    const { g, c0, outerAxis, rowAxis, columnAxis } = slab;

    if (preparedSlab !== slab) {
      const columnStep = axisSteps[columnAxis];
      const gColumn = g[columnAxis];
      for (let axis = 0; axis < 3; axis++) {
        line.step[axis] = columnStep[axis];
        line.projectedStep[axis] = columnStep[axis] - gColumn * normal[axis];
      }
      preparedSlab = slab;
    }

    const outerStep = axisSteps[outerAxis];
    const rowStep = axisSteps[rowAxis];
    const baseDepth = outerIndex * g[outerAxis] + rowIndex * g[rowAxis] + c0;

    for (let axis = 0; axis < 3; axis++) {
      const base =
        origin[axis] + outerIndex * outerStep[axis] + rowIndex * rowStep[axis];
      line.base[axis] = base;
      line.projectedBase[axis] = base - baseDepth * normal[axis];
    }

    return line;
  };
}

/**
 * Relative slack applied to a shape's boundary, so that a voxel centre lying
 * on the outline is reliably inside it.
 *
 * Without this the two halves of a shape disagree at exact ties. A circle of
 * radius 5 on an integer voxel grid puts centres exactly on its outline at
 * `(5, 0)` and at every Pythagorean point such as `(3, 4)`; `containsPoint`
 * evaluates a sum of squares and may land a hair above 1, while `getRuns`
 * solves for the roots and lands exactly on 5. Expanding the boundary by a
 * relative amount well above float32 error puts both firmly on the same side.
 *
 * Matched to `SLAB_RELATIVE_EPSILON`, and applied only to shape outlines -
 * Rule M's depth test moves in the opposite direction, tightening rather than
 * loosening, because there the neighbouring layer must be excluded.
 */
export const SHAPE_BOUNDARY_EPSILON = 1e-5;

/** An inclusive real interval, possibly unbounded. */
export type RealRange = [number, number];

/** The whole real line. */
export const UNBOUNDED: RealRange = [-Infinity, Infinity];

/** Intersects two inclusive real intervals, or returns null if disjoint. */
export function intersectRanges(
  a: RealRange | null,
  b: RealRange | null
): RealRange | null {
  if (!a || !b) {
    return null;
  }
  const low = Math.max(a[0], b[0]);
  const high = Math.min(a[1], b[1]);
  return low > high ? null : [low, high];
}

/**
 * The `t` satisfying `|a + t * b| <= halfExtent`, as an inclusive interval.
 *
 * Used for every flat-sided constraint: a box face, or the depth slab of a
 * prism.
 */
export function solveAbsLinearLeq(
  a: number,
  b: number,
  halfExtent: number
): RealRange | null {
  if (b === 0) {
    return Math.abs(a) <= halfExtent ? UNBOUNDED : null;
  }
  // The + 0 normalises a negative zero, which would otherwise survive into a
  // run bound and read confusingly.
  const first = (-halfExtent - a) / b + 0;
  const second = (halfExtent - a) / b + 0;
  return first <= second ? [first, second] : [second, first];
}

/**
 * The `t` satisfying `A t^2 + B t + C <= 0`, as an inclusive interval.
 *
 * `A` is a squared length so it is never negative; `A === 0` degenerates to the
 * linear case, which happens when the column step has no component in the
 * shape's scaled space.
 */
export function solveQuadraticLeqZero(
  A: number,
  B: number,
  C: number
): RealRange | null {
  if (A === 0) {
    if (B === 0) {
      return C <= 0 ? UNBOUNDED : null;
    }
    const root = -C / B + 0;
    return B > 0 ? [-Infinity, root] : [root, Infinity];
  }

  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) {
    return null;
  }

  const rootOfDiscriminant = Math.sqrt(discriminant);
  const first = (-B - rootOfDiscriminant) / (2 * A) + 0;
  const second = (-B + rootOfDiscriminant) / (2 * A) + 0;
  return first <= second ? [first, second] : [second, first];
}

/**
 * The inclusive integer run inside a real interval.
 *
 * Boundaries are inclusive, so an endpoint landing exactly on an integer keeps
 * that integer - unlike the depth runs of Rule M, whose endpoints are
 * deliberately exclusive. The difference is intentional: the depth rule's
 * strictness is what makes `T = T_v` select one layer, whereas a voxel centre
 * exactly on a shape's outline is conventionally inside it.
 *
 * Infinite bounds are preserved; the iterator intersects them with the depth
 * run, which is always finite.
 */
export function toIntegerRun(range: RealRange | null): Point2 | null {
  if (!range) {
    return null;
  }
  const low = Math.ceil(range[0]);
  const high = Math.floor(range[1]);
  return low > high ? null : [low, high];
}
