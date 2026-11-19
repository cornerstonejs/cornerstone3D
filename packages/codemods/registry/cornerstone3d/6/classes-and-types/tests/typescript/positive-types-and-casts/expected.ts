import type {
  Types,
  PlanarViewport,
  VideoViewport,
  WSIViewport,
  ECGViewport,
} from '@cornerstonejs/core';
import {
  RenderingEngine,
  getRenderingEngine,
  getEnabledElement,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('stack');
const volumeViewport = renderingEngine.getViewport<PlanarViewport>('volume');
const videoViewport = getRenderingEngine('engine').getViewport<VideoViewport>(
  'video'
);

let engine;
const slide = engine.getViewport('wsi') as WSIViewport;

function update(
  target: PlanarViewport,
  ecg: ECGViewport,
  any: Types.IViewport
) {
  return [target, ecg, any];
}

const { viewport: enabled } = getEnabledElement(element) as {
  viewport: PlanarViewport;
};

const point: Types.Point3 = [0, 0, 0];

console.log(
  viewport,
  volumeViewport,
  videoViewport,
  slide,
  update,
  enabled,
  point
);
