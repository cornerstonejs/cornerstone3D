import type { Annotation } from '../../types';
import type { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';

export default function isContourSegmentationAnnotation(
  annotation: Annotation
): annotation is ContourSegmentationAnnotation {
  return !!(<ContourSegmentationAnnotation>annotation).data?.segmentation;
}
