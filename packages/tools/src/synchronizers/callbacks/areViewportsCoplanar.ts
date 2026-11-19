import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import getViewportICamera from '../../utilities/getViewportICamera';

/**
 * The view plane normal of a viewport, from its resolved view.
 */
function getViewPlaneNormal(viewport: Types.IViewport): Types.Point3 {
  return getViewportICamera(viewport).viewPlaneNormal;
}

export default function areViewportsCoplanar(
  viewport1: Types.IViewport,
  viewport2: Types.IViewport
): boolean {
  const viewPlaneNormal1 = getViewPlaneNormal(viewport1);
  const viewPlaneNormal2 = getViewPlaneNormal(viewport2);
  const dotProducts = vec3.dot(viewPlaneNormal1, viewPlaneNormal2);
  return Math.abs(dotProducts) > 0.9;
}
