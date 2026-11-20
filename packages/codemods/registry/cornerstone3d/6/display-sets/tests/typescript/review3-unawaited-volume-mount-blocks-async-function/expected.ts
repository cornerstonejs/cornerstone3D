import { RenderingEngine, volumeLoader } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const volumeId = 'cornerstoneStreamingImageVolume:CT';

export async function run(imageIds: string[], onLoadStarted: () => void) {
  const viewport = renderingEngine.getViewport('CT_AXIAL');
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  volume.load();
  viewport.setVolumes([{ volumeId }]);
  onLoadStarted();
}

export function showAgain(imageIds: string[]) {
  const viewport = renderingEngine.getViewport('CT_SAGITTAL');

  volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  viewport.setVolumes([{ volumeId }]);
  renderingEngine.render();
}
