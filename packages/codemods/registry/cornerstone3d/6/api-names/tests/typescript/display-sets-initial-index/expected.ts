import {
  Enums,
  RenderingEngine,
  displaySetRegistry,
} from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';

const MIDDLE = 4;

async function run(
  imageIds: string[],
  ptImageIds: string[],
  initialImageIdIndex: number
) {
  const renderingEngine = new RenderingEngine('engine');
  const volumeId = 'cornerstoneStreamingImageVolume:CT';

  displaySetRegistry.add('ct', {
    imageIds,
  });
  displaySetRegistry.add('pt', {
    imageIds: ptImageIds,
    volumeId,
  });
  displaySetRegistry.add('first', { imageIds });
  displaySetRegistry.add('given', { imageIds });

  const stack = renderingEngine.getViewport<PlanarViewport>('STACK');

  await stack.setDisplaySets({ displaySetId: 'ct', options: { initialImageIdIndex: Math.floor(imageIds.length / 2) } });
  await stack.addDisplaySet('first', { initialImageIdIndex: 0 });
  await stack.addDisplaySet('given', { role: 'overlay', initialImageIdIndex });

  const fusion = renderingEngine.getViewport('FUSION') as PlanarViewport;
  const shared = { renderBackend: 'cpu' as const };

  await fusion.setDisplaySets(
    {
      displaySetId: 'ct',
      options: {
        orientation: Enums.OrientationAxis.AXIAL,
        initialImageIdIndex: Math.floor(imageIds.length / 2),
      },
    },
    { displaySetId: 'pt', options: { initialImageIdIndex: MIDDLE, ...shared, role: 'overlay' } }
  );

  const pt = renderingEngine.getViewport<PlanarViewport>('PT');

  await pt.setDisplaySets({ displaySetId: 'pt', options: { initialImageIdIndex: MIDDLE } });
}

export async function fromBeta(viewport: PlanarViewport, imageIds: string[]) {
  displaySetRegistry.add('beta', {
    imageIds,
    volumeId: 'cornerstoneStreamingImageVolume:beta',
  });
  displaySetRegistry.add('betaLast', {
    imageIds,
  });
  await viewport.setDisplaySets({ displaySetId: 'beta', options: { mode: 'volume', initialImageIdIndex: 2 } });
  await viewport.addDisplaySet('betaLast', { role: 'overlay', initialImageIdIndex: 1 });
}

run(['a', 'b'], ['c', 'd'], 1);
