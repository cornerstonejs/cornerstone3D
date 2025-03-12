import {
  cache,
  Enums,
  eventTarget,
  getWebWorkerManager,
  triggerEvent,
  utilities,
} from '@cornerstonejs/core';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types';
import { registerComputeWorker } from '../registerComputeWorker';
import { WorkerTypes } from '../../enums';
import { getActiveSegmentIndex } from '../../stateManagement/segmentation/getActiveSegmentIndex';
import { getStrategyData } from '../../tools/segmentation/strategies/utils/getStrategyData';
import ensureSegmentationVolume from '../../tools/segmentation/strategies/compositions/ensureSegmentationVolume';
import ensureImageVolume from '../../tools/segmentation/strategies/compositions/ensureImageVolume';

const triggerWorkerProgress = (eventTarget, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: WorkerTypes.COMPUTE_LARGEST_BIDIRECTIONAL,
  });
};

export async function getSegmentLargestBidirectional({
  segmentationId,
  segmentIndices,
  mode = 'individual',
}) {
  // Todo: handle the 'collective' mode where segment indices are merged together
  registerComputeWorker();

  triggerWorkerProgress(eventTarget, 0);

  const segmentation = getSegmentation(segmentationId);
  const { representationData } = segmentation;

  const { Labelmap } = representationData;

  if (!Labelmap) {
    console.debug('No labelmap found for segmentation', segmentationId);
    return;
  }

  const segVolumeId = (Labelmap as LabelmapSegmentationDataVolume).volumeId;
  const segImageIds = (Labelmap as LabelmapSegmentationDataStack).imageIds;

  // Create a minimal operationData object
  const operationData = {
    segmentationId,
    volumeId: segVolumeId,
    imageIds: segImageIds,
  };

  let reconstructableVolume = false;
  if (segImageIds) {
    const refImageIds = segImageIds.map((imageId) => {
      const image = cache.getImage(imageId);
      return image.referencedImageId;
    });
    reconstructableVolume = utilities.isValidVolume(refImageIds);
  }
  let indices = segmentIndices;

  if (!indices) {
    indices = [getActiveSegmentIndex(segmentationId)];
  } else if (!Array.isArray(indices)) {
    // Include the preview index
    indices = [indices, 255];
  }

  const bidirectionalData = reconstructableVolume
    ? await calculateVolumeBidirectional({
        operationData,
        indices,
        mode,
      })
    : await calculateStackBidirectional({
        segImageIds,
        indices,
        mode,
      });

  triggerWorkerProgress(eventTarget, 100);

  return bidirectionalData;
}

/**
 * Calculate statistics for a reconstructable volume
 */
async function calculateVolumeBidirectional({ operationData, indices, mode }) {
  // Get the strategy data
  const strategyData = getStrategyData({
    operationData,
    strategy: {
      ensureSegmentationVolumeFor3DManipulation:
        ensureSegmentationVolume.ensureSegmentationVolumeFor3DManipulation,
      ensureImageVolumeFor3DManipulation:
        ensureImageVolume.ensureImageVolumeFor3DManipulation,
    },
  });

  const { segmentationVoxelManager, segmentationImageData } = strategyData;

  const segmentationScalarData =
    segmentationVoxelManager.getCompleteScalarDataArray();

  const segmentationInfo = {
    scalarData: segmentationScalarData,
    dimensions: segmentationImageData.getDimensions(),
    spacing: segmentationImageData.getSpacing(),
    origin: segmentationImageData.getOrigin(),
    direction: segmentationImageData.getDirection(),
  };

  const bidirectionalData = await getWebWorkerManager().executeTask(
    'compute',
    'getSegmentLargestBidirectionalInternal',
    {
      segmentationInfo,
      indices,
      mode,
    }
  );

  return bidirectionalData;
}

async function calculateStackBidirectional({ segImageIds, indices, mode }) {
  const workerManager = getWebWorkerManager();

  const segmentationInfo = [];
  const imageInfo = [];
  for (const segImageId of segImageIds) {
    const segImage = cache.getImage(segImageId);
    const segPixelData = segImage.getPixelData();

    const { origin, direction, spacing, dimensions } =
      utilities.getImageDataMetadata(segImage);

    segmentationInfo.push({
      scalarData: segPixelData,
      dimensions,
      spacing,
      origin,
      direction,
    });
  }

  const bidirectionalData = await workerManager.executeTask(
    'compute',
    'getSegmentLargestBidirectionalInternal',
    {
      segmentationInfo,
      imageInfo,
      indices,
      mode,
      isStack: true,
    }
  );

  return bidirectionalData;
}
