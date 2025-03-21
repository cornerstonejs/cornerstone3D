import type { Types } from '@cornerstonejs/core';

import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from './LabelmapTypes';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { LabelmapMemo } from '../utilities/segmentation/createLabelmapMemo';

type LabelmapToolOperationData = {
  segmentationId: string;
  segmentIndex: number;
  /**
   * The colours to use for previewing
   */
  previewColor?: [number, number, number, number];
  previewSegmentIndex?: number;
  //
  segmentsLocked: number[];
  viewPlaneNormal: number[];
  viewUp: number[];
  activeStrategy: string;
  points: Types.Point3[];
  voxelManager;
  override: {
    voxelManager: Types.IVoxelManager<number>;
    imageData: vtkImageData;
  };
  toolGroupId: string;
  /**
   * Creates a labelmap memo, given the preview information and segment voxels.
   * May return an already existing one when used for extension.
   */
  createMemo: (
    segmentId,
    segmentVoxels,
    previewVoxels?,
    previewMemo?
  ) => LabelmapMemo;
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
