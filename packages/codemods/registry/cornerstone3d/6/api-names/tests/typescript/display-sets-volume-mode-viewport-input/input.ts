import { Enums, RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';
import { createViewports } from './helpers';

const { ViewportType } = Enums;

export async function created(element: HTMLDivElement, imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');
  const volumeId = 'cornerstoneStreamingImageVolume:CT';

  displaySetRegistry.add('mpr', { imageIds, volumeId });

  renderingEngine.enableElement({
    viewportId: '3D_INPUT',
    type: ViewportType.VOLUME_3D,
    element,
  });
  await renderingEngine
    .getViewport('3D_INPUT')
    .setDisplaySets({ displaySetId: 'mpr', options: { renderMode: 'vtkVolume3d' } });

  const threeD = renderingEngine.getViewport('3D_INPUT');

  await threeD.setDisplaySets({ displaySetId: 'mpr' });

  renderingEngine.setViewports([
    { viewportId: 'AXIAL', type: Enums.ViewportType.PLANAR, element },
    { viewportId: 'MIXED', type: ViewportType.PLANAR, element },
    { viewportId: 'MIXED', type: ViewportType.VOLUME_3D, element },
  ]);
  await renderingEngine.getViewport('AXIAL').setDisplaySets({ displaySetId: 'mpr' });
  await renderingEngine.getViewport('MIXED').setDisplaySets({ displaySetId: 'mpr' });
}

export async function helper(renderingEngine: RenderingEngine, viewportId: string) {
  createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.VOLUME_3D,
  });

  const viewport = renderingEngine.getViewport(viewportId);

  await viewport.setDisplaySets({ displaySetId: 'mpr' });
}

export async function elsewhere(renderingEngine: RenderingEngine) {
  await renderingEngine.getViewport('3D_INPUT').setDisplaySets({ displaySetId: 'mpr' });
}
