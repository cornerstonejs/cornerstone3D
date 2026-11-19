import type { PlanarViewport, Types } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('CT');

async function show(displaySetId: string) {
  await viewport.setDisplaySets({ displaySetId });

  viewport.setProperties({
    voiRange: { lower: -160, upper: 240 },
    invert: true,
  });
  viewport.setProperties({
    VOILUTFunction: Enums.VOILUTFunctionType.SAMPLED_SIGMOID,
    colormap: { name: 'hsv' },
  });
  viewport.render();
}

function resetAll(viewport2: Types.IViewport) {
  viewport.resetCamera();
  viewport.resetCamera({ resetPan: true, resetZoom: false });
  viewport2.resetCamera();
  viewport.setCamera({ flipHorizontal: true });
  viewport.resetCameraForResize();

  return viewport.getTargetImageIdIndex();
}

console.log(show, resetAll);
