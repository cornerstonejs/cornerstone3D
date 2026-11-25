import { RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';
import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';

async function run(imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const volumeId = 'cornerstoneStreamingImageVolume:CT';

  displaySetRegistry.add('stack', { imageIds });
  displaySetRegistry.add('mpr', { imageIds, volumeId });
  displaySetRegistry.add('pmap', { volumeId: 'pmap-volume' });

  const stack = renderingEngine.getViewport<PlanarViewport>('STACK');

  await stack.setDisplaySets({ displaySetId: 'stack' });

  const axial = renderingEngine.getViewport<PlanarViewport>('AXIAL');

  await axial.setDisplaySets({
    displaySetId: 'mpr',
    options: { mode: 'volume' },
  });
  await axial.setDisplaySets({ displaySetId: 'mpr', options: { mode: 'stack' } });

  const threeD = renderingEngine.getViewport<VolumeViewport3D>('3D');

  await threeD.setDisplaySets({ displaySetId: 'mpr' });
  await renderingEngine
    .getViewport('3D_BY_ID')
    .setDisplaySets({ displaySetId: 'mpr' });

  const parametricMap = renderingEngine.getViewport<PlanarViewport>('PMAP');

  await parametricMap.setDisplaySets({ displaySetId: 'pmap' });
}

run(['a', 'b']);
