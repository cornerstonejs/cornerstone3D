import { getAnnotation } from '../../annotation/annotationState';
import AnnotationTool from '../../../tools/base/AnnotationTool';
import {
  getAnnotationsUIDMapFromSegmentation,
  removeCompleteContourAnnotation,
} from '../utilities';
import { isContourSegmentationAnnotation } from '../../../utilities/contourSegmentation';
import type { ContourSegmentationAnnotation } from '../../../types';

/**
 * Clears/removes all contour segment annotations for a given segment index.
 * When options.recordHistory is true, records a memo per annotation via
 * AnnotationTool.createAnnotationMemo. Caller must start group recording
 * before invoking if grouping is desired.
 *
 * @param segmentationId - The unique identifier of the segmentation.
 * @param segmentIndex - The index of the segment to clear/remove the annotations from.
 * @param options - Optional. recordHistory: when true, record this removal in history.
 */
export function removeContourSegmentAnnotations(
  segmentationId: string,
  segmentIndex: number,
  options?: { recordHistory?: boolean }
) {
  const annotationUIDsMap =
    getAnnotationsUIDMapFromSegmentation(segmentationId);
  if (!annotationUIDsMap) {
    return;
  }

  const annotationUIDsSet = annotationUIDsMap.get(segmentIndex);
  if (!annotationUIDsSet) {
    return;
  }

  const annotationUIDs = Array.from(annotationUIDsSet);
  const annotations: ContourSegmentationAnnotation[] = [];

  for (const annotationUID of annotationUIDs) {
    const annotation = getAnnotation(annotationUID);
    if (isContourSegmentationAnnotation(annotation)) {
      annotations.push(annotation as ContourSegmentationAnnotation);
    }
  }

  if (annotations.length === 0) {
    return;
  }

  for (const annotation of annotations) {
    if (annotation.parentAnnotationUID) {
      continue; // Skip child annotations
    }
    if (options?.recordHistory) {
      AnnotationTool.createAnnotationMemo(null, annotation, {
        deleting: true,
      });
    }
    removeCompleteContourAnnotation(annotation);
  }
}
