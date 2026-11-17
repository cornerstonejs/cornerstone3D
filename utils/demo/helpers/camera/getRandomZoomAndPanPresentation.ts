import type { PlanarViewport, Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

/**
 * A random zoom and pan for a next planar viewport, as the patch that
 * `viewportProjection.withPresentation` takes. It draws the numbers that
 * `getRandomlyTranslatedAndZoomedCameraProperties` draws for a legacy camera:
 * a factor on the parallel scale, and a move of the focal point of up to
 * `maxTranslateInMM` along each axis of the view. The move in mm becomes a
 * pan in canvas pixels at zoom 1, so call it on a view that was just reset.
 *
 * @param viewport - The viewport, after `resetViewState()`.
 * @param maxTranslateInMM - The longest move along one axis of the view, in mm.
 * @returns The zoom and the pan, or undefined while the viewport shows nothing.
 */
export default function getRandomZoomAndPanPresentation(
  viewport: PlanarViewport,
  maxTranslateInMM: number
): { zoom: number; pan: Types.Point2 } | undefined {
  const camera = viewport.getResolvedView()?.toICamera();

  if (!camera?.focalPoint || !camera.viewUp || !camera.viewPlaneNormal) {
    return;
  }

  const { viewUp, viewPlaneNormal, focalPoint } = camera;
  const randomModifier = 0.5 + Math.random() - 0.5;
  const viewRight = vec3.cross(
    vec3.create(),
    viewUp as vec3,
    viewPlaneNormal as vec3
  );
  const randomPanX = maxTranslateInMM * (2.0 * Math.random() - 1);
  const randomPanY = maxTranslateInMM * (2.0 * Math.random() - 1);
  const movedFocalPoint = focalPoint.map(
    (value, axis) =>
      value + viewRight[axis] * randomPanX + viewUp[axis] * randomPanY
  ) as Types.Point3;
  const from = viewport.worldToCanvas(focalPoint);
  const to = viewport.worldToCanvas(movedFocalPoint);

  return {
    zoom: 1 / randomModifier,
    pan: [from[0] - to[0], from[1] - to[1]],
  };
}
