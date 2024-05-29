import { AnnotationCompletedEventType } from '../../types/EventTypes.js';
import * as contourSegUtils from '../../utilities/contourSegmentation/index.js';
import { contourSegmentationCompleted } from './contourSegmentation/index.js';

export default function annotationCompletedListener(
  evt: AnnotationCompletedEventType
) {
  const annotation = evt.detail.annotation;

  if (contourSegUtils.isContourSegmentationAnnotation(annotation)) {
    contourSegmentationCompleted(evt);
  }
}
