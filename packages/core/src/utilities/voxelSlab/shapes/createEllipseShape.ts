import { vec3 } from 'gl-matrix';
import type { Point2, Point3 } from '../../../types';
import type { IndexSpaceSlab, VolumeGeometry } from '../indexSpaceSlab';
import getVoxelThicknessAlongNormal from '../getVoxelThicknessAlongNormal';
import { projectPointOntoPlane } from '../slabMembership';
import type { PlaneBasis, VoxelSlabShape } from './shapeGeometry';
import {
  createColumnLineResolver,
  createPlaneBasis,
  SHAPE_BOUNDARY_EPSILON,
  solveQuadraticLeqZero,
  toIntegerRun,
} from './shapeGeometry';

/**
 * The squared-radius threshold, expanded so a voxel centre lying exactly on the
 * outline is inside it. See SHAPE_BOUNDARY_EPSILON.
 */
const UNIT_BOUNDARY = 1 + SHAPE_BOUNDARY_EPSILON;

export interface EllipseShapeOptions {
  /** Geometry of the volume being measured. */
  volume: VolumeGeometry;
  /** `P0`, the annotation plane anchor. Defines the plane's depth. */
  planePoint: Point3;
  /** `n`, the annotation view plane normal. Unit length. */
  normal: Point3;
  /**
   * The ellipse centre in world coordinates. For the planar form it is
   * projected onto the annotation plane, so a centre carrying a little depth
   * error is harmless.
   */
  center: Point3;
  /**
   * Direction of the major axis. Need not be unit length, and need not already
   * lie in the plane - its component along the normal is removed.
   */
  majorAxis: Point3;
  /** Semi-axis along `majorAxis`, in mm. */
  majorRadius: number;
  /** Semi-axis perpendicular to `majorAxis` within the plane, in mm. */
  minorRadius: number;
  /**
   * Semi-axis along the normal, in mm. Omit for a flat ellipse lying in the
   * plane; supply it for a triaxial ellipsoid - an "egg" reaching out of the
   * plane on both sides.
   */
  depthRadius?: number;
}

/**
 * An ellipse lying in the annotation plane, or an ellipsoid centred on it.
 *
 * Both forms are specified identically - a major-axis direction plus radii -
 * with the third radius promoting the flat ellipse to a solid. That is also how
 * `createRectangleShape` is specified, so the two can be swapped freely.
 *
 * ## Why the runs are exact
 *
 * For a fixed outer and row index, the voxel centre traces a straight line in
 * the column index, and so does its projection onto the plane. Substituting a
 * line into the ellipse's quadratic form gives a quadratic in the column index,
 * whose real roots bound exactly one interval. No voxel is ever tested.
 *
 * ## Depth and the slab
 *
 * The in-plane radii are used as given: a voxel counts when its *centre* falls
 * inside the outline, which is the usual convention and keeps the perimeter
 * consistent with other viewers.
 *
 * The depth radius is dilated by half a voxel thickness, mirroring Rule M's
 * `T_v` term, so a voxel counts when the voxel *itself* reaches the ellipsoid.
 * Without that an ellipsoid thinner than a voxel, or one whose surface falls
 * between voxel centres, could select nothing at all.
 *
 * Remember the shape is intersected with Rule M's slab, not unioned with it.
 * Pass `getRequiredThickness()` as the iterator's `annotationThickness` unless
 * you deliberately want the slab to clip the shape.
 */
export function createEllipseShape(
  options: EllipseShapeOptions
): VoxelSlabShape {
  const {
    volume,
    planePoint,
    normal,
    majorAxis,
    majorRadius,
    minorRadius,
    depthRadius,
  } = options;

  if (!(majorRadius > 0) || !(minorRadius > 0)) {
    throw new Error('Ellipse radii must be positive');
  }
  if (depthRadius !== undefined && !(depthRadius > 0)) {
    throw new Error('Ellipse depthRadius must be positive when supplied');
  }

  const basis: PlaneBasis = createPlaneBasis(normal, majorAxis);
  const isSolid = depthRadius !== undefined;

  const voxelThickness = getVoxelThicknessAlongNormal(volume, basis.n);
  const depthSemiAxis = isSolid
    ? (depthRadius as number) + voxelThickness / 2
    : 0;

  // A flat ellipse is tested on the projected point, so its centre only
  // matters within the plane.
  const center = isSolid
    ? ([...options.center] as Point3)
    : projectPointOntoPlane(options.center, planePoint, basis.n);

  // Each entry scales a world offset into the unit sphere's space.
  const scaledAxes: { axis: Point3; inverseRadius: number }[] = [
    { axis: basis.u, inverseRadius: 1 / majorRadius },
    { axis: basis.v, inverseRadius: 1 / minorRadius },
  ];
  if (isSolid) {
    scaledAxes.push({ axis: basis.n, inverseRadius: 1 / depthSemiAxis });
  }

  const resolveColumnLine = createColumnLineResolver(volume, basis.n);

  function containsPoint(point: Point3): boolean {
    const tested = isSolid
      ? point
      : projectPointOntoPlane(point, planePoint, basis.n);

    let total = 0;
    for (const { axis, inverseRadius } of scaledAxes) {
      const offset =
        (tested[0] - center[0]) * axis[0] +
        (tested[1] - center[1]) * axis[1] +
        (tested[2] - center[2]) * axis[2];
      const scaled = offset * inverseRadius;
      total += scaled * scaled;
    }
    return total <= UNIT_BOUNDARY;
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

    // |scale(base + col * step - center)|^2 <= 1 expands to a quadratic in col.
    let a = 0;
    let b = 0;
    let c = -UNIT_BOUNDARY;

    for (const { axis, inverseRadius } of scaledAxes) {
      const offset =
        ((lineBase[0] - center[0]) * axis[0] +
          (lineBase[1] - center[1]) * axis[1] +
          (lineBase[2] - center[2]) * axis[2]) *
        inverseRadius;
      const slope =
        (lineStep[0] * axis[0] +
          lineStep[1] * axis[1] +
          lineStep[2] * axis[2]) *
        inverseRadius;

      a += slope * slope;
      b += 2 * offset * slope;
      c += offset * offset;
    }

    const run = toIntegerRun(solveQuadraticLeqZero(a, b, c));
    if (run) {
      yield run;
    }
  }

  return {
    containsPoint,
    getRuns,
    getRequiredThickness: () => (isSolid ? depthSemiAxis * 2 : 0),
  };
}

/**
 * A circle in the annotation plane, or a sphere centred on it.
 *
 * A convenience wrapper: a circle is an ellipse with equal radii, and any
 * in-plane direction will do for the major axis.
 */
export function createCircleShape(options: {
  volume: VolumeGeometry;
  planePoint: Point3;
  normal: Point3;
  center: Point3;
  radius: number;
  /** Supply to make it a sphere rather than a flat disc. */
  depthRadius?: number;
}): VoxelSlabShape {
  const { normal } = options;

  // Any vector not parallel to the normal gives a valid in-plane direction.
  const candidate: Point3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const majorAxis = vec3.cross(
    vec3.create(),
    normal as vec3,
    candidate as vec3
  ) as Point3;

  return createEllipseShape({
    volume: options.volume,
    planePoint: options.planePoint,
    normal,
    center: options.center,
    majorAxis,
    majorRadius: options.radius,
    minorRadius: options.radius,
    depthRadius: options.depthRadius,
  });
}
