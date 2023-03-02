import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import getBoundingBoxAroundShape from '../boundingBox/getBoundingBoxAroundShape';
import extend2DBoundingBoxInViewAxis from '../boundingBox/extend2DBoundingBoxInViewAxis';

type Options = {
  numSlicesToProject?: number;
};

function getBoundsIJKFromRectangleAnnotations(
  referenceVolume,
  options = {} as Options
) {
  const AllBoundsIJK = [];
  // const { data } = annotation;
  // const { points } = data.handles;

  const { imageData, dimensions } = referenceVolume;

  // If the tool is a 2D tool but has projection points, use them

  const rectangleCornersIJK = referenceVolume;
  const boundsIJKShape = getBoundingBoxAroundShape(
    rectangleCornersIJK,
    dimensions
  );

  // If the tool is 2D but it is configured to project to X amount of slices
  // Don't project the slices if projectionPoints have been used to define the extents

  AllBoundsIJK.push(boundsIJKShape);

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

export default getBoundsIJKFromRectangleAnnotations;
