import { synchronizers, SynchronizerManager } from '@cornerstonejs/tools';
import * as cornerstoneTools from '@cornerstonejs/tools';

const { createImageSliceSynchronizer } = synchronizers;

export function syncSlices(renderingEngineId: string, viewportIds: string[]) {
  const first = synchronizers.createImageSliceSynchronizer('slices');
  const second =
    cornerstoneTools.synchronizers.createImageSliceSynchronizer('slices-2');
  const third = createImageSliceSynchronizer('slices-3');

  viewportIds.forEach((viewportId) => {
    first.add({ renderingEngineId, viewportId });
    second.add({ renderingEngineId, viewportId });
    third.add({ renderingEngineId, viewportId });
  });

  return SynchronizerManager.getSynchronizer('slices');
}
