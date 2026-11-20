import {
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';

const volumeId = 'cornerstoneStreamingImageVolume:CT';

export async function layout(imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    ['video', 'ct']
  );
}
