import { RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';

async function asksForNothing(imageIds: string[], volumeId: string) {
  const viewport = new RenderingEngine('engine').getViewport<PlanarViewport>('STACK');

  displaySetRegistry.add('ct', { imageIds, volumeId });
  await viewport.setDisplaySets({ displaySetId: 'ct' });
  await viewport.addDisplaySet('ct', { role: 'overlay' });
}

async function show3D(viewport, series) {
  const displaySetId = `volume3d:${viewport.id}`;

  displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
  });
}

displaySetRegistry.add('elsewhere', { imageIds: ['a'], volumeId: 'v-a' });

export { asksForNothing, show3D };
