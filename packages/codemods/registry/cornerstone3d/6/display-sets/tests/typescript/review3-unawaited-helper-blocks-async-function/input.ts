import {
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';

const volumeId = 'cornerstoneStreamingImageVolume:CT';

export async function start(
  imageIds: string[],
  markLoadingStarted: () => void
) {
  const renderingEngine = new RenderingEngine('engine');

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  setVolumesForViewports(renderingEngine, [{ volumeId }], ['ct']);
  markLoadingStarted();
}
