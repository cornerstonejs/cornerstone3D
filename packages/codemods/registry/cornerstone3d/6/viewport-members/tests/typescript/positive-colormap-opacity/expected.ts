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

  viewport.setDisplaySetAppearance({
    colormap: { name: 'hsv', opacityMapping: FUSION_RAMP },
  });
  viewport.setDisplaySetAppearance({ opacity: 0.5 });
  viewport.setDisplaySetAppearance({
    voiLUTFunction: Enums.VOILUTFunctionType.LINEAR,
    colormap: { name: 'hsv', threshold: 2 },
    opacity: 0.4,
  });
  viewport.setDisplaySetAppearance({
    colormap: { opacityMapping: [{ value: 0, opacity: 0 }, { value: 5, opacity: 1 }] },
  });
  viewport.render();
}

console.log(show);
