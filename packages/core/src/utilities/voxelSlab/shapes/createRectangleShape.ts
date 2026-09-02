import type { Point2, Point3 } from '../../../types';
import type { IndexSpaceSlab, VolumeGeometry } from '../indexSpaceSlab';
import getVoxelThicknessAlongNormal from '../getVoxelThicknessAlongNormal';
import { projectPointOntoPlane } from '../slabMembership';
import type { PlaneBasis, RealRange, VoxelSlabShape } from './shapeGeometry';
import {
  UNBOUNDED,
  createColumnLineResolver,
  createPlaneBasis,
  SHAPE_BOUNDARY_EPSILON,
  intersectRanges,
  solveAbsLinearLeq,
  toIntegerRun,
} from './shapeGeometry';

/** Expands a half extent so a voxel centre on the face counts as inside. */
const expand = (halfExtent: number) =>
  halfExtent * (1 + SHAPE_BOUNDARY_EPSILON);

export interface RectangleShapeOptions {
  /** Geometry of the volume being measured. */
  volume: VolumeGeometry;
  /** `P0`, the annotation plane anchor. Defines the plane's depth. */
  planePoint: Point3;
  /** `n`, the annotation view plane normal. Unit length. */
  normal: Point3;
  /**
   * The rectangle centre in world coordinates. For the planar form it is
   * projected onto the annotation plane.
   */
  center: Point3;
  /**
   * Direction of the major axis. Need not be unit length, and need not already
   * lie in the plane - its component along the normal is removed.
   */
  majorAxis: Point3;
  /** Half length along `majorAxis`, in mm. */
  majorHalfLength: number;
  /** Half length perpendicular to `majorAxis` within the plane, in mm. */
  minorHalfLength: number;
  /**
   * Half length along the normal, in mm. Omit for a flat rectangle lying in the
   * plane; supply it for a box reaching out of the plane on both sides.
   */
  depthHalfLength?: number;
}

/**
 * A rectangle lying in the annotation plane, or a box centred on it.
 *
 * Specified exactly as `createEllipseShape` is - a major-axis direction plus
 * half extents - so the two are interchangeable, and the third extent promotes
 * the flat rectangle to a solid.
 *
 * ## Why the runs are exact
 *
 * Each face is a linear constraint on the world offset, and for a fixed outer
 * and row index the voxel centre traces a straight line in the column index.
 * Every face therefore contributes one interval in the column index, and the
 * run is their intersection - which is itself a single interval, since a box is
 * convex. No voxel is ever tested.
 *
 * ## Depth and the slab
 *
 * As with the ellipse, the in-plane extents are used as given - a voxel counts
 * when its centre falls inside the outline - while the depth extent is dilated
 * by half a voxel thickness so a voxel counts when the voxel itself reaches the
 * box. With the depth extent dilated, a box is exactly equivalent to Rule M's
 * slab at `T = 2 * depthHalfLength`, which is the point: the two agree rather
 * than fighting.
 *
 * The shape is intersected with the slab, not unioned with it, so pass
 * `getRequiredThickness()` as the iterator's `annotationThickness` unless you
 * deliberately want the slab to clip the shape.
 */
export function createRectangleShape(
  options: RectangleShapeOptions
): VoxelSlabShape {
  const {
    volume,
    planePoint,
    normal,
    majorAxis,
    majorHalfLength,
    minorHalfLength,
    depthHalfLength,
  } = options;

  if (!(majorHalfLength > 0) || !(minorHalfLength > 0)) {
    throw new Error('Rectangle half lengths must be positive');
  }
  if (depthHalfLength !== undefined && !(depthHalfLength > 0)) {
    throw new Error('Rectangle depthHalfLength must be positive when supplied');
  }

  const basis: PlaneBasis = createPlaneBasis(normal, majorAxis);
  const isSolid = depthHalfLength !== undefined;

  const voxelThickness = getVoxelThicknessAlongNormal(volume, basis.n);
  const depthExtent = isSolid
    ? (depthHalfLength as number) + voxelThickness / 2
    : 0;

  const center = isSolid
    ? ([...options.center] as Point3)
    : projectPointOntoPlane(options.center, planePoint, basis.n);

  const constraints: { axis: Point3; halfExtent: number }[] = [
    { axis: basis.u, halfExtent: expand(majorHalfLength) },
    { axis: basis.v, halfExtent: expand(minorHalfLength) },
  ];
  if (isSolid) {
    constraints.push({ axis: basis.n, halfExtent: expand(depthExtent) });
  }

  const resolveColumnLine = createColumnLineResolver(volume, basis.n);

  function containsPoint(point: Point3): boolean {
    const tested = isSolid
      ? point
      : projectPointOntoPlane(point, planePoint, basis.n);

    for (const { axis, halfExtent } of constraints) {
      const offset =
        (tested[0] - center[0]) * axis[0] +
        (tested[1] - center[1]) * axis[1] +
        (tested[2] - center[2]) * axis[2];
      if (Math.abs(offset) > halfExtent) {
        return false;
      }
    }
    return true;
  }

  function* getRuns(
    outerIndex: number,
    rowIndex: number,
    _depthRun: Point2,
    slab: IndexSpaceSlab
  ): Generator<Point2, void, undefined> {
    const line = resolveColumnLine(slab, outerIndex, rowIndex);
    const lineBase = isSolid ? line.base : line.projectedBase;
    const lineStep = isSolid ? line.step : line.projectedStep;

    let range: RealRange | null = UNBOUNDED;

    for (const { axis, halfExtent } of constraints) {
      const offset =
        (lineBase[0] - center[0]) * axis[0] +
        (lineBase[1] - center[1]) * axis[1] +
        (lineBase[2] - center[2]) * axis[2];
      const slope =
        lineStep[0] * axis[0] + lineStep[1] * axis[1] + lineStep[2] * axis[2];

      range = intersectRanges(
        range,
        solveAbsLinearLeq(offset, slope, halfExtent)
      );
      if (!range) {
        return;
      }
    }

    const run = toIntegerRun(range);
    if (run) {
      yield run;
    }
  }

  return {
    containsPoint,
    getRuns,
    getRequiredThickness: () => (isSolid ? depthExtent * 2 : 0),
  };
}
