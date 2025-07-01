import {
  getWebWorkerManager,
  eventTarget,
  Enums,
  triggerEvent,
} from '@cornerstonejs/core';
import {
  segmentation,
  Enums as csToolsEnums,
  utilities,
} from '@cornerstonejs/tools';
import { registerInterpolationWorker } from '../registerWorker';

type MorphologicalContourInterpolationOptions = {
  label?: number;
  axis?: number;
  noHeuristicAlignment?: boolean;
  noUseDistanceTransform?: boolean;
  useCustomSlicePositions?: boolean;
};

const { triggerSegmentationEvents } = segmentation;
const { getOrCreateSegmentationVolume } = utilities.segmentation;

const { triggerSegmentationDataModified } = triggerSegmentationEvents;
const { WorkerTypes } = csToolsEnums;

const workerManager = getWebWorkerManager();

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.INTERPOLATE_LABELMAP,
  });
};

async function interpolateLabelmap({
  segmentationId,
  segmentIndex,
  configuration = { preview: false },
}: {
  segmentationId: string;
  segmentIndex: number;
  configuration?: MorphologicalContourInterpolationOptions & {
    preview: boolean;
  };
}) {
  registerInterpolationWorker();

  triggerWorkerProgress(eventTarget, 0);

  const segVolume = getOrCreateSegmentationVolume(segmentationId);
  // If segVolume is an array, process each; otherwise, process as single volume
  const segVolumes = Array.isArray(segVolume) ? segVolume : [segVolume];
  const totalVolumes = segVolumes.length;
  let failed = false;

  for (let i = 0; i < totalVolumes; i++) {
    const currentSegVolume = segVolumes[i];
    const {
      voxelManager: segmentationVoxelManager,
      imageData: segmentationImageData,
    } = currentSegVolume;

    const segmentationInfo = {
      scalarData: segmentationVoxelManager.getCompleteScalarDataArray(),
      dimensions: segmentationImageData.getDimensions(),
      spacing: segmentationImageData.getSpacing(),
      origin: segmentationImageData.getOrigin(),
      direction: segmentationImageData.getDirection(),
    };

    try {
      const { data: outputScalarData } = await workerManager.executeTask(
        'interpolation',
        'interpolateLabelmap',
        {
          segmentationInfo,
          configuration: {
            ...configuration,
            label: segmentIndex,
          },
        }
      );

      // Update the segmentation with the modified data
      segmentationVoxelManager.setCompleteScalarDataArray(outputScalarData);

      triggerSegmentationDataModified(
        segmentationId,
        segmentationVoxelManager.getArrayOfModifiedSlices(),
        segmentIndex
      );

      // Update progress percentage
      const progress = Math.round(((i + 1) / totalVolumes) * 100);
      triggerWorkerProgress(eventTarget, progress);
    } catch (error) {
      console.warn(
        `Warning: Failed to perform morphological contour interpolation for volume ${i}`,
        error
      );
      failed = true;
      // Still update progress
      const progress = Math.round(((i + 1) / totalVolumes) * 100);
      triggerWorkerProgress(eventTarget, progress);
    }
  }
}

export default interpolateLabelmap;
