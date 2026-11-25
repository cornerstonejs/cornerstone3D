import * as cornerstone3D from '@cornerstonejs/core';
import { displaySetRegistry } from '@cornerstonejs/core';

async function show3D(viewport, series) {
  const displaySetId = `volume3d:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
  });
}

export async function asksForNothing(viewport, full, fullVolumeId) {
  displaySetRegistry.add('ct', { imageIds: full.imageIds, volumeId: fullVolumeId });
  await viewport.setDisplaySets({ displaySetId: 'ct' });
}

export function View({ series }) {
  return <div ref={(element) => element && show3D(element.viewport, series)} />;
}
