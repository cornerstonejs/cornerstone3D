import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import getViewportICamera from '../getViewportICamera';
import { navigatePlanarViewportToPoint } from '../genericViewportToolHelpers';

/**
 * Moves a viewport camera (position and focal point) along its view-plane
 * normal by the given signed distance in world units. Pan, zoom and
 * orientation are untouched.
 *
 * A next viewport has no free camera write; it is navigated by view
 * reference, which snaps to the nearest slice.
 *
 * Returns true when the camera was moved.
 */
export default function translateViewportAlongNormal(
  viewport: Types.IViewport | Types.IGenericViewport,
  distance: number
): boolean {
  if (!viewport || !Number.isFinite(distance) || distance === 0) {
    return false;
  }

  // getViewportICamera can throw for viewports without a valid/rendered
  // camera; guard it the same way getViewportPlane does so a single bad
  // viewport cannot abort a caller iterating over several of them.
  let camera;
  try {
    camera = getViewportICamera(viewport);
  } catch {
    return false;
  }

  const viewPlaneNormal = camera?.viewPlaneNormal;
  const focalPoint = camera?.focalPoint;
  const position = camera?.position;

  if (!viewPlaneNormal || !focalPoint || !position) {
    return false;
  }

  const newFocalPoint = vec3.scaleAndAdd(
    vec3.create(),
    focalPoint,
    viewPlaneNormal,
    distance
  );
  return navigatePlanarViewportToPoint(viewport, [
    newFocalPoint[0],
    newFocalPoint[1],
    newFocalPoint[2],
  ]);
}
