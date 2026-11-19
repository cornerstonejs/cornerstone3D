import { RenderingEngine, volumeLoader } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');

export async function show(ok: boolean, ids: string[], fallback: () => void) {
  const viewport = renderingEngine.getViewport('CT');

  if (ok) await viewport.setStack(ids);
  else fallback();

  for (const id of ids) viewport.setStack([id], 0);

  const volumeId = 'volume';

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: ids });

  if (ok) viewport.setVolumes([{ volumeId }]);
}
