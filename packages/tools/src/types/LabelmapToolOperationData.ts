import type { Types } from '@cornerstonejs/core';

import {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from './LabelmapTypes';

type LabelmapToolOperationData = {
  segmentationId: string;
  segmentIndex: number;
  /**
   * The colours to use for previewing
   */
  previewColors?: Record<number, [number, number, number, number]>;
  segmentsLocked: number[];
  viewPlaneNormal: number[];
  viewUp: number[];
  strategySpecificConfiguration: any;
  // constraintFn: (pointIJK: number) => boolean;
  segmentationRepresentationUID: string;
  points: Types.Point3[];
  /**
   * preview is used for sharing preview data between views/interactions with
   * a tool, and needs to be maintained by the tool side in order to be able
   * to accept/reject/update the preview information.
   */
  preview: any;
  toolGroupId: string;
};

type LabelmapToolOperationDataStack = LabelmapToolOperationData &
  LabelmapSegmentationDataStack;

type LabelmapToolOperationDataVolume = LabelmapToolOperationData &
  LabelmapSegmentationDataVolume;

type LabelmapToolOperationDataAny =
  | LabelmapToolOperationDataVolume
  | LabelmapToolOperationDataStack;

export {
  LabelmapToolOperationData,
  LabelmapToolOperationDataAny,
  LabelmapToolOperationDataStack,
  LabelmapToolOperationDataVolume,
};
