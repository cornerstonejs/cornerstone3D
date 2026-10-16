import type { Point3 } from '../../../types';

type ViewportSpacingLike = {
  canvas?: { clientHeight?: number; height?: number };
  sHeight?: number;
  getCamera?: () => { parallelScale?: number } | undefined;
};

/**
 * World size of one canvas pixel on each axis (FIDELITY-RECORD-2 /
 * GENVIEW-FIDELITY-3). For parallel projection, that is
 * `2 * parallelScale / canvasHeight` on the in-plane axes.
 *
 * Returns undefined when the camera or canvas is not ready; callers then fall
 * back to reduction-factor comparison without magnification.
 */
export function displaySpacingOfViewport(
  viewport: ViewportSpacingLike
): Point3 | undefined {
  const camera = viewport.getCamera?.();
  const parallelScale = camera?.parallelScale;
  const height =
    viewport.canvas?.clientHeight ||
    viewport.canvas?.height ||
    viewport.sHeight;

  if (!(parallelScale > 0) || !(height > 0)) {
    return undefined;
  }

  const spacing = (2 * parallelScale) / height;

  return [spacing, spacing, spacing];
}
