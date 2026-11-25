import {
  displaySetRegistry,
  RenderingEngine,
  /* retain this license */
  Enums, // eslint-disable-line
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export async function show(ids: string[]) {
  const viewport = renderingEngine.getViewport('CT');

  const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, ids[0]]);
  displaySetRegistry.add(displaySetId, {
    imageIds: ids,
  });
  await viewport.setDisplaySets({ displaySetId });

  return Enums;
}
