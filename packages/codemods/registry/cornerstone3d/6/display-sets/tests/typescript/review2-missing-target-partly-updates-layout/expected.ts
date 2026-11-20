import {
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
  utilities,
} from '@cornerstonejs/core';

const volumeId = 'cornerstoneStreamingImageVolume:CT';

export async function layout(imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  const viewports = ['good', 'missing'].map((viewportId) => {
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

export function notAwaited(imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');

  volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  setVolumesForViewports(renderingEngine, [{ volumeId }], ['a', 'b']);
}
