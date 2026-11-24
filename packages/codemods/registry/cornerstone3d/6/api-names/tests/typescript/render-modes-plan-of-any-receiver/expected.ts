import * as cornerstone3D from '@cornerstonejs/core';
import { createNextViewport } from './helpers';

export function check(renderingEngine: cornerstone3D.RenderingEngine) {
  const next = createNextViewport(renderingEngine, 'CT');
  const modes = ['vtkImage', 'vtkSampledSlice'];

  return [
    modes.includes(next.getRenderPlan()[0].renderMode),
    next.getRenderPlan()[0].renderMode === 'cpuImage',
    next.getRenderPlan().map((layer) => layer.renderMode),
  ];
}
