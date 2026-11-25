import { getRenderingEngine } from '@cornerstonejs/core';
import type { PlanarViewport, Types } from '@cornerstonejs/core';

const camera = {
  setZoom(zoom: number, store: boolean) {
    return [zoom, store];
  },
  getProperties: () => ({}),
};

export function zoomAbout(engineId: string, point: Types.Point2) {
  const viewport = getRenderingEngine(engineId).getViewport<PlanarViewport>('ct');

  viewport.setZoom(2, point);
  viewport.setZoom(2, [10, 20]);
  viewport.setZoom(2);
  viewport.setPan([1, 2]);
  camera.setZoom(1, true);

  if (!camera.getProperties || !viewport.getVolumeIds) {
    return;
  }

  const render = viewport.render;

  render.call(viewport);
}
