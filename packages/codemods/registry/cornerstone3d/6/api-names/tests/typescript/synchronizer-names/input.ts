import { synchronizers, SynchronizerManager } from '@cornerstonejs/tools';
import * as cornerstoneTools from '@cornerstonejs/tools';

const { createStackImageSynchronizer } = synchronizers;

export function syncSlices(renderingEngineId: string, viewportIds: string[]) {
  const first = synchronizers.createStackImageSynchronizer('slices');
  const second =
    cornerstoneTools.synchronizers.createStackImageSynchronizer('slices-2');
  const third = createStackImageSynchronizer('slices-3');

  viewportIds.forEach((viewportId) => {
    first.add({ renderingEngineId, viewportId });
    second.add({ renderingEngineId, viewportId });
    third.add({ renderingEngineId, viewportId });
  });

  return SynchronizerManager.getSynchronizer('slices');
}
