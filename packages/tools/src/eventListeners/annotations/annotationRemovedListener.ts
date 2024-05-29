import { AnnotationRemovedEventType } from '../../types/EventTypes.js';
import * as contourSegUtils from '../../utilities/contourSegmentation/index.js';
import { contourSegmentationRemoved } from './contourSegmentation/index.js';

export default function annotationRemovedListener(
  evt: AnnotationRemovedEventType
) {
  const annotation = evt.detail.annotation;

  if (contourSegUtils.isContourSegmentationAnnotation(annotation)) {
    contourSegmentationRemoved(evt);
  }
}
