import {
  RenderingEngine,
  setVolumesForViewports as setVolumes,
  volumeLoader,
} from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export const api = { setVolumes };
export const helper = setVolumes;

export async function show(imageIds: string[], viewportIds: string[]) {
  const volumeId = 'volume';

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  await setVolumes(renderingEngine, [{ volumeId }], viewportIds);
}
