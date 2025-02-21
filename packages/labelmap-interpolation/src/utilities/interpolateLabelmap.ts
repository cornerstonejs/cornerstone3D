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

  const {
    voxelManager: segmentationVoxelManager,
    imageData: segmentationImageData,
  } = segVolume;

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

    triggerWorkerProgress(eventTarget, 100);
  } catch (error) {
    console.warn(
      'Warning: Failed to perform morphological contour interpolation',
      error
    );
    triggerWorkerProgress(eventTarget, 100);
  }
}

export default interpolateLabelmap;
