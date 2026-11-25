import type { PlanarViewport } from '@cornerstonejs/core';
import { getRenderingEngine } from '@cornerstonejs/core';
import { FramingStore } from './store';

export function frame(renderingEngineId: string, store: FramingStore) {
  const viewport =
    getRenderingEngine(renderingEngineId).getViewport<PlanarViewport>('ct');
  const framing = viewport.getViewFraming();

  viewport.setViewFraming({ pan: [0, 0] });
  viewport.setViewFraming({ ...framing, worldPan: [1, 2], pan: [0, 0] });
  viewport.setViewFraming({ pan: [0, 0], ...framing });
  viewport.setViewFraming({ ...framing, zoom: 2 });
  viewport.setViewFraming(framing);
  store.setViewFraming({ ...framing, pan: [0, 0] });

  return { ...framing, pan: [0, 0] };
}
