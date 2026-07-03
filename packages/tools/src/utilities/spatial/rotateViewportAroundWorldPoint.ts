import { mat4, vec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

/**
 * Rotates a viewport camera (position, focal point and viewUp) around a world
 * pivot point by the given angle (radians) about the given axis.
 *
 * The transform is rigid: the camera-to-focal-point distance and the
 * orthogonality of the camera basis are preserved.
 *
 * Native (generic) viewports have no free camera orientation write, so they
 * are left untouched.
 *
 * Returns true when the camera was rotated.
 */
export default function rotateViewportAroundWorldPoint(
  viewport: Types.IViewport,
  pivot: Types.Point3,
  axis: Types.Point3,
  angle: number
): boolean {
  if (!viewport || !pivot || !axis || !Number.isFinite(angle) || angle === 0) {
    return false;
  }

  if (csUtils.isGenericViewport(viewport)) {
    return false;
  }

  const normalizedAxis = vec3.normalize(vec3.create(), axis);
  if (vec3.length(normalizedAxis) < 1e-10) {
    return false;
  }

  const camera = viewport.getCamera?.();
  const { position, focalPoint, viewUp } = camera ?? {};
  if (!position || !focalPoint || !viewUp) {
    return false;
  }

  const transform = mat4.create();
  mat4.translate(transform, transform, pivot);
  mat4.rotate(transform, transform, angle, normalizedAxis);
  mat4.translate(transform, transform, [-pivot[0], -pivot[1], -pivot[2]]);

  const newPosition = vec3.transformMat4(vec3.create(), position, transform);
  const newFocalPoint = vec3.transformMat4(
    vec3.create(),
    focalPoint,
    transform
  );

  // viewUp is a direction: transform the point (position + viewUp) and
  // re-derive the direction relative to the new position.
  const viewUpPoint = vec3.add(vec3.create(), position, viewUp);
  const newViewUpPoint = vec3.transformMat4(
    vec3.create(),
    viewUpPoint,
    transform
  );
  const newViewUp = vec3.subtract(vec3.create(), newViewUpPoint, newPosition);

  viewport.setCamera({
    position: [newPosition[0], newPosition[1], newPosition[2]],
    focalPoint: [newFocalPoint[0], newFocalPoint[1], newFocalPoint[2]],
    viewUp: [newViewUp[0], newViewUp[1], newViewUp[2]],
  });

  return true;
}
