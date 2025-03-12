import {
  cache,
  Enums,
  eventTarget,
  getWebWorkerManager,
  triggerEvent,
  utilities,
} from '@cornerstonejs/core';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types';
import { generateContourSetsFromLabelmap } from '../contours';
import { registerComputeWorker } from '../registerComputeWorker';
import contourAndFindLargestBidirectional from './contourAndFindLargestBidirectional';
import findLargestBidirectional from './findLargestBidirectional';
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

  const stats = reconstructableVolume
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

  return stats;
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

  const {
    segmentationVoxelManager,
    imageVoxelManager,
    segmentationImageData,
    imageData,
  } = strategyData;

  const segmentationScalarData =
    segmentationVoxelManager.getCompleteScalarDataArray();

  const imageScalarData = imageVoxelManager.getCompleteScalarDataArray();

  const segmentationInfo = {
    scalarData: segmentationScalarData,
    dimensions: segmentationImageData.getDimensions(),
    spacing: segmentationImageData.getSpacing(),
    origin: segmentationImageData.getOrigin(),
    direction: segmentationImageData.getDirection(),
  };

  const imageInfo = {
    scalarData: imageScalarData,
    dimensions: imageData.getDimensions(),
    spacing: imageData.getSpacing(),
    origin: imageData.getOrigin(),
    direction: imageData.getDirection(),
  };

  const contours = await getWebWorkerManager().executeTask(
    'compute',
    'getSegmentLargestBidirectionalInternal',
    {
      segmentationInfo,
      imageInfo,
      indices,
      mode,
    }
  );

  triggerWorkerProgress(eventTarget, 100);
  debugger;

  // if (mode === 'collective') {
  //   return processSegmentationStatistics({
  //     stats,
  //     unit,
  //     spacing,
  //     segmentationImageData,
  //     imageVoxelManager,
  //   });
  // } else {
  //   const finalStats = {};
  //   Object.entries(stats).forEach(([segmentIndex, stat]) => {
  //     finalStats[segmentIndex] = processSegmentationStatistics({
  //       stats: stat,
  //       unit,
  //       spacing,
  //       segmentationImageData,
  //       imageVoxelManager,
  //     });
  //   });
  //   return finalStats;
  // }
}

async function calculateStackBidirectional({ segImageIds, indices, mode }) {
  const workerManager = getWebWorkerManager();

  const contours = await workerManager.executeTask(
    'compute',
    'calculateSegmentsLargestBidirectionalStack',
    {
      segImageIds,
      indices,
      mode,
    }
  );
}
