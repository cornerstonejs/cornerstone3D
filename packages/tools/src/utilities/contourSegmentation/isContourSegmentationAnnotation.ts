import { Annotation } from '../../types/index.js';
import { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation.js';

export default function isContourSegmentationAnnotation(
  annotation: Annotation
): annotation is ContourSegmentationAnnotation {
  return !!(<ContourSegmentationAnnotation>annotation).data?.segmentation;
}
