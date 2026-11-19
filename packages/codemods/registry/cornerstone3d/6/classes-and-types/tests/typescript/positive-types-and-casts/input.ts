import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  getRenderingEngine,
  getEnabledElement,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport('stack') as Types.IStackViewport;
const volumeViewport = <Types.IVolumeViewport>(
  renderingEngine.getViewport('volume')
);
const videoViewport = getRenderingEngine('engine').getViewport(
  'video'
) as Types.IVideoViewport;

let engine;
const slide = engine.getViewport('wsi') as Types.IWSIViewport;

function update(
  target: Types.IBaseVolumeViewport,
  ecg: Types.IECGViewport,
  any: Types.IGenericViewport
) {
  return [target, ecg, any];
}

const { viewport: enabled } = getEnabledElement(element) as {
  viewport: Types.IStackViewport;
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
