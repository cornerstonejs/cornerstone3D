import { ContourSegmentationAnnotation } from '../../../types/ContourSegmentationAnnotation';

export default function areContoursFromSameSegmentIndex(
  firstAnnotation: ContourSegmentationAnnotation,
  secondAnnotation: ContourSegmentationAnnotation
) {
  const { segmentation: firstSegmentation } = firstAnnotation.data;
  const { segmentation: secondSegmentation } = secondAnnotation.data;

  return (
    firstSegmentation.segmentationRepresentationUID ===
      secondSegmentation.segmentationRepresentationUID &&
    firstSegmentation.segmentIndex === secondSegmentation.segmentIndex
  );
}
