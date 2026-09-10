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
  /**
   * The volume being measured. Pass an `IImageVolume`, or any object that has
   * `direction`, `spacing`, `origin` and `dimensions`. The structural form
   * lets a caller that holds no cached volume, such as a test, use this code.
   */
  volume: VolumeGeometry;
  /** The annotation plane anchor. Defines the plane's depth. */
  planePoint: Point3;
  /** The annotation view plane normal. Unit length. */
  viewPlaneNormal: Point3;
  /**
   * The ellipse centre in world coordinates. For the planar form it is
   * projected onto the annotation plane, so a centre carrying a little depth
   * error is harmless.
   */
  centerWorld: Point3;
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
 * A third radius promotes the flat ellipse to a solid. `createRectangleShape`
 * takes the same options, so the two are interchangeable. The depth radius is
 * widened by half a voxel; the in-plane radii are not.
 *
 * See `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 */
export function createEllipseShape(
  options: EllipseShapeOptions
): VoxelSlabShape {
  const {
    volume,
    planePoint,
    viewPlaneNormal: normal,
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
    ? ([...options.centerWorld] as Point3)
    : projectPointOntoPlane(options.centerWorld, planePoint, basis.n);

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
  viewPlaneNormal: Point3;
  centerWorld: Point3;
  radius: number;
  /** Supply to make it a sphere rather than a flat disc. */
  depthRadius?: number;
}): VoxelSlabShape {
  const { viewPlaneNormal: normal } = options;

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
    viewPlaneNormal: normal,
    centerWorld: options.centerWorld,
    majorAxis,
    majorRadius: options.radius,
    minorRadius: options.radius,
    depthRadius: options.depthRadius,
  });
}
