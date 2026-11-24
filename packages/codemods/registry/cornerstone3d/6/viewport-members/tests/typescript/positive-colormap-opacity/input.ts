import type { Types } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<Types.IVolumeViewport>('fusion');
const FUSION_RAMP = [
  { value: 0, opacity: 0 },
  { value: 0.1, opacity: 0.8 },
  { value: 1, opacity: 0.9 },
];

async function show(volumeId: string) {
  await viewport.setVolumes([{ volumeId }]);

  viewport.setProperties({
    colormap: { name: 'hsv', opacity: FUSION_RAMP },
  });
  viewport.setProperties({ colormap: { opacity: 0.5 } });
  viewport.setProperties({
    VOILUTFunction: Enums.VOILUTFunctionType.LINEAR,
    colormap: { name: 'hsv', opacity: 0.4, threshold: 2 },
  });
  viewport.setProperties({
    colormap: { opacity: [{ value: 0, opacity: 0 }, { value: 5, opacity: 1 }] },
  });
  viewport.render();
}

console.log(show);
