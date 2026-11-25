import { Enums, displaySetRegistry, getRenderingEngine } from '@cornerstonejs/core';

export function Viewer({ imageIds }) {
  const viewport = getRenderingEngine('engine').getViewport('CT_AXIAL');

  displaySetRegistry.add('ct', {
    imageIds,
    volumeId: 'cornerstoneStreamingImageVolume:CT',
  });
  viewport.setDisplaySets({ displaySetId: 'ct' });

  return <div className="viewport" />;
}

export async function Volume3D({ imageIds, testUtils, renderingEngine, viewportId }) {
  testUtils.createViewports(renderingEngine, {
    viewportType: Enums.ViewportType.VOLUME_3D,
    viewportId,
  });

  const viewport = renderingEngine.getViewport(viewportId);

  displaySetRegistry.add('ct3d', {
    imageIds,
    volumeId: 'cornerstoneStreamingImageVolume:CT',
  });
  await viewport.setDisplaySets({ displaySetId: 'ct3d' });

  return <div className="viewport" />;
}
