import type { Point3, ViewReference, ViewReferenceSpecifier } from '../types';
import { isEqual } from '../utilities/isEqual';
import { vec3 } from 'gl-matrix';

/**
 * The largest collinearity that a candidate vector can have with
 * `inPlaneVector1` and still become `inPlaneVector2`.
 *
 * The code measures the collinearity as `|cos(angle)|` between the two
 * vectors. A value of 0 is a right angle, and a value of 1 is a parallel pair
 * or an anti-parallel pair. The code keeps the most orthogonal candidate of
 * all the points, so this value is only a floor. The floor rejects a polyline
 * that offers no candidate more than 2.6 degrees away from collinear, because
 * such a candidate pins almost no orientation.
 */
const ORTHOGONAL_TEST_VALUE = 0.999;

/**
 * Updates the planeRestriction(s) inside the view reference
 * This will create a reference containing a point and up to two non-collinear
 * in-plane vectors, selected from the set of points provided.
 *
 * This type of reference restricts the allowed camera views to those
 * which contain the point, and whose view plane normal is orthogonal to the in
 * plane vectors.
 *
 * A plane restriction states which views are COMPATIBLE with the data. A
 * plane restriction does not restore a view, so the function never records
 * more orientation than the points themselves give. The number of points sets
 * how much the restriction can say:
 *
 * - one point gives a position and no orientation, so the restriction holds no
 *   in-plane vector, and every plane through the point is compatible;
 * - two points give one direction, so the restriction holds `inPlaneVector1`
 *   only, and every plane that contains that direction is compatible;
 * - three or more points pin a plane, so the restriction can hold both
 *   vectors. The camera supplies an exact pair from its cross products, and
 *   that pair describes the same plane, so the function keeps an existing pair
 *   in this case.
 *
 * `reference.viewUp` and `reference.viewPlaneNormal` restore a view. See the
 * `PlaneRestriction` type for the split between the two jobs.
 *
 * @param points - the points that the reference must contain. The function
 * reads this argument, and NOT `viewRefSpecifier.points`.
 * @param reference - the view reference, and NOT `reference.planeRestriction`.
 * This function does `reference.planeRestriction ||= ...`, so it needs the
 * outer object. A `PlaneRestriction` also structurally satisfies the
 * all-optional `ViewReference`, so a call that passes the inner object type
 * checks, but then builds and mutates a nested
 * `planeRestriction.planeRestriction`, and silently discards the
 * point-derived in-plane vectors.
 * @param viewRefSpecifier - the options that the caller used to ask for the
 * reference. The function reads `forceInPlaneVectors`.
 */
export function updatePlaneRestriction(
  points: Point3[],
  reference: ViewReference,
  viewRefSpecifier: ViewReferenceSpecifier = {}
) {
  if (!points?.length || !reference.FrameOfReferenceUID) {
    return;
  }
  reference.planeRestriction ||= {
    FrameOfReferenceUID: reference.FrameOfReferenceUID,
    point: points[0],
    inPlaneVector1: null,
    inPlaneVector2: null,
  };
  const { planeRestriction } = reference;
  const n = points.length;

  updateReferencePoint(reference, points[0]);

  if (n === 1) {
    // One point gives no direction. A camera pair here would claim a
    // compatibility limit that the data does not support, and would stop a
    // viewport of another orientation from showing the point.
    planeRestriction.inPlaneVector1 = null;
    planeRestriction.inPlaneVector2 = null;
    return planeRestriction;
  }

  if (n === 2) {
    // Two points give the direction between them, and nothing more.
    const between = vec3.sub(vec3.create(), points[0], points[1]);
    vec3.normalize(between, between);
    planeRestriction.inPlaneVector1 = <Point3>between;
    planeRestriction.inPlaneVector2 = null;
    return planeRestriction;
  }

  // The restriction already pins the plane. Do no work on the points.
  if (
    planeRestriction.inPlaneVector1 &&
    planeRestriction.inPlaneVector2 &&
    !viewRefSpecifier.forceInPlaneVectors
  ) {
    return planeRestriction;
  }

  const v1 = vec3.sub(vec3.create(), points[0], points[Math.floor(n / 2)]);
  vec3.normalize(v1, v1);
  planeRestriction.inPlaneVector1 = <Point3>v1;

  // Find the candidate that is the most orthogonal to the first vector, to
  // form a plane specifier. The most orthogonal candidate gives the most
  // accurate plane. The first candidate that clears the floor can sit far from
  // a right angle, so the code compares every candidate.
  //
  // One scratch vector serves the whole scan. The code allocates only when it
  // finds a better candidate, so a long polyline does not allocate for each
  // point.
  const candidate = vec3.create();
  let bestVector: Point3 = null;
  let bestCollinearity = ORTHOGONAL_TEST_VALUE;

  for (let i = Math.floor(n / 3); i < n; i++) {
    vec3.sub(candidate, points[i], points[0]);
    const length = vec3.length(candidate);
    if (isEqual(length, 0)) {
      continue;
    }
    // Math.abs matters: an anti-parallel candidate has a dot product of about
    // -length, which passes an unsigned comparison while being just as
    // collinear with inPlaneVector1 as a parallel one. Without the abs, a
    // symmetric polyline that doubles back on itself yields a second "in-plane
    // vector" that pins no orientation at all.
    const collinearity =
      Math.abs(vec3.dot(candidate, planeRestriction.inPlaneVector1)) / length;
    if (collinearity < bestCollinearity) {
      bestCollinearity = collinearity;
      // Scale by 1 / length instead of normalize, which repeats the square
      // root that vec3.length already took.
      bestVector = <Point3>vec3.scale(vec3.create(), candidate, 1 / length);
    }
  }

  if (bestVector) {
    planeRestriction.inPlaneVector2 = bestVector;
  }

  return planeRestriction;
}

/**
 * Moves the restriction point of the reference to `point`, and moves the focal
 * point of the reference to the plane of `point`.
 *
 * A caller can call `updatePlaneRestriction` again on a reference that already
 * exists, for example after the user moves a single point annotation. The
 * reference then holds two descriptions of one plane: `planeRestriction.point`
 * and `cameraFocalPoint`. `setViewReference` reads `cameraFocalPoint`, so the
 * two descriptions must agree. If only the restriction point moves, the
 * viewport goes to the old slice.
 *
 * The new focal point keeps the in-plane part of the old focal point, and it
 * takes the depth of `point` along the view plane normal. The pan of the view
 * does not change, and only the slice changes. The function assumes that
 * `viewPlaneNormal` is a unit vector, as the rest of the rendering code does.
 *
 * @param reference - the view reference. The function updates
 * `reference.planeRestriction.point`, and it updates
 * `reference.cameraFocalPoint`.
 * @param point - the new restriction point.
 */
function updateReferencePoint(reference: ViewReference, point: Point3) {
  const { planeRestriction, cameraFocalPoint, viewPlaneNormal } = reference;

  if (isEqual(planeRestriction.point, point)) {
    return;
  }
  planeRestriction.point = point;

  if (!cameraFocalPoint || !viewPlaneNormal) {
    return;
  }
  const focalToPoint = vec3.sub(vec3.create(), point, cameraFocalPoint);
  const depth = vec3.dot(focalToPoint, viewPlaneNormal);
  reference.cameraFocalPoint = <Point3>(
    vec3.scaleAndAdd(vec3.create(), cameraFocalPoint, viewPlaneNormal, depth)
  );
}
