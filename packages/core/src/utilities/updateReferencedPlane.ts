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
 * Updates the referencedPlane(s) inside the view reference
 * There are two degenerate cases, a single point, which means any plane
 * passing through that point, and a colinear set of points, such as
 * a length tool, which means any plane passing through both points.
 * Otherwise will find two vectors inside the plane to use to represent
 * that, where the dot product with valid normals is zero.
 * That is,
 * dot(viewPlaneNormal, in frame vector) === 0 for view plane normals in the
 *    correct orientation to see the plane.
 */
export function updateReferencedPlane(
  points: Point3[],
  reference: ViewReference
) {
  if (!points?.length || !reference.FrameOfReferenceUID) {
    return;
  }
  reference.referencedPlane ||= {
    FrameOfReferenceUID: reference.FrameOfReferenceUID,
    point: points[0],
    inPlaneVector1: null,
    inPlaneVector2: null,
  };
  const { referencedPlane } = reference;

  if (points.length === 1) {
    referencedPlane.inPlaneVector1 = null;
    referencedPlane.inPlaneVector2 = null;
  } else {
    referencedPlane.inPlaneVector1 = <Point3>(
      vec3.sub(vec3.create(), points[0], points[Math.floor(points.length / 2)])
    );
    vec3.normalize(
      referencedPlane.inPlaneVector1,
      referencedPlane.inPlaneVector1
    );
    referencedPlane.inPlaneVector2 = null;
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
          vec3.dot(testVector, referencedPlane.inPlaneVector1) <
          length * ORTHOGONAL_TEST_VALUE
        ) {
          referencedPlane.inPlaneVector2 = <Point3>(
            vec3.normalize(testVector, testVector)
          );
          return referencedPlane;
        }
      }
    }
  }
  return referencedPlane;
}
