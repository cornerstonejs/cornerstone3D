import type { Types } from '@cornerstonejs/core';
import {
  cache,
  eventTarget,
  getWebWorkerManager,
  triggerEvent,
  Enums,
} from '@cornerstonejs/core';

import * as cornerstoneTools from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';

const { WorkerTypes } = cornerstoneTools.Enums;
const { computeVolumeLabelmapFromStack } =
  cornerstoneTools.utilities.segmentation;

const workerManager = getWebWorkerManager();

const triggerWorkerProgress = (eventTarget, progress, id) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.POLYSEG_LABELMAP_TO_SURFACE,
    id,
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
  labelmapRepresentationData: ToolsTypes.LabelmapSegmentationData,
  segmentIndex: number
): Promise<Types.SurfaceData> {
  let volumeId;

  if (
    (labelmapRepresentationData as ToolsTypes.LabelmapSegmentationDataVolume)
      .volumeId
  ) {
    volumeId = (
      labelmapRepresentationData as ToolsTypes.LabelmapSegmentationDataVolume
    ).volumeId;
  } else {
    const { imageIds } =
      labelmapRepresentationData as ToolsTypes.LabelmapSegmentationDataStack;

    ({ volumeId } = await computeVolumeLabelmapFromStack({
      imageIds,
    }));
  }

  const volume = cache.getVolume(volumeId);
  const scalarData = volume.voxelManager.getCompleteScalarDataArray();
  const { dimensions, spacing, origin, direction } = volume;

  triggerWorkerProgress(eventTarget, 0, segmentIndex);

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
          triggerWorkerProgress(eventTarget, progress, segmentIndex);
        },
      ],
    }
  );

  triggerWorkerProgress(eventTarget, 100, segmentIndex);

  return results;
}
