import FrameOfReferenceSpecificAnnotationManager, {
  defaultFrameOfReferenceSpecificAnnotationManager,
} from './annotation/FrameOfReferenceSpecificAnnotationManager'
import getStyle from './annotation/config/getStyle'
import setGlobalStyle from './annotation/config/setGlobalStyle'
import setToolStyle from './annotation/config/setToolStyle'
import * as annotationLocking from './annotation/annotationLocking'
import * as annotationSelection from './annotation/annotationSelection'

import {
  getAnnotations,
  addAnnotation,
  removeAnnotation,
  getDefaultAnnotationManager,
  getViewportSpecificAnnotationManager,
  getAnnotation,
} from './annotation/annotationState'

import {
  setSegmentationRepresentations,
  removeSegmentationsFromToolGroup,
} from './segmentation'

export {
  // annotations
  FrameOfReferenceSpecificAnnotationManager,
  defaultFrameOfReferenceSpecificAnnotationManager,
  annotationLocking,
  annotationSelection,
  getAnnotations,
  addAnnotation,
  getStyle,
  setGlobalStyle,
  setToolStyle,
  removeAnnotation,
  getDefaultAnnotationManager,
  getViewportSpecificAnnotationManager,
  getAnnotation,
  // segmentations
  setSegmentationRepresentations,
  removeSegmentationsFromToolGroup,
}
