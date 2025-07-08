import type { Point3, ViewReference } from '../types';
import { isEqual } from '../utilities/isEqual';
import { vec3 } from 'gl-matrix';

/** Updates the referencedPlane inside the view reference */
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
      for (let i = Math.floor(n / 3); i < n; i++) {
        const testVector = vec3.sub(vec3.create(), points[i], points[0]);
        const length = vec3.length(testVector);
        if (isEqual(length, 0)) {
          continue;
        }
        if (
          vec3.dot(testVector, referencedPlane.inPlaneVector1) <
          length * 0.95
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
