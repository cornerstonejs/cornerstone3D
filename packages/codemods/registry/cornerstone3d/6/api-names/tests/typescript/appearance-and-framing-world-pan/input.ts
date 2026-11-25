import type { PlanarViewport, Types } from '@cornerstonejs/core';
import { getRenderingEngine, viewportProjection } from '@cornerstonejs/core';

export function centre(
  renderingEngineId: string,
  viewportId: string,
  saved: Types.ViewFraming
) {
  const viewport =
    getRenderingEngine(renderingEngineId).getViewport<PlanarViewport>(
      viewportId
    );
  const framing = viewport.getViewFraming();

  viewport.setViewFraming({ ...framing, pan: [0, 0] });
  viewport.setViewFraming({
    ...saved,
    zoom: 2,
    pan: [10, 5],
  });

  return viewportProjection.withFraming(viewport, { ...framing, pan: [0, 0] });
}
