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
    // In this case the labelmap is both stack and volume, so doesn't really matter which we pick if no viewport provided
    return false;
  }

  // we can get the viewport to decide
  return viewport instanceof VolumeViewport;
}

export { isVolumeSegmentation };
