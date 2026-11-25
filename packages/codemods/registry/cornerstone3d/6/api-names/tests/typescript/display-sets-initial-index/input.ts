import {
  Enums,
  RenderingEngine,
  displaySetRegistry,
  utilities,
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
    initialImageIdIndex: Math.floor(imageIds.length / 2),
  });
  displaySetRegistry.add('pt', {
    imageIds: ptImageIds,
    volumeId,
    initialImageIdIndex: MIDDLE,
  });
  displaySetRegistry.add('first', { imageIds, initialImageIdIndex: 0 });
  displaySetRegistry.add('given', { imageIds, initialImageIdIndex });

  const stack = renderingEngine.getViewport<PlanarViewport>('STACK');

  await stack.setDisplaySets({ displaySetId: 'ct' });
  await stack.addDisplaySet('first');
  await stack.addDisplaySet('given', { role: 'overlay' });

  const fusion = renderingEngine.getViewport('FUSION') as PlanarViewport;
  const shared = { renderBackend: 'cpu' as const };

  await fusion.setDisplaySets(
    {
      displaySetId: 'ct',
      options: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    { displaySetId: 'pt', options: { ...shared, role: 'overlay' } }
  );

  const pt = renderingEngine.getViewport<PlanarViewport>('PT');

  await pt.setDisplaySets({ displaySetId: 'pt' });
}

export async function fromBeta(viewport: PlanarViewport, imageIds: string[]) {
  utilities.genericViewportDisplaySetMetadataProvider.add('beta', {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 2,
    volumeId: 'cornerstoneStreamingImageVolume:beta',
  });
  utilities.genericViewportDisplaySetMetadataProvider.add('betaLast', {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 1,
  });
  await viewport.setDisplaySets({ displaySetId: 'beta' });
  await viewport.addDisplaySet('betaLast', { role: 'overlay' });
}

run(['a', 'b'], ['c', 'd'], 1);
