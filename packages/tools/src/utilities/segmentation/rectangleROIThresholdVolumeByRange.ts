import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { state } from '../../stateManagement/annotation';
import {
  RectangleROIStartEndThresholdTool,
  RectangleROIThresholdTool,
} from '../../tools';

import {
  getBoundingBoxAroundShape,
  extend2DBoundingBoxInViewAxis,
} from '../segmentation';
import thresholdVolumeByRange from './thresholdVolumeByRange';

const { transformWorldToIndex } = csUtils;

export type ThresholdRangeOptions = {
  lower: number;
  higher: number;
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

  const optionsToUse = {
    lower: options.lower,
    higher: options.higher,
    boundsIJK: _getBoundsIJKFromRectangleROIs(
      annotations,
      referenceVolume,
      options
    ),
    overwrite: options.overwrite,
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

function _getBoundsIJKFromRectangleROIs(annotations, referenceVolume, options) {
  const { numSlicesToProject } = options;

  const AllBoundsIJK = [];
  annotations.forEach((annotation) => {
    const { data } = annotation;
    const { points } = data.handles;

    const { imageData, dimensions } = referenceVolume;

    let pointsToUse = points;
    // If the tool is a 2D tool but has projection points, use them
    if (data.cachedStats?.projectionPoints) {
      const { projectionPoints } = data.cachedStats;
      pointsToUse = [].concat(...projectionPoints); // cannot use flat() because of typescript compiler right now
    }

    const rectangleCornersIJK = pointsToUse.map(
      (world) => transformWorldToIndex(imageData, world) as Types.Point3
    );
    let boundsIJK = getBoundingBoxAroundShape(rectangleCornersIJK, dimensions);

    // If the tool is 2D but it is configured to project to X amount of slices
    // Don't project the slices if projectionPoints have been used to define the extents
    if (numSlicesToProject && !data.cachedStats?.projectionPoints) {
      boundsIJK = extendBoundingBoxInSliceAxisIfNecessary(
        boundsIJK,
        numSlicesToProject
      );
    }

    AllBoundsIJK.push(boundsIJK);
  });

  if (AllBoundsIJK.length === 1) {
    return AllBoundsIJK[0];
  }

  // Get the intersection of all the bounding boxes
  // This is the bounding box that contains all the ROIs
  const boundsIJK = AllBoundsIJK.reduce(
    (accumulator, currentValue) => {
      return {
        iMin: Math.min(accumulator.iMin, currentValue.iMin),
        jMin: Math.min(accumulator.jMin, currentValue.jMin),
        kMin: Math.min(accumulator.kMin, currentValue.kMin),
        iMax: Math.max(accumulator.iMax, currentValue.iMax),
        jMax: Math.max(accumulator.jMax, currentValue.jMax),
        kMax: Math.max(accumulator.kMax, currentValue.kMax),
      };
    },
    {
      iMin: Infinity,
      jMin: Infinity,
      kMin: Infinity,
      iMax: -Infinity,
      jMax: -Infinity,
      kMax: -Infinity,
    }
  );

  return boundsIJK;
}

export function extendBoundingBoxInSliceAxisIfNecessary(
  boundsIJK: [Types.Point2, Types.Point2, Types.Point2],
  numSlicesToProject: number
): [Types.Point2, Types.Point2, Types.Point2] {
  const extendedBoundsIJK = extend2DBoundingBoxInViewAxis(
    boundsIJK,
    numSlicesToProject
  );
  return extendedBoundsIJK;
}

export default rectangleROIThresholdVolumeByRange;
