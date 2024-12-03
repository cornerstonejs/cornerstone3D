import * as config from './config';
import * as locking from './annotationLocking';
import * as selection from './annotationSelection';
import * as annotationState from './annotationState';
import * as visibility from './annotationVisibility';
import FrameOfReferenceSpecificAnnotationManager from './FrameOfReferenceSpecificAnnotationManager';
import AnnotationGroup from './AnnotationGroup';
import { resetAnnotationManager } from './resetAnnotationManager';

const state = {
  ...annotationState,
  resetAnnotationManager,
};

export {
  config,
  locking,
  selection,
  state,
  visibility,
  FrameOfReferenceSpecificAnnotationManager,
  AnnotationGroup,
};
