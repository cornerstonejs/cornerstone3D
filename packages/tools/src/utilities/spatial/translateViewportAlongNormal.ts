import { vec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import getViewportICamera from '../getViewportICamera';
import { jumpToFocalPoint } from '../genericViewportToolHelpers';

/**
 * Moves a viewport camera (position and focal point) along its view-plane
 * normal by the given signed distance in world units. Pan, zoom and
 * orientation are untouched.
 *
 * Native (generic) viewports have no free camera write; they are navigated by
 * view reference instead, which snaps to the nearest slice.
 *
 * Returns true when the camera was moved.
 */
export default function translateViewportAlongNormal(
  viewport: Types.IViewport,
  distance: number
): boolean {
  if (!viewport || !Number.isFinite(distance) || distance === 0) {
    return false;
  }

  const { viewPlaneNormal, focalPoint, position } =
    getViewportICamera(viewport);

  if (!viewPlaneNormal || !focalPoint || !position) {
    return false;
  }

  const newFocalPoint = vec3.scaleAndAdd(
    vec3.create(),
    focalPoint,
    viewPlaneNormal,
    distance
  );
  const newPosition = vec3.scaleAndAdd(
    vec3.create(),
    position,
    viewPlaneNormal,
    distance
  );

  if (csUtils.isGenericViewport(viewport)) {
    jumpToFocalPoint(viewport, [
      newFocalPoint[0],
      newFocalPoint[1],
      newFocalPoint[2],
    ]);
    return true;
  }

  viewport.setCamera({
    focalPoint: [newFocalPoint[0], newFocalPoint[1], newFocalPoint[2]],
    position: [newPosition[0], newPosition[1], newPosition[2]],
  });

  return true;
}
