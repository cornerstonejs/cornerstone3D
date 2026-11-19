import { RenderingEngine, volumeLoader } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const volumeId = 'volume';

export async function show() {
  {
    const imageIds = ['a'];

    await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  }

  const viewport = renderingEngine.getViewport('CT');

  await viewport.setVolumes([{ volumeId }]);
}
