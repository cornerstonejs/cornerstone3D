import { glMatrix, vec3 } from 'gl-matrix';
import { ContourAnnotation } from '../../types/ContourAnnotation';

/**
 * Check if two contour segmentation annotations are coplanar.
 *
 * A plane may be represented by a normal and a distance then to know if they
 * are coplanar we need to:
 *   - check if the normals of the two annotations are pointing to the same
 *   direction or to opposite directions (dot product equal to 1 or -1
 *   respectively)
 *   - Get one point from each polyline and project it onto the normal to get
 *   the distance from the origin (0, 0, 0).
 */
export default function areCoplanarContours(
  firstAnnotation: ContourAnnotation,
  secondAnnotation: ContourAnnotation
) {
  const { viewPlaneNormal: firstViewPlaneNormal } = firstAnnotation.metadata;
  const { viewPlaneNormal: secondViewPlaneNormal } = secondAnnotation.metadata;
  const dot = vec3.dot(firstViewPlaneNormal, secondViewPlaneNormal);
  const parallelPlanes = glMatrix.equals(1, Math.abs(dot));

  if (!parallelPlanes) {
    return false;
  }

  const { polyline: firstPolyline } = firstAnnotation.data.contour;
  const { polyline: secondPolyline } = secondAnnotation.data.contour;

  // Choose one of the normals and calculate the distance of a point from each
  // polyline along that normal. Both normal cannot be used with absolute dot
  // product values because one of the view planes may be flipped or one of the
  // points may be at the same distance but in the opposite direction
  const firstDistance = vec3.dot(firstViewPlaneNormal, firstPolyline[0]);
  const secondDistance = vec3.dot(firstViewPlaneNormal, secondPolyline[0]);

  return glMatrix.equals(firstDistance, secondDistance);
}
