import type {
  PlanarDisplaySetAppearance,
  PlanarViewport,
  Types,
  VolumeViewport3D,
} from '@cornerstonejs/core';
import { RenderingEngine, getEnabledElement } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('fusion');
const viewport3D = renderingEngine.getViewport<VolumeViewport3D>('3d');

const PET_OPACITY = 0.4;
const FUSION_RAMP = [
  { value: 0, opacity: 0 },
  { value: 0.1, opacity: 0.8 },
  { value: 1, opacity: 0.9 },
];
const ptColormap = { name: 'hsv', opacity: FUSION_RAMP };

export function show(ptId: string, element: HTMLDivElement) {
  viewport.setDisplaySetAppearance(ptId, {
    colormap: { name: 'hsv', opacity: 0.5 },
  });
  viewport.setDisplaySetAppearance(ptId, { colormap: { opacity: 0.25 } });
  viewport.setDisplaySetAppearance(ptId, {
    voiRange: { lower: 0, upper: 5 },
    colormap: { name: 'hsv', opacity: PET_OPACITY, threshold: 2 },
  });
  viewport.setDisplaySetAppearance(ptId, {
    colormap: {
      name: 'hsv',
      opacity: [
        { value: 0, opacity: 0 },
        { value: 5, opacity: 0.9 },
      ],
    },
  });
  viewport.setDisplaySetAppearance(ptId, { colormap: { opacity: FUSION_RAMP } });
  viewport.setDisplaySetAppearance(ptId, {
    colormap: { opacity: FUSION_RAMP.map((point) => ({ ...point })) },
  });
  viewport.setDisplaySetAppearance(ptId, { colormap: ptColormap });
  viewport.setDisplaySetAppearance({ colormap: { name: 'hot', opacity: 1 } });
  viewport.setDisplaySetPresentation(ptId, {
    colormap: { name: 'hsv', opacity: 0.6 },
  });
  viewport3D.setDisplaySetAppearance(ptId, {
    colormap: { opacity: FUSION_RAMP, threshold: 1 },
  });

  const { viewport: enabled } = getEnabledElement(element);

  enabled.setDisplaySetAppearance(ptId, { colormap: { opacity: 0.3 } });
}

const typedAppearance: PlanarDisplaySetAppearance = {
  voiRange: { lower: 0, upper: 5 },
  colormap: { name: 'hsv', opacity: 0.7 },
};

const typedColormap: Types.ColormapPublic = {
  name: 'hsv',
  opacity: FUSION_RAMP,
};

export { typedAppearance, typedColormap };
