import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataVolume,
} from '../../../../types/LabelmapTypes';
import {
  LabelmapToolOperationData,
  LabelmapToolOperationDataStack,
  LabelmapToolOperationDataVolume,
} from '../../../../types';
import { Types, VolumeViewport } from '@cornerstonejs/core';

function isVolumeSegmentation(
  operationData: LabelmapToolOperationData | LabelmapSegmentationData,
  viewport?: Types.IViewport
): operationData is
  | LabelmapToolOperationDataVolume
  | LabelmapSegmentationDataVolume {
  const { imageIds } = operationData as LabelmapToolOperationDataStack;
  const { volumeId } = operationData as LabelmapToolOperationDataVolume;

  if (volumeId && !imageIds) {
    return true;
  }

  if (imageIds && !volumeId) {
    return false;
  }

  if (volumeId && imageIds && !viewport) {
    throw new Error(
      'isVolumeSegmentation: viewport is required when both volumeId and imageIds are provided'
    );
  }

  // we can get the viewport to decide
  return viewport instanceof VolumeViewport;
}

export { isVolumeSegmentation };
