import mouseEventListeners from './mouse/index.js';
import touchEventListeners from './touch/index.js';
import wheelEventListener from './wheel/index.js';
import keyEventListener from './keyboard/index.js';
import {
  segmentationDataModifiedEventListener,
  segmentationRepresentationModifiedEventListener,
  segmentationRepresentationRemovedEventListener,
  segmentationModifiedListener,
  imageChangeEventListener,
} from './segmentation/index.js';
import {
  annotationCompletedListener,
  annotationSelectionListener,
  annotationModifiedListener,
  annotationRemovedListener,
} from './annotations/index.js';
//import touchEventListeners from './touchEventListeners';

export {
  mouseEventListeners,
  touchEventListeners,
  wheelEventListener,
  keyEventListener,
  segmentationRepresentationModifiedEventListener,
  segmentationModifiedListener,
  segmentationRepresentationRemovedEventListener,
  segmentationDataModifiedEventListener,
  imageChangeEventListener,
  annotationCompletedListener,
  annotationSelectionListener,
  annotationModifiedListener,
  annotationRemovedListener,
};
