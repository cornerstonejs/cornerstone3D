import FrameOfReferenceSpecificAnnotationManager, {
  defaultFrameOfReferenceSpecificAnnotationManager,
} from './annotation/FrameOfReferenceSpecificAnnotationManager.js';
import * as annotationLocking from './annotation/annotationLocking.js';
import * as annotationSelection from './annotation/annotationSelection.js';

import {
  getAnnotations,
  addAnnotation,
  removeAnnotation,
  getAnnotation,
  getParentAnnotation,
  getChildAnnotations,
  clearParentAnnotation,
  addChildAnnotation,
  getNumberOfAnnotations,
  setAnnotationManager,
  getAnnotationManager,
  resetAnnotationManager,
  invalidateAnnotation,
} from './annotation/annotationState.js';

import {
  addSegmentationRepresentations,
  removeSegmentationsFromToolGroup,
} from './segmentation/index.js';

export {
  // annotations
  FrameOfReferenceSpecificAnnotationManager,
  defaultFrameOfReferenceSpecificAnnotationManager,
  annotationLocking,
  annotationSelection,
  getAnnotations,
  addAnnotation,
  getNumberOfAnnotations,
  removeAnnotation,
  getAnnotation,
  getParentAnnotation,
  getChildAnnotations,
  clearParentAnnotation,
  addChildAnnotation,
  setAnnotationManager,
  getAnnotationManager,
  resetAnnotationManager,
  invalidateAnnotation,
  // segmentations
  addSegmentationRepresentations,
  removeSegmentationsFromToolGroup,
};
