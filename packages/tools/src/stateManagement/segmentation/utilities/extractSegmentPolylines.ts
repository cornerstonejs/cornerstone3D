import type { Types } from '@cornerstonejs/core';
import type {
  ContourSegmentationData,
  ContourSegmentationAnnotation,
} from '../../../types';
import { getSegmentation } from '../getSegmentation';
import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { getViewportIdsWithSegmentation } from '../getViewportIdsWithSegmentation';
import { getAnnotation } from '../../annotation/annotationState';
import { convertContourPolylineToCanvasSpace } from '../../../utilities/contourSegmentation';

/**
 * Gets the viewport associated with a given segmentation ID.
 * Returns the first viewport that contains the segmentation.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @returns The viewport associated with the segmentation, or undefined if not found
 */
//TODO: use function from LogicalOperators
export function getViewportAssociatedToSegmentation(segmentationId: string) {
  const viewportIds = getViewportIdsWithSegmentation(segmentationId);
  if (viewportIds?.length === 0) {
    return;
  }
  const { viewport } = getEnabledElementByViewportId(viewportIds[0]) || {};
  return viewport;
}

/**
 * Extracts polylines from contour representation data for a specific segment.
 * Creates a map of annotation UIDs to their corresponding polylines.
 *
 * @param contourRepresentationData - The contour representation data containing annotations
 * @param segmentIndex - The index of the segment to extract polylines from
 * @returns A map of annotation UIDs to their polylines, or undefined if no annotations found
 */
//TODO: use function from LogicalOperators
function getPolylinesMap(
  contourRepresentationData: ContourSegmentationData,
  segmentIndex: number
): Map<string, Types.Point3[]> {
  const getPolyline = (annotation) => {
    const { polyline, closed } = (annotation as ContourSegmentationAnnotation)
      .data.contour;
    const polylineCopy = polyline.map((point) => [...point]);
    if (closed) {
      polylineCopy.push(polylineCopy[0]);
    }
    return polylineCopy;
  };
  // loop over all annotations in the segment and flatten their polylines
  const polylines = new Map();
  const { annotationUIDsMap } = contourRepresentationData || {};
  if (!annotationUIDsMap?.has(segmentIndex)) {
    return;
  }
  const annotationUIDs = annotationUIDsMap.get(segmentIndex);

  for (const annotationUID of annotationUIDs) {
    const annotation = getAnnotation(annotationUID);
    const polylineCopy = getPolyline(annotation);
    polylines.set(annotationUID, polylineCopy);
    if (annotation?.childAnnotationUIDs) {
      annotation.childAnnotationUIDs.forEach((childAnnotationUID) => {
        const childAnnotation = getAnnotation(childAnnotationUID);
        const polylineCopy = getPolyline(childAnnotation);
        polylines.set(childAnnotationUID, polylineCopy);
      });
    }
  }
  return polylines;
}

/**
 * Extracts segment polylines from a segmentation and converts them to canvas space coordinates.
 * This function retrieves all contour annotations for a specific segment and transforms their
 * world coordinates to canvas coordinates for rendering or processing.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @param segmentIndex - The index of the segment within the segmentation
 * @param viewport - Optional viewport to use for coordinate conversion. If not provided, will find the associated viewport
 * @returns A map of annotation UIDs to their canvas space polylines, or undefined if extraction fails
 */
export function extractSegmentPolylines(
  segmentationId: string,
  segmentIndex: number,
  viewport?: Types.IViewport
) {
  if (!viewport) {
    viewport = getViewportAssociatedToSegmentation(segmentationId);
  }
  if (!viewport) {
    return;
  }

  const segmentation = getSegmentation(segmentationId);
  if (!segmentation) {
    return;
  }

  if (!segmentation.representationData.Contour) {
    return;
  }

  const contourRepresentationData = segmentation.representationData
    .Contour as ContourSegmentationData;
  const { annotationUIDsMap } = contourRepresentationData;
  if (!annotationUIDsMap) {
    return;
  }

  if (!annotationUIDsMap.get(segmentIndex)) {
    return;
  }

  const polyLinesMap = getPolylinesMap(contourRepresentationData, segmentIndex);
  if (!polyLinesMap) {
    return;
  }
  const keys = Array.from(polyLinesMap?.keys());
  const polylinesCanvasMap = new Map();

  keys.forEach((key) =>
    polylinesCanvasMap.set(
      key,
      convertContourPolylineToCanvasSpace(polyLinesMap.get(key), viewport)
    )
  );
  return polylinesCanvasMap;
}
