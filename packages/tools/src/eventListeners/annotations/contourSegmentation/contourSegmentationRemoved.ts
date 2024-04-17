import type { AnnotationRemovedEventType } from '../../../types/EventTypes';
import type { ContourSegmentationAnnotation } from '../../../types/ContourSegmentationAnnotation';
import { removeContourSegmentationAnnotation } from '../../../utilities/contourSegmentation';

export default function contourSegmentationRemovedListener(
  evt: AnnotationRemovedEventType
) {
  const annotation = evt.detail.annotation as ContourSegmentationAnnotation;

  removeContourSegmentationAnnotation(annotation);
}
