import type { AnnotationRemovedEventType } from '../../../types/EventTypes.js';
import type { ContourSegmentationAnnotation } from '../../../types/ContourSegmentationAnnotation.js';
import { removeContourSegmentationAnnotation } from '../../../utilities/contourSegmentation/index.js';

export default function contourSegmentationRemovedListener(
  evt: AnnotationRemovedEventType
) {
  const annotation = evt.detail.annotation as ContourSegmentationAnnotation;

  removeContourSegmentationAnnotation(annotation);
}
