import {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from './LabelmapTypes';

type LabelmapToolOperationData = {
  segmentationId: string;
  segmentIndex: number;
  segmentsLocked: number[];
  viewPlaneNormal: number[];
  viewUp: number[];
  strategySpecificConfiguration: any;
  constraintFn: (pointIJK: number) => boolean;
  segmentationRepresentationUID: string;
};

type LabelmapToolOperationDataStack = LabelmapToolOperationData &
  LabelmapSegmentationDataStack;

type LabelmapToolOperationDataVolume = LabelmapToolOperationData &
  LabelmapSegmentationDataVolume;

export {
  LabelmapToolOperationData,
  LabelmapToolOperationDataStack,
  LabelmapToolOperationDataVolume,
};
