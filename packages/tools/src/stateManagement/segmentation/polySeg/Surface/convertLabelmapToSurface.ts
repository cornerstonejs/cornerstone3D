import {
  Types,
  cache,
  eventTarget,
  triggerEvent,
  Enums,
} from '@cornerstonejs/core';
import { getWebWorkerManager } from '@cornerstonejs/core';
import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../../types/LabelmapTypes';
import { computeVolumeSegmentationFromStack } from '../../convertStackToVolumeSegmentation';
import { WorkerTypes } from '../../../../enums';

const workerManager = getWebWorkerManager();

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.POLYSEG_LABELMAP_TO_SURFACE,
  });
};

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

  triggerWorkerProgress(eventTarget, 0);

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
          triggerWorkerProgress(eventTarget, progress);
        },
      ],
    }
  );

  triggerWorkerProgress(eventTarget, 1);

  return results;
}
