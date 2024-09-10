import type { Types } from '@cornerstonejs/core';

import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from './LabelmapTypes';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  strategySpecificConfiguration: any;
  // constraintFn: (pointIJK: number) => boolean;
  points: Types.Point3[];
  voxelManager;
  override: {
    voxelManager: Types.IVoxelManager<number>;
    imageData: vtkImageData;
  };
  /**
   * preview is used for sharing preview data between views/interactions with
   * a tool, and needs to be maintained by the tool side in order to be able
   * to accept/reject/update the preview information.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export type {
  LabelmapToolOperationData,
  LabelmapToolOperationDataAny,
  LabelmapToolOperationDataStack,
  LabelmapToolOperationDataVolume,
};
