import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../../types/LabelmapTypes';
import {
  LabelmapToolOperationData,
  LabelmapToolOperationDataStack,
  LabelmapToolOperationDataVolume,
} from '../../../../types';

function isStackSegmentation(
  operationData: LabelmapToolOperationData | LabelmapSegmentationData
): operationData is
  | LabelmapToolOperationDataStack
  | LabelmapSegmentationDataStack {
  return (
    (operationData as LabelmapToolOperationDataStack).imageIdReferenceMap !==
    undefined
  );
}

function isVolumeSegmentation(
  operationData: LabelmapToolOperationData | LabelmapSegmentationData
): operationData is
  | LabelmapToolOperationDataVolume
  | LabelmapSegmentationDataVolume {
  return (
    (operationData as LabelmapToolOperationDataVolume)?.volumeId !== undefined
  );
}

export { isStackSegmentation, isVolumeSegmentation };
