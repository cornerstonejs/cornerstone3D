import FrameOfReferenceSpecificAnnotationManager, {
  defaultFrameOfReferenceSpecificAnnotationManager,
} from './annotation/FrameOfReferenceSpecificAnnotationManager';
import * as annotationLocking from './annotation/annotationLocking';
import * as annotationSelection from './annotation/annotationSelection';

import {
  getAnnotations,
  addAnnotation,
  removeAnnotation,
  getAnnotation,
  getParentAnnotation,
  getChildAnnotations,
  getNumberOfAnnotations,
  setAnnotationManager,
  getAnnotationManager,
  resetAnnotationManager,
  invalidateAnnotation,
} from './annotation/annotationState';

import {
  addSegmentationRepresentations,
  removeSegmentationsFromToolGroup,
} from './segmentation';

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
  setAnnotationManager,
  getAnnotationManager,
  resetAnnotationManager,
  invalidateAnnotation,
  // segmentations
  addSegmentationRepresentations,
  removeSegmentationsFromToolGroup,
};
