import { getWebWorkerManager } from '@cornerstonejs/core';
import { WorkerTypes } from '../../enums';
import { registerComputeWorker } from '../registerComputeWorker';
import {
  triggerWorkerProgress,
  getSegmentationDataForWorker,
  prepareVolumeStrategyDataForWorker,
  prepareStackDataForWorker,
} from './utilsForWorker';

/**
 * Get largest bidirectional measurements for segmentation
 * @param segmentationId - The segmentation ID
 * @param segmentIndices - The segment indices
 * @param mode - The computation mode
 * @returns Bidirectional measurement data
 */
export async function getSegmentLargestBidirectional({
  segmentationId,
  segmentIndices,
  mode = 'individual',
}) {
  // Todo: handle the 'collective' mode where segment indices are merged together
  registerComputeWorker();

  triggerWorkerProgress(WorkerTypes.COMPUTE_LARGEST_BIDIRECTIONAL, 0);

  const segData = getSegmentationDataForWorker(segmentationId, segmentIndices);

  if (!segData) {
    return;
  }

  const { operationData, segImageIds, reconstructableVolume, indices } =
    segData;

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

  triggerWorkerProgress(WorkerTypes.COMPUTE_LARGEST_BIDIRECTIONAL, 100);

  return bidirectionalData;
}

/**
 * Calculate bidirectional measurements for a volume
 * @param operationData - The operation data
 * @param indices - The segment indices
 * @param mode - The computation mode
 * @returns Bidirectional measurement data
 */
async function calculateVolumeBidirectional({ operationData, indices, mode }) {
  // Get the strategy data
  const strategyData = prepareVolumeStrategyDataForWorker(operationData);

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

/**
 * Calculate bidirectional measurements for a stack
 * @param segImageIds - The segmentation image IDs
 * @param indices - The segment indices
 * @param mode - The computation mode
 * @returns Bidirectional measurement data
 */
async function calculateStackBidirectional({ segImageIds, indices, mode }) {
  // Get segmentation and image info for each image in the stack
  const { segmentationInfo } = prepareStackDataForWorker(segImageIds);

  const bidirectionalData = await getWebWorkerManager().executeTask(
    'compute',
    'getSegmentLargestBidirectionalInternal',
    {
      segmentationInfo,
      indices,
      mode,
      isStack: true,
    }
  );

  return bidirectionalData;
}
