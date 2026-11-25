import type { Point2 } from '../../../types';
import { normalizePlanarScale } from './planarCameraScale';
import { normalizePlanarViewState } from './planarViewState';
import type { PlanarViewState } from './PlanarViewportTypes';

/**
 * Derives a canvas-space pan for semantic planar state before data geometry is
 * available.
 */
export function getPlanarProjectionFallbackPan(
  viewState: PlanarViewState,
  canvasWidth: number,
  canvasHeight: number
): Point2 {
  const anchorCanvas = viewState.anchorCanvas ?? [0.5, 0.5];
  const anchorWorld = viewState.anchorWorld ?? [0, 0, 0];
  const [scaleX, scaleY] = normalizePlanarScale(viewState.scale);

  return [
    (0 - anchorWorld[0]) * scaleX + (anchorCanvas[0] - 0.5) * canvasWidth,
    (0 - anchorWorld[1]) * scaleY + (anchorCanvas[1] - 0.5) * canvasHeight,
  ];
}

/**
 * Applies a fallback canvas-space pan by moving the normalized anchor canvas.
 */
export function getPlanarProjectionFallbackViewStateWithPan(
  viewState: PlanarViewState,
  nextPan: Point2,
  canvasWidth: number,
  canvasHeight: number
): PlanarViewState {
  const currentPan = getPlanarProjectionFallbackPan(
    viewState,
    canvasWidth,
    canvasHeight
  );
  const [ax, ay] = viewState.anchorCanvas ?? [0.5, 0.5];
  const deltaX = nextPan[0] - currentPan[0];
  const deltaY = nextPan[1] - currentPan[1];

  return normalizePlanarViewState({
    ...viewState,
    anchorCanvas: [
      ax + deltaX / Math.max(canvasWidth, 1),
      ay + deltaY / Math.max(canvasHeight, 1),
    ],
    displayArea: undefined,
  });
}
