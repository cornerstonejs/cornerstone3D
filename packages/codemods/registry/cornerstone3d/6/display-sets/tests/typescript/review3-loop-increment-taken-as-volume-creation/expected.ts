import { RenderingEngine, volumeLoader } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');
const volumeId = 'cornerstoneStreamingImageVolume:CT';

export async function skippedIncrement(imageIds: string[]) {
  const viewport = engine.getViewport('ct');

  for (
    let index = 0;
    index < 1;
    volumeLoader.createAndCacheVolume(volumeId, { imageIds })
  ) {
    break;
  }

  await viewport.setVolumes([{ volumeId }]);
}
