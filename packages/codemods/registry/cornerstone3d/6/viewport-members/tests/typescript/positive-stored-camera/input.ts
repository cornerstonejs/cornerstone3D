import { getRenderingEngine } from '@cornerstonejs/core';
import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';

export function zoomAndKeep(engineId: string) {
  const engine = getRenderingEngine(engineId);
  const viewport = engine.getViewport<PlanarViewport>('ct');
  const volume3D = engine.getViewport<VolumeViewport3D>('vr');

  viewport.setZoom(viewport.getZoom(), true);
  viewport.setZoom(2, false);
  viewport.setPan([10, 0], true);
  viewport.setPan([0, 0], false);
  volume3D.setZoom(1.5, true);
}

export function panBy(viewport: PlanarViewport, store: boolean) {
  viewport.setPan([5, 5], store);
}
