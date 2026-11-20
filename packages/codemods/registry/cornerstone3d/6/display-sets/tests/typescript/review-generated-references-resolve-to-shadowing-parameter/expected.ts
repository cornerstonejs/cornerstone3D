import {
  RenderingEngine,
  utilities,
  utilities as coreUtilities,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export async function show(ids: string[], utilities: string) {
  const viewport = renderingEngine.getViewport('CT');

  const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, ids[0]]);
  coreUtilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds: ids,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId });

  return utilities;
}

export const isStack = utilities.viewportIsInStackMode;
