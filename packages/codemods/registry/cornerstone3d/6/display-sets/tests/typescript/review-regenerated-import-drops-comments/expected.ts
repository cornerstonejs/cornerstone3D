import {
  utilities,
  RenderingEngine,
  /* retain this license */
  Enums, // eslint-disable-line
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export async function show(ids: string[]) {
  const viewport = renderingEngine.getViewport('CT');

  const displaySetId = `${viewport.renderingEngineId}:${viewport.id}:${ids[0]}`;
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds: ids,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId });

  return Enums;
}
