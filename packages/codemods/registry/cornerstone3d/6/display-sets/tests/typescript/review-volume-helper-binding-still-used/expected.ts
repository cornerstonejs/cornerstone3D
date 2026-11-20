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
  const viewports = viewportIds.map((viewportId) => {
    const viewport = renderingEngine.getViewport(viewportId);

    if (!viewport) {
      throw new Error(`Viewport with Id ${viewportId} does not exist`);
    }

    return viewport;
  });

  utilities.genericViewportDisplaySetMetadataProvider.add(volumeId, {
    kind: 'planar',
    imageIds,
    volumeId,
  });

  await Promise.all(
    viewports.map((viewport) => viewport.setDisplaySets({ displaySetId: volumeId }))
  );
}
