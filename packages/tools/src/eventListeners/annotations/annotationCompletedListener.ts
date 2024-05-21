import { AnnotationCompletedEventType } from '../../types/EventTypes';
import * as contourSegUtils from '../../utilities/contourSegmentation';
import { contourSegmentationCompleted } from './contourSegmentation';

export default function annotationCompletedListener(
  evt: AnnotationCompletedEventType
) {
  const annotation = evt.detail.annotation;

  if (contourSegUtils.isContourSegmentationAnnotation(annotation)) {
    contourSegmentationCompleted(evt);
  }
}
