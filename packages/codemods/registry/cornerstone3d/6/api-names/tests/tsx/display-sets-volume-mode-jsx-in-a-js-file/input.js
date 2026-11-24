import { displaySetRegistry, getRenderingEngine } from '@cornerstonejs/core';

export function Viewer({ imageIds }) {
  const viewport = getRenderingEngine('engine').getViewport('CT_AXIAL');

  displaySetRegistry.add('ct', {
    imageIds,
    volumeId: 'cornerstoneStreamingImageVolume:CT',
  });
  viewport.setDisplaySets({ displaySetId: 'ct' });

  return <div className="viewport" />;
}
