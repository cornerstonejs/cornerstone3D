import areSameSegment from './areSameSegment';
import convertContourSegmentationAnnotation from './convertContourSegmentation';
import { copyAnnotation, copyContourSegment } from './copyAnnotation';
export * from './logicalOperators';
export { default as isContourSegmentationAnnotation } from './isContourSegmentationAnnotation';
export { addContourSegmentationAnnotation } from './addContourSegmentationAnnotation';
export { removeContourSegmentationAnnotation } from './removeContourSegmentationAnnotation';
export { findAllIntersectingContours } from './getIntersectingAnnotations';
export { processMultipleIntersections } from './mergeMultipleAnnotations';
export { contourSegmentationOperation } from './contourSegmentationOperation';
export * from './sharedOperations';

export {
  areSameSegment,
  convertContourSegmentationAnnotation,
  copyContourSegment,
  copyAnnotation,
};

export * from './polylineUnify';
export * from './polylineSubtract';
export * from './polylineIntersect';
export * from './polylineXor';
