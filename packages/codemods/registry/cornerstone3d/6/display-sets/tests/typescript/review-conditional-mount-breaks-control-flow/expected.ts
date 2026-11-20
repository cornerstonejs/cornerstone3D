import { RenderingEngine, volumeLoader, utilities } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export async function show(ok: boolean, ids: string[], fallback: () => void) {
  const viewport = renderingEngine.getViewport('CT');

  if (ok) {
    const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, ids[0]]);
    utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
      kind: 'planar',
      imageIds: ids,
      initialImageIdIndex: 0,
    });
    await viewport.setDisplaySets({ displaySetId });
  }
  else fallback();

  for (const id of ids) viewport.setStack([id], 0);

  const volumeId = 'volume';

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: ids });

  if (ok) viewport.setVolumes([{ volumeId }]);
}
