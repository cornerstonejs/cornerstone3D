import type { PlanarViewport } from '@cornerstonejs/core';
import { RenderingEngine, utilities } from '@cornerstonejs/core';

const displaySetId = 'ct';

async function run(imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const viewport = renderingEngine.getViewport<PlanarViewport>('CT_STACK');

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: 0,
  });

  await viewport.setDisplaySets({ displaySetId });
  await viewport.addDisplaySet('overlay', { role: 'overlay' });
}

run([]);
