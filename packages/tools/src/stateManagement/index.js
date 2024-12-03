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
  clearParentAnnotation,
  addChildAnnotation,
  getNumberOfAnnotations,
  setAnnotationManager,
  getAnnotationManager,
  invalidateAnnotation,
} from './annotation/annotationState';
import { resetAnnotationManager } from './annotation/resetAnnotationManager';

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
};
