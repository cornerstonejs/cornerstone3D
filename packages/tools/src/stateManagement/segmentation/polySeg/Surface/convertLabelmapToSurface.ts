import { Types, cache } from '@cornerstonejs/core';
import { getWebWorkerManager } from '@cornerstonejs/core';
import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../../types/LabelmapTypes';
import { computeVolumeSegmentationFromStack } from '../../convertStackToVolumeSegmentation';

const workerManager = getWebWorkerManager();

export async function convertLabelmapToSurface(
  labelmapRepresentationData: LabelmapSegmentationData,
  segmentIndex: number,
  isVolume = true
): Promise<Types.SurfaceData> {
  let volumeId;
  if (isVolume) {
    volumeId = (labelmapRepresentationData as LabelmapSegmentationDataVolume)
      .volumeId;
  } else {
    const { imageIdReferenceMap } =
      labelmapRepresentationData as LabelmapSegmentationDataStack;
    ({ volumeId } = await computeVolumeSegmentationFromStack({
      imageIdReferenceMap,
    }));
  }

  const volume = cache.getVolume(volumeId);

  const scalarData = volume.getScalarData();
  const { dimensions, spacing, origin, direction } = volume;

  const results = await workerManager.executeTask(
    'polySeg',
    'convertLabelmapToSurface',
    {
      scalarData,
      dimensions,
      spacing,
      origin,
      direction,
      segmentIndex,
    },
    {
      callbacks: [
        (progress) => {
          console.debug('progress', progress);
        },
      ],
    }
  );

  return results;
}
