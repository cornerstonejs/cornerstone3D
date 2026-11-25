import type { PlanarViewport, Types } from '@cornerstonejs/core';
import { getRenderingEngine, viewportProjection } from '@cornerstonejs/core';

export function stretch(renderingEngineId: string, viewportId: string) {
  const viewport =
    getRenderingEngine(renderingEngineId).getViewport<PlanarViewport>(
      viewportId
    );

  const framing = viewport.getViewFraming({
    zoom: true,
    });
  const picked = viewportProjection.getFraming(viewport, {
    selector: { pan: true },
  });
  const selector: Types.ViewFramingSelector = { rotation: true };
  const kept: Types.ViewFraming = { zoom: 2 };

  viewport.setViewFraming({ zoom: 2 });

  return [framing, picked, selector, kept];
}
