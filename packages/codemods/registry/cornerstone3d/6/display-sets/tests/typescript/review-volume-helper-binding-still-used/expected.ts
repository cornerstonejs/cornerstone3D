import {
  RenderingEngine,
  setVolumesForViewports as setVolumes,
  volumeLoader,
  utilities,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export const api = { setVolumes };
export const helper = setVolumes;

export async function show(imageIds: string[], viewportIds: string[]) {
  const volumeId = 'volume';

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  utilities.genericViewportDisplaySetMetadataProvider.add(volumeId, {
    kind: 'planar',
    imageIds,
    volumeId,
  });

  await Promise.all(
    viewportIds.map((viewportId) =>
      renderingEngine.getViewport(viewportId).setDisplaySets({ displaySetId: volumeId })
    )
  );
}
