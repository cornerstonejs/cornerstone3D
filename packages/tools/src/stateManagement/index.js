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
  getNumberOfAnnotations,
  setAnnotationManager,
  getAnnotationManager,
  resetAnnotationManager,
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
  setAnnotationManager,
  getAnnotationManager,
  resetAnnotationManager,
  // segmentations
  addSegmentationRepresentations,
  removeSegmentationsFromToolGroup,
};
