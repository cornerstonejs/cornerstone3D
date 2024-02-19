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
  const { imageIdReferenceMap } =
    operationData as LabelmapToolOperationDataStack;
  const { volumeId } = operationData as LabelmapToolOperationDataVolume;

  if (volumeId && !imageIdReferenceMap) {
    return true;
  }

  if (imageIdReferenceMap && !volumeId) {
    return false;
  }

  if (volumeId && imageIdReferenceMap && !viewport) {
    throw new Error(
      'isVolumeSegmentation: viewport is required when both volumeId and imageIdReferenceMap are provided'
    );
  }

  // we can get the viewport to decide
  return viewport instanceof VolumeViewport;
}

export { isVolumeSegmentation };
