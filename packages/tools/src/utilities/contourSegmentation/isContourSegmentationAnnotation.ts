import { Annotation } from '../../types';
import { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';

export default function isContourSegmentationAnnotation(
  annotation: Annotation
): annotation is ContourSegmentationAnnotation {
  return !!(<ContourSegmentationAnnotation>annotation).data?.segmentation;
}
