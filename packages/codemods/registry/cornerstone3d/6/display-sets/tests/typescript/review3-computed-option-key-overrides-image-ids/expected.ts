import { RenderingEngine, volumeLoader } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');
const volumeId = 'cornerstoneStreamingImageVolume:CT';

export async function runtimeKey(
  imageIds: string[],
  otherImages: string[],
  key: string
) {
  const viewport = engine.getViewport('ct');

  await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
    [key]: otherImages,
  });
  await viewport.setVolumes([{ volumeId }]);
}
