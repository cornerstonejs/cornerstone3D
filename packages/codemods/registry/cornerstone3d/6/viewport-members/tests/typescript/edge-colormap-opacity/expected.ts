import type { Types } from '@cornerstonejs/core';
import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<Types.IVolumeViewport>('fusion');

async function show(volumeId: string, sliderValue: string, opacity: number) {
  await viewport.setVolumes([{ volumeId }]);

  viewport.setProperties({ colormap: { name: 'hsv', opacity: Number(sliderValue) } });
  viewport.setProperties({
    colormap: { opacity: [{ value: 0, opacity: 0 }], opacityMapping: [] },
  });
  viewport.setProperties({ colormap: { name: 'hsv', opacity } });
  viewport.setDisplaySetAppearance({ invert: true, colormap: { name: 'hsv' } });
  viewport.render();
}

console.log(show);
