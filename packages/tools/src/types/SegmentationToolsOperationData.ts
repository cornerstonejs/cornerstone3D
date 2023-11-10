import type { Types } from '@cornerstonejs/core';

type SegToolsEditDataStack = {
  imageIds: Array<string>;
  segmentationImageIds: Array<string>;
  currentImageId: string;
  zSpacing: number;
  origin: number[];
  segmentationRepresentationUID: string;
};

type SegToolsEditDataVolume = {
  segmentation: Types.IImageVolume;
  imageVolume: Types.IImageVolume; //
  segmentationRepresentationUID: string;
};

type SegToolsEditData = SegToolsEditDataStack | SegToolsEditDataVolume;

type SegToolsOperationData = {
  segmentationId: string;
  editData: SegToolsEditData;
  segmentIndex: number;
  segmentsLocked: number[];
  viewPlaneNormal: number[];
  viewUp: number[];
  strategySpecificConfiguration: any;
  constraintFn: () => boolean;
};

export {
  SegToolsOperationData,
  SegToolsEditData,
  SegToolsEditDataStack,
  SegToolsEditDataVolume,
};
