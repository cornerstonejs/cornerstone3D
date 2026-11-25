import { RenderingEngine, utilities } from '@cornerstonejs/core';
import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';

async function run(imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const volumeId = 'cornerstoneStreamingImageVolume:CT';

  utilities.genericViewportDisplaySetMetadataProvider.add('stack', { imageIds });
  utilities.genericViewportDisplaySetMetadataProvider.add('mpr', { imageIds, volumeId });
  utilities.genericViewportDisplaySetMetadataProvider.add('pmap', { volumeId: 'pmap-volume' });

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
    .setDisplaySets({ displaySetId: 'mpr', options: { renderMode: 'vtkVolume3d' } });

  const parametricMap = renderingEngine.getViewport<PlanarViewport>('PMAP');

  await parametricMap.setDisplaySets({ displaySetId: 'pmap' });
}

run(['a', 'b']);
