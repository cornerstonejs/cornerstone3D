import { RenderingEngine } from '@cornerstonejs/core';
import { utilities as toolsUtilities } from '@cornerstonejs/tools';

const renderingEngine = new RenderingEngine('engine');

export async function run(imageIds: string[]) {
  const viewport = renderingEngine.getViewport('CT');

  viewport.setStack(imageIds, 5);
  toolsUtilities.stackPrefetch.enable(viewport.element);
  viewport.render();
}

export function showSeries(imageIds: string[]) {
  const viewport = renderingEngine.getViewport('CT');

  viewport.setStack(imageIds);
  viewport.render();
}
