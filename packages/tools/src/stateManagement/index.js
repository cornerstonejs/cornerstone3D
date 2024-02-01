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
  getChildrenAnnotations,
  getNumberOfAnnotations,
  setAnnotationManager,
  getAnnotationManager,
  resetAnnotationManager,
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
  getChildrenAnnotations,
  setAnnotationManager,
  getAnnotationManager,
  resetAnnotationManager,
  // segmentations
  addSegmentationRepresentations,
  removeSegmentationsFromToolGroup,
};
