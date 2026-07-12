import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import getViewportICamera from '../getViewportICamera';
import type { Plane } from './types';

const MIN_NORMAL_LENGTH = 1e-10;

function isFinitePoint3(point: Types.Point3 | undefined): boolean {
  return (
    Array.isArray(point) &&
    point.length === 3 &&
    point.every((v) => Number.isFinite(v))
  );
}

/**
 * Returns the slice plane currently displayed by a viewport, defined by the
 * camera view-plane normal and focal point. The returned normal is normalized.
 *
 * Returns null when the viewport has no valid camera (e.g. non-image
 * viewports, or viewports that have not been rendered yet).
 */
export default function getViewportPlane(
  viewport: Types.IViewport
): Plane | null {
  if (!viewport) {
    return null;
  }

  let camera;
  try {
    camera = getViewportICamera(viewport);
  } catch {
    return null;
  }

  const viewPlaneNormal = camera?.viewPlaneNormal as Types.Point3 | undefined;
  const focalPoint = camera?.focalPoint as Types.Point3 | undefined;

  if (!isFinitePoint3(viewPlaneNormal) || !isFinitePoint3(focalPoint)) {
    return null;
  }

  if (vec3.length(viewPlaneNormal) < MIN_NORMAL_LENGTH) {
    return null;
  }

  const normal = vec3.normalize(vec3.create(), viewPlaneNormal);

  return {
    normal: [normal[0], normal[1], normal[2]],
    point: [focalPoint[0], focalPoint[1], focalPoint[2]],
  };
}
