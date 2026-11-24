import { utilities as csUtils, viewportProjection } from '@cornerstonejs/core';
import type {
  PlanarViewFraming,
  PlanarViewFramingSelector,
  Types,
} from '@cornerstonejs/core';

const { getNormalizedAspectRatio } = csUtils;

/** The selector of the scale pair of a planar view. */
const scaleSelector: PlanarViewFramingSelector = { scale: true };

/**
 * The stretch of the view of a viewport as `[x, y]`, with the smaller of the
 * two 1, so `[1, 1]` for a view that is not stretched.
 *
 * A planar viewport gives it as the scale pair of its view state, read
 * through the projection, in stack mode and in volume mode. Another viewport
 * gives it from `getAspectRatio`. A viewport that has neither is not
 * stretched.
 */
export function getViewStretch(viewport: Types.IViewport): Types.Point2 {
  const scale = viewportProjection.getFraming<PlanarViewFraming>(viewport, {
    selector: scaleSelector,
  })?.scale;

  return getNormalizedAspectRatio(
    scale ?? viewport.getAspectRatio?.() ?? [1, 1]
  );
}
