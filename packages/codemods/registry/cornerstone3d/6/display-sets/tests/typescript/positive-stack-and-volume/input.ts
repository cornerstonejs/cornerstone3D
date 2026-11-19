import type { PlanarViewport } from '@cornerstonejs/core';
import { RenderingEngine, volumeLoader } from '@cornerstonejs/core';

async function run(imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const viewport = renderingEngine.getViewport<PlanarViewport>('CT_STACK');
  const stack = [imageIds[0]];

  await viewport.setStack(stack);
  viewport.render();

  const secondViewport =
    renderingEngine.getViewport<PlanarViewport>('CT_STACK_2');

  secondViewport.setStack(imageIds, 50);

  const volumeId = 'cornerstoneStreamingImageVolume:CT';
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  volume.load();

  const volumeViewport =
    renderingEngine.getViewport<PlanarViewport>('CT_AXIAL');

  volumeViewport.setVolumes([{ volumeId }]);
  volumeViewport.render();
}

run(['a', 'b']);
