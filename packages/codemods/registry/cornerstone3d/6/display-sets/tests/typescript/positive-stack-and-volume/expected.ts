import type { PlanarViewport } from '@cornerstonejs/core';
import { RenderingEngine, volumeLoader, utilities } from '@cornerstonejs/core';

async function run(imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const viewport = renderingEngine.getViewport<PlanarViewport>('CT_STACK');
  const stack = [imageIds[0]];

  utilities.genericViewportDisplaySetMetadataProvider.add(`${viewport.id}:stack`, {
    kind: 'planar',
    imageIds: stack,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId: `${viewport.id}:stack` });
  viewport.render();

  const secondViewport =
    renderingEngine.getViewport<PlanarViewport>('CT_STACK_2');

  utilities.genericViewportDisplaySetMetadataProvider.add(`${secondViewport.id}:stack`, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: 50,
  });
  await secondViewport.setDisplaySets({ displaySetId: `${secondViewport.id}:stack` });

  const volumeId = 'cornerstoneStreamingImageVolume:CT';
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  volume.load();

  const volumeViewport =
    renderingEngine.getViewport<PlanarViewport>('CT_AXIAL');

  utilities.genericViewportDisplaySetMetadataProvider.add(volumeId, {
    kind: 'planar',
    imageIds,
    volumeId,
  });
  await volumeViewport.setDisplaySets({ displaySetId: volumeId });
  volumeViewport.render();
}

run(['a', 'b']);
