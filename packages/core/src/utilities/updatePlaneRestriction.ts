import type { Point3, ViewReference } from '../types';
import { isEqual } from '../utilities/isEqual';
import { vec3 } from 'gl-matrix';

/**
 * A value to compare how orthogonal two vectors are.  As long as the dot
 * product of the previous in-plane vector and the new vector as unit vectors,
 * this vector will be considered for using for testing for orthogonality with
 * view plane normals.
 */
const ORTHOGONAL_TEST_VALUE = 0.95;

/**
 * Updates the planeRestriction(s) inside the view reference
 * This will create a reference containing a point and up to two non-collinear
 * in-plane vectors, selected from the set of points provided.
 *
 * This type of reference restricts the allowed camera views to those
 * which contain the point, and whose view plane normal is orthogonal to the in
 * plane vectors.
 */
export function updatePlaneRestriction(
  points: Point3[],
  reference: ViewReference
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

  if (points.length === 1) {
    planeRestriction.inPlaneVector1 = null;
    planeRestriction.inPlaneVector2 = null;
    return planeRestriction;
  }

  const v1 = vec3.sub(
    vec3.create(),
    points[0],
    points[Math.floor(points.length / 2)]
  );
  vec3.normalize(v1, v1);
  planeRestriction.inPlaneVector1 = <Point3>v1;

  planeRestriction.inPlaneVector2 = null;
  const n = points.length;
  if (n > 2) {
    // Try to find a second vector that isn't colinear with the first one
    // to form a plane specifier.
    for (let i = Math.floor(n / 3); i < n; i++) {
      const testVector = vec3.sub(vec3.create(), points[i], points[0]);
      const length = vec3.length(testVector);
      if (isEqual(length, 0)) {
        continue;
      }
      if (
        vec3.dot(testVector, planeRestriction.inPlaneVector1) <
        length * ORTHOGONAL_TEST_VALUE
      ) {
        vec3.normalize(testVector, testVector);
        planeRestriction.inPlaneVector2 = <Point3>testVector;
        return planeRestriction;
      }
    }
  }

  return planeRestriction;
}
