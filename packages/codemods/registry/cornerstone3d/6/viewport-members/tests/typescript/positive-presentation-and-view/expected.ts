import type { PlanarViewport, Types } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const viewport = renderingEngine.getViewport<PlanarViewport>('CT');

async function show(displaySetId: string) {
  await viewport.setDisplaySets({ displaySetId });

  viewport.setDisplaySetAppearance({
    voiRange: { lower: -160, upper: 240 },
    invert: true,
  });
  viewport.setDisplaySetAppearance({
    voiLUTFunction: Enums.VOILUTFunctionType.SAMPLED_SIGMOID,
    colormap: { name: 'hsv' },
  });
  viewport.render();
}

function resetAll(viewport2: Types.IViewport) {
  viewport.resetViewState();
  viewport.resetViewState({ resetPan: true, resetZoom: false });
  viewport2.resetViewState();
  viewport.setViewState({ flipHorizontal: true });
  viewport.resetViewStateForResize();

  return viewport.getCurrentImageIdIndex();
}

console.log(show, resetAll);
