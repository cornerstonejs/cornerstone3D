import type { SegmentationRemovedEventType } from '../../types/EventTypes';
import {
  getAllAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import type { ContourSegmentationAnnotation } from '../../types';
import { removeContourCutsOfSegmentation } from '../../tools/displayTools/Contour/contourCuts';

const segmentationRemovedListener = function (
  evt: SegmentationRemovedEventType
): void {
  const { segmentationId } = evt.detail;

  removeContourCutsOfSegmentation(segmentationId);

  // Remove all annotations that are part of the segmentation
  const annotationsToRemove = getAllAnnotations().filter(
    (annotation) =>
      segmentationId ===
      (annotation as ContourSegmentationAnnotation)?.data?.segmentation
        ?.segmentationId
  );

  annotationsToRemove.forEach((annotation) => {
    removeAnnotation(annotation.annotationUID);
  });
};

export default segmentationRemovedListener;
