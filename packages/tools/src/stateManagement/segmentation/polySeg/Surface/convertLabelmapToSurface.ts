import { Types, cache, eventTarget, triggerEvent } from '@cornerstonejs/core';
import { getWebWorkerManager } from '@cornerstonejs/core';
import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../../types/LabelmapTypes';
import { computeVolumeSegmentationFromStack } from '../../convertStackToVolumeSegmentation';
import { Events } from '../../../../enums';

const workerManager = getWebWorkerManager();

/**
 * Converts a labelmap representation to a surface representation.
 *
 * @param labelmapRepresentationData - The labelmap segmentation data.
 * @param segmentIndex - The index of the segment to convert.
 * @param isVolume - Optional flag indicating whether the labelmap is a volume or a stack. Default is true.
 * @returns A promise that resolves to the surface data.
 */
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

  triggerEvent(eventTarget, Events.POLYSEG_CONVERSION, { progress: 0 });

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
          triggerEvent(eventTarget, Events.POLYSEG_CONVERSION, { progress });
        },
      ],
    }
  );

  triggerEvent(eventTarget, Events.POLYSEG_CONVERSION, { progress: 100 });

  return results;
}
