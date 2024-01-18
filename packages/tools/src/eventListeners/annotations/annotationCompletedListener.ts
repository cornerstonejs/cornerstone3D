import { AnnotationCompletedEventType } from '../../types/EventTypes';
import {
  isContourSegmentationAnnotation,
  contourSegmentationCompleted,
} from './contourSegmentation';

export default function annotationCompletedListener(
  evt: AnnotationCompletedEventType
) {
  const annotation = evt.detail.annotation;

  if (isContourSegmentationAnnotation(annotation)) {
    contourSegmentationCompleted(evt);
  }
}
