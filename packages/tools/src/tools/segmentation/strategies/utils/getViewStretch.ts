import { utilities as csUtils, viewportProjection } from '@cornerstonejs/core';
import type {
  PlanarViewPresentation,
  PlanarViewPresentationSelector,
  Types,
} from '@cornerstonejs/core';

const { getNormalizedAspectRatio, isGenericViewport } = csUtils;

/** The selector of the scale pair of a planar view. */
const scaleSelector: PlanarViewPresentationSelector = { scale: true };

/**
 * The stretch of the view of a viewport as `[x, y]`, with the smaller of the
 * two 1, so `[1, 1]` for a view that is not stretched.
 *
 * A next viewport gives it as the scale pair of its view state, read through
 * the projection, in stack mode and in volume mode. A legacy viewport gives
 * it from `getAspectRatio`. A viewport that has neither is not stretched.
 */
export function getViewStretch(viewport: Types.IViewport): Types.Point2 {
  const source: unknown = viewport;
  const scale = isGenericViewport(source)
    ? viewportProjection.getPresentation<PlanarViewPresentation>(source, {
        selector: scaleSelector,
      })?.scale
    : undefined;

  return getNormalizedAspectRatio(
    scale ?? viewport.getAspectRatio?.() ?? [1, 1]
  );
}
