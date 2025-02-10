import { getWebWorkerManager } from '@cornerstonejs/core';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import getOrCreateSegmentationVolume from './getOrCreateSegmentationVolume';
import { registerComputeWorker } from '../registerComputeWorker';

type MorphologicalContourInterpolationOptions = {
  label?: number;
  axis?: number;
  noHeuristicAlignment?: boolean;
  noUseDistanceTransform?: boolean;
  useCustomSlicePositions?: boolean;
};

const workerManager = getWebWorkerManager();

async function interpolateLabelmap({
  segmentationId,
  segmentIndex,
  configuration = { preview: false },
}: {
  segmentationId: string;
  segmentIndex: number;
  configuration: MorphologicalContourInterpolationOptions & {
    preview: boolean;
  };
}) {
  registerComputeWorker();

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
      'compute',
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
  } catch (error) {
    console.warn(
      'Warning: Failed to perform morphological contour interpolation',
      error
    );
  }
}

export default interpolateLabelmap;
