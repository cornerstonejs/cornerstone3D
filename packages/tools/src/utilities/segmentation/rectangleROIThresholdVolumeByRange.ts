import type { Types } from '@cornerstonejs/core';
import { state } from '../../stateManagement/annotation';
import {
  RectangleROIStartEndThresholdTool,
  RectangleROIThresholdTool,
} from '../../tools';

import thresholdVolumeByRange from './thresholdVolumeByRange';
import getBoundsIJKFromRectangleAnnotations from '../rectangleROITool/getBoundsIJKFromRectangleAnnotations';

export type ThresholdRangeOptions = {
  lower: number;
  upper: number;
  numSlicesToProject?: number; // number of slices to project before and after current slice
  overwrite: boolean;
};

export type AnnotationForThresholding = {
  data: {
    handles: {
      points: Types.Point3[];
    };
    cachedStats?: {
      projectionPoints?: Types.Point3[][];
    };
  };
};

/**
 * It uses the provided rectangleROI annotations (either RectangleROIThreshold, or
 * RectangleROIStartEndThreshold) to compute an ROI that is the intersection of
 * all the annotations. Then it uses the rectangleROIThreshold utility to threshold
 * the volume.
 * @param annotations - rectangleROI annotations to use for ROI
 * @param segmentationVolume - the segmentation volume
 * @param referenceVolumes - the reference volumes to use for the segmentation volume
 * @param options - options for thresholding
 * @returns
 */
function rectangleROIThresholdVolumeByRange(
  annotationUIDs: string[],
  segmentationVolume: Types.IImageVolume,
  referenceVolumes: Types.IImageVolume[],
  options: ThresholdRangeOptions
): Types.IImageVolume {
  if (referenceVolumes.length > 1) {
    throw new Error(
      'thresholding based on more than one reference volumes data is not supported yet'
    );
  }

  const referenceVolume = referenceVolumes[0];

  const annotations = annotationUIDs.map((annotationUID) => {
    return state.getAnnotation(annotationUID);
  });

  _validateAnnotations(annotations);

  const boundsIJK = getBoundsIJKFromRectangleAnnotations(
    annotations,
    referenceVolume,
    options
  );

  const optionsToUse = {
    lower: options.lower,
    upper: options.upper,
    overwrite: options.overwrite,
    boundsIJK,
  };

  const outputSegmentationVolume = thresholdVolumeByRange(
    segmentationVolume,
    referenceVolume,
    optionsToUse
  );

  return outputSegmentationVolume;
}

function _validateAnnotations(annotations) {
  const validToolNames = [
    RectangleROIThresholdTool.toolName,
    RectangleROIStartEndThresholdTool.toolName,
  ];

  for (const annotation of annotations) {
    const name = annotation.metadata.toolName;
    if (!validToolNames.includes(name)) {
      throw new Error(
        'rectangleROIThresholdVolumeByRange only supports RectangleROIThreshold and RectangleROIStartEndThreshold annotations'
      );
    }
  }
}

export default rectangleROIThresholdVolumeByRange;
