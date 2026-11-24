import type { PlanarViewport } from '@cornerstonejs/core';
import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('fusion');

interface AppLayer {
  opacity: number;
  colormapName: string;
}

const segmentationStyle = { fillAlpha: 0.5, opacity: 0.7 };
const layer: AppLayer = { opacity: 0.5, colormapName: 'hsv' };

export function show(ptId: string, store: { setLayer(layer: AppLayer): void }) {
  viewport.setDisplaySetAppearance(ptId, {
    opacity: 0.5,
    colormap: {
      name: 'hsv',
      opacityMapping: [
        { value: 0, opacity: 0 },
        { value: 5, opacity: 0.9 },
      ],
      threshold: 2,
    },
  });
  viewport.setDisplaySetAppearance(ptId, { opacity: 0.25 });
  store.setLayer({ opacity: 0.5, colormapName: 'hsv' });

  const appearance = viewport.getDisplaySetAppearance(ptId);

  return [appearance.opacity, appearance.colormap?.opacityMapping, layer, segmentationStyle];
}
